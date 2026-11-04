import { Clock, Effect, Schema } from "effect";
import {
  BankingError,
  type Session,
} from "../../banking-workspace/domain/banking";
import { Core } from "../../banking-workspace/domain/ports";
import {
  InrJournalPage,
  journalPageHasExpectedCoverage,
} from "../domain/accounting";
import type { BranchRelationship } from "../domain/branch-day";
import {
  CoreClientOffice,
  CoreGlIdentity,
  CoreLoanOwner,
  exactCashInstruction,
  RegisteredGlEvidence,
} from "../domain/registered-gl";
import { branchCustomer, readBranchDay } from "./branch-day";

const invalid = (
  message = "Native GL evidence is unavailable or invalid.",
  status = 503,
) => Effect.fail(new BankingError({ message, status }));
const safeId = (v: number) => Number.isSafeInteger(v) && v > 0;
const uniqueOwners = (
  rows: readonly BranchRelationship[],
  key: (r: BranchRelationship) => number,
) => {
  const owners = new Map<number, BranchRelationship | null>();
  for (const row of rows) {
    const value = key(row);
    owners.set(value, owners.has(value) ? null : row);
  }
  return owners;
};
const eligible = (r: BranchRelationship) =>
  !!r.account &&
  safeId(r.customer.account_id) &&
  safeId(r.customer.client_id) &&
  r.account.id === r.customer.account_id &&
  r.account.clientId === r.customer.client_id &&
  r.account.accountNo === r.customer.account_no &&
  r.account.currency?.code === "INR" &&
  r.account.currency.decimalPlaces === 2;
export const readRegisteredGl = (
  session: Session,
  customerId: string,
  glId: number,
  offset = 0,
) =>
  Effect.gen(function* () {
    const { customer, branch } = yield* branchCustomer(session, customerId);
    if (
      !safeId(glId) ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 100000
    )
      return yield* invalid("Choose a valid GL and provider page.", 400);
    const startedAt = yield* Clock.currentTimeMillis;
    const day = yield* readBranchDay(session);
    const savings = uniqueOwners(
        day.relationships,
        (r) => r.customer.account_id,
      ),
      clients = uniqueOwners(day.relationships, (r) => r.customer.client_id);
    const anchor = savings.get(customer.account_id);
    if (
      day.branchId !== branch ||
      anchor?.customer.id !== customerId ||
      !eligible(anchor)
    )
      return yield* invalid(
        "The anchor is outside the verified loaded account scope.",
      );
    const core = yield* Core;
    const read = <A, I>(path: string, schema: Schema.Schema<A, I>) =>
      core.request<unknown>("GET", path).pipe(
        Effect.flatMap(Schema.decodeUnknown(schema)),
        Effect.mapError(
          () =>
            new BankingError({
              message: "Native GL evidence is unavailable or invalid.",
              status: 503,
            }),
        ),
      );
    const [client, gl] = yield* Effect.all(
      [
        read(
          `clients/${customer.client_id}?fields=id,officeId,officeName`,
          CoreClientOffice,
        ),
        read(`glaccounts/${glId}`, CoreGlIdentity),
      ],
      { concurrency: 2 },
    );
    if (client.id !== customer.client_id || gl.id !== glId)
      return yield* invalid(
        "Native client or GL identity differs. Evidence withheld.",
      );
    const page = yield* read(
      `journalentries?officeId=${client.officeId}&glAccountId=${glId}&limit=200&offset=${offset}&orderBy=id&sortOrder=DESC&transactionDetails=true`,
      InrJournalPage,
    );
    if (
      !journalPageHasExpectedCoverage(page, offset) ||
      page.pageItems.some(
        (r, i) =>
          r.officeId !== client.officeId ||
          r.glAccountId !== glId ||
          (i > 0 && page.pageItems[i - 1].id <= r.id),
      )
    )
      return yield* invalid(
        "Native GL office, identity, ordering or page coverage differs. Evidence withheld.",
      );
    const errors: string[] = [];
    const eligibleAccounts = [...savings.values()].filter(
      (r) => r && eligible(r),
    ).length;
    const registryLimited =
      day.truncated || eligibleAccounts !== day.relationships.length;
    const ids = [
      ...new Set(
        page.pageItems.flatMap((r) =>
          r.manualEntry === false &&
          r.entityType?.id === 1 &&
          r.entityId !== undefined &&
          safeId(r.entityId)
            ? [r.entityId]
            : [],
        ),
      ),
    ];
    let failures = 0;
    const loanOwners = new Map(
      yield* Effect.forEach(
        ids.slice(0, 50),
        (loanId) =>
          read(`loans/${loanId}?fields=id,clientId`, CoreLoanOwner).pipe(
            Effect.flatMap((loan) =>
              loan.id === loanId ? Effect.succeed(loan) : invalid(),
            ),
            Effect.map(
              (loan) => [loanId, clients.get(loan.clientId) ?? null] as const,
            ),
            Effect.catchAll(() => {
              failures++;
              return Effect.succeed([loanId, null] as const);
            }),
          ),
        { concurrency: 8 },
      ),
    );
    const rows: RegisteredGlEvidence["rows"][number][] = [];
    for (const journal of page.pageItems) {
      if (
        journal.manualEntry !== false ||
        journal.entityId === undefined ||
        !safeId(journal.entityId)
      )
        continue;
      const entityId = journal.entityId;
      const owner =
        journal.entityType?.id === 2
          ? savings.get(entityId)
          : journal.entityType?.id === 1
            ? loanOwners.get(entityId)
            : null;
      if (!owner || !eligible(owner)) continue;
      const family =
        journal.entityType?.id === 2 ? ("Savings" as const) : ("Loan" as const);
      rows.push({
        customerId: owner.customer.id,
        customerName: owner.customer.display_name,
        family,
        accountId: entityId,
        journal,
        originalCommandId:
          family === "Savings" && !day.coverage.workflowLimited
            ? exactCashInstruction(
                owner.commands,
                owner.customer.bank_id,
                entityId,
                journal.transactionDetails?.transactionId,
              )
            : null,
      });
    }
    const excludedRows = page.pageItems.length - rows.length;
    if (excludedRows)
      errors.push(
        "Unregistered, manual, ambiguous or unverifiable ownership rows excluded. This is a partial registered-relationship view, not a complete Core office ledger.",
      );
    if (registryLimited)
      errors.push(
        "Registered account ownership coverage is incomplete; unavailable relationships cannot be included.",
      );
    if (day.coverage.workflowLimited)
      errors.push(
        "Saved workflow coverage is limited. Original instruction links withheld.",
      );
    if (ids.length > 50 || failures)
      errors.push(
        "Some native loan ownership could not be verified within the bounded read; its rows are withheld.",
      );
    return yield* Schema.decodeUnknown(RegisteredGlEvidence)({
      branchId: branch,
      anchorCustomerId: customerId,
      applicationDate: day.businessDate,
      startedAt,
      observedAt: yield* Clock.currentTimeMillis,
      registryStartedAt: day.observedAt,
      office: { id: client.officeId, name: client.officeName },
      gl,
      rows,
      errors,
      coverage: {
        offset,
        limit: 200,
        sourceRows: page.pageItems.length,
        excludedRows,
        hasMore: offset + page.pageItems.length < page.totalFilteredRecords,
        totalProviderRows: page.totalFilteredRecords,
        registeredCustomers: day.coverage.totalCustomers,
        loadedCustomers: day.relationships.length,
        eligibleAccounts,
        registryLimited,
        workflowLimited: day.coverage.workflowLimited,
        loanOwnershipLimit: 50,
        loanOwnershipLimited: ids.length > 50,
        loanOwnershipFailures: failures,
      },
    }).pipe(
      Effect.mapError(
        () =>
          new BankingError({
            message: "Scoped GL evidence could not be verified.",
            status: 503,
          }),
      ),
    );
  });
