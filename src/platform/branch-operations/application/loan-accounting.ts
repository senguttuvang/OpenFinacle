import { Clock, Effect, Schema } from "effect";
import {
  BankingError,
  type Session,
} from "../../banking-workspace/domain/banking";
import { Core } from "../../banking-workspace/domain/ports";
import { readLoanPostingEvidence } from "../../lending/application/loan-posting-evidence";
import {
  GlChart,
  journalPageHasExpectedCoverage,
  ProductAccounting,
} from "../domain/accounting";
import {
  type LoanAccountingEvidence,
  LoanJournalPage,
} from "../domain/loan-accounting";
import { branchCustomer } from "./branch-day";
import { readBranchLoan } from "./loans";
export const readLoanAccounting = (
  session: Session,
  customerId: string,
  loanId: number,
  offset = 0,
) =>
  Effect.gen(function* () {
    const { customer, scoped } = yield* branchCustomer(session, customerId);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000)
      return yield* Effect.fail(
        new BankingError({
          message: "Choose a valid loan journal page.",
          status: 400,
        }),
      );
    const owned = yield* readBranchLoan(session, customerId, loanId);
    const core = yield* Core;
    const errors: string[] = [];
    const read = <A, I>(
      name: string,
      path: string,
      schema: Schema.Schema<A, I>,
    ) =>
      core.request<unknown>("GET", path).pipe(
        Effect.flatMap(Schema.decodeUnknown(schema)),
        Effect.catchAll(() => {
          errors.push(`${name} is unavailable or invalid.`);
          return Effect.succeed(null);
        }),
      );
    const [chart, rawProduct, rawJournals, posting] = yield* Effect.all(
      [
        read("Core chart", "glaccounts", GlChart.pipe(Schema.maxItems(2000))),
        read(
          "Core loan product",
          `loanproducts/${owned.loan.loanProductId}`,
          ProductAccounting,
        ),
        read(
          "Core loan journals",
          `journalentries?loanId=${loanId}&limit=200&offset=${offset}&transactionDetails=true`,
          LoanJournalPage,
        ),
        readLoanPostingEvidence(
          scoped,
          loanId,
          customer.client_id,
          customer.account_id,
        ).pipe(
          Effect.catchAll(() => {
            errors.push(
              "Saved posting provenance is unavailable or invalid. No receipt link inferred.",
            );
            return Effect.succeed(null);
          }),
        ),
      ],
      { concurrency: 4 },
    );
    const coverage = {
      offset,
      limit: 200,
      sourceRows: rawJournals?.pageItems.length ?? 0,
      excludedRows: 0,
      hasMore: rawJournals
        ? offset + rawJournals.pageItems.length <
          rawJournals.totalFilteredRecords
        : false,
    };
    let journals = rawJournals;
    if (journals && !journalPageHasExpectedCoverage(journals, offset)) {
      errors.push(
        "Core journal page coverage is inconsistent. Journal evidence withheld.",
      );
      journals = null;
      coverage.hasMore = false;
    }
    if (
      journals?.pageItems.some(
        (row) => row.entityType?.id === 1 && row.entityId !== loanId,
      )
    ) {
      errors.push(
        "Core returned a different loan subledger. Journal evidence withheld.",
      );
      journals = null;
      coverage.hasMore = false;
    }
    if (journals) {
      const retained = journals.pageItems.filter(
        (row) => row.entityType?.id === 1 && row.entityId === loanId,
      );
      coverage.excludedRows = journals.pageItems.length - retained.length;
      if (coverage.excludedRows)
        errors.push(
          "Counterpart or unidentified journal rows excluded. Loan evidence is partial; reconciliation is not established.",
        );
      journals = { ...journals, pageItems: retained };
    }
    const product =
      rawProduct?.id === owned.loan.loanProductId ? rawProduct : null;
    if (rawProduct && !product)
      errors.push(
        "Core loan product identity differs. Product mapping withheld.",
      );
    return {
      customerId,
      branchId: owned.branchId,
      loanId,
      observedAt: yield* Clock.currentTimeMillis,
      loan: owned.loan,
      chart,
      product,
      journals,
      coverage,
      posting,
      errors,
    } satisfies LoanAccountingEvidence;
  });
