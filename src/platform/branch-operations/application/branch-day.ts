import { Clock, Effect, Schema } from "effect";
import {
  type Audit,
  type BankingCommand,
  BankingError,
  bankingDate,
  type ServiceRequest,
  type Session,
} from "../../banking-workspace/domain/banking";
import { Core, Store } from "../../banking-workspace/domain/ports";
import type { RegisteredCustomer } from "../../customers/domain/customer-registry";
import type {
  BranchAccount,
  BranchDay,
  Responsibility,
} from "../domain/branch-day";
import { BranchAccountEvidence } from "../domain/core-account";

const fail = (message: string, status = 403) =>
  Effect.fail(new BankingError({ message, status }));
const branchScope = (session: Session) =>
  Effect.gen(function* () {
    if (session.role === "customer")
      return yield* fail("Branch records require a staff demo persona.");
    const store = yield* Store;
    const member = yield* store.one<RegisteredCustomer>(
      "SELECT * FROM customers WHERE bank_id=? AND status='active'",
      session.bank_id,
    );
    if (!member)
      return yield* fail("Choose a registered branch relationship first.", 409);
    return member.branch_id;
  });
export const branchCustomer = (session: Session, customerId: string) =>
  Effect.gen(function* () {
    const branch = yield* branchScope(session);
    const store = yield* Store;
    const customer = yield* store.one<RegisteredCustomer>(
      "SELECT * FROM customers WHERE id=? AND branch_id=? AND status='active'",
      customerId,
      branch,
    );
    if (!customer)
      return yield* fail(
        "Relationship is outside this branch or unavailable.",
        404,
      );
    return {
      customer,
      scoped: { ...session, bank_id: customer.bank_id },
      branch,
    };
  });
export const readBranchDay = (session: Session) =>
  Effect.gen(function* () {
    const branchId = yield* branchScope(session);
    const store = yield* Store;
    const core = yield* Core;
    const observedAt = yield* Clock.currentTimeMillis;
    const customers = yield* store.all<RegisteredCustomer>(
      "SELECT * FROM customers WHERE branch_id=? AND status='active' ORDER BY display_name,id LIMIT 101",
      branchId,
    );
    const relationships = yield* Effect.forEach(
      customers.slice(0, 100),
      (customer) =>
        Effect.gen(function* () {
          const observed = yield* core
            .request<BranchAccount>(
              "GET",
              `savingsaccounts/${customer.account_id}?associations=transactions`,
            )
            .pipe(
              Effect.tap((account) =>
                Schema.decodeUnknown(BranchAccountEvidence)(account).pipe(
                  Effect.mapError(
                    () =>
                      new BankingError({
                        message: "Malformed core account evidence.",
                        status: 503,
                      }),
                  ),
                ),
              ),
              Effect.flatMap((account) =>
                account.id === customer.account_id &&
                account.clientId === customer.client_id &&
                account.accountNo === customer.account_no
                  ? Effect.succeed({ account, error: null })
                  : fail(
                      "Core account ownership does not match registration.",
                      503,
                    ),
              ),
              Effect.catchAll((error) =>
                Effect.succeed({ account: null, error: error.message }),
              ),
            );
          const commands = yield* store.all<BankingCommand>(
            "SELECT * FROM commands WHERE bank_id=? ORDER BY created_at DESC,rowid DESC",
            customer.bank_id,
          );
          const requests = yield* store.all<ServiceRequest>(
            "SELECT * FROM service_requests WHERE bank_id=? ORDER BY created_at DESC",
            customer.bank_id,
          );
          const audit = yield* store.all<Audit>(
            "SELECT * FROM audit WHERE bank_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100",
            customer.bank_id,
          );
          return {
            customer,
            ...observed,
            commands,
            requests,
            audit,
            observedAt: yield* Clock.currentTimeMillis,
          };
        }),
      { concurrency: 3 },
    );
    const responsibilities = yield* store.all<Responsibility>(
      "SELECT command_id,owner,version,updated_at FROM branch_responsibilities WHERE branch_id=?",
      branchId,
    );
    return {
      branchId,
      businessDate: bankingDate(observedAt),
      observedAt,
      relationships,
      responsibilities,
      truncated: customers.length > 100,
    } satisfies BranchDay;
  });
export const assignResponsibility = (
  session: Session,
  customerId: string,
  commandId: string,
  owner: Responsibility["owner"],
  version: number,
) =>
  Effect.gen(function* () {
    const { scoped, branch } = yield* branchCustomer(session, customerId);
    const store = yield* Store;
    if (
      !(yield* store.one(
        "SELECT id FROM commands WHERE id=? AND bank_id=?",
        commandId,
        scoped.bank_id,
      ))
    )
      return yield* fail("Instruction is outside this relationship.", 404);
    const updated =
      version === 0
        ? yield* store.run(
            "INSERT INTO branch_responsibilities(branch_id,command_id,owner,version) VALUES(?,?,?,1) ON CONFLICT(branch_id,command_id) DO NOTHING",
            branch,
            commandId,
            owner,
          )
        : yield* store.run(
            "UPDATE branch_responsibilities SET owner=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE branch_id=? AND command_id=? AND version=?",
            owner,
            branch,
            commandId,
            version,
          );
    if (!updated)
      return yield* fail(
        "Responsibility changed. Refresh before assigning again.",
        409,
      );
    return yield* store.one<Responsibility>(
      "SELECT command_id,owner,version,updated_at FROM branch_responsibilities WHERE branch_id=? AND command_id=?",
      branch,
      commandId,
    );
  });
