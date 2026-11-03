import { Clock, Effect, Schema } from "effect";
import {
  BankingError,
  bankingDate,
  type Session,
} from "../../banking-workspace/domain/banking";
import { Core, Store } from "../../banking-workspace/domain/ports";
import type { RegisteredCustomer } from "../../customers/domain/customer-registry";
import { branchCustomerLimit } from "../domain/branch-day";
import {
  CoreLoanDetail,
  CoreLoanPage,
  type LoanEnquiry,
  type LoanExposure,
} from "../domain/loans";
import { branchCustomer } from "./branch-day";

const fail = (message: string, status = 503) =>
  Effect.fail(new BankingError({ message, status }));
export const readLoanExposure = (session: Session, customerId: string) =>
  Effect.gen(function* () {
    const { branch } = yield* branchCustomer(session, customerId);
    const store = yield* Store;
    const core = yield* Core;
    const startedAt = yield* Clock.currentTimeMillis;
    const customers = yield* store.all<RegisteredCustomer>(
      "SELECT * FROM customers WHERE branch_id=? AND status='active' ORDER BY display_name,id LIMIT ?",
      branch,
      branchCustomerLimit,
    );
    const count = yield* store.one<{ total: number }>(
      "SELECT count(*) AS total FROM customers WHERE branch_id=? AND status='active'",
      branch,
    );
    if (!count || count.total < customers.length)
      return yield* fail("Registered client coverage cannot be established.");
    const results = yield* Effect.forEach(
      customers,
      (customer) =>
        core
          .request<unknown>(
            "GET",
            `loans?clientId=${customer.client_id}&limit=50&offset=0`,
          )
          .pipe(
            Effect.flatMap(Schema.decodeUnknown(CoreLoanPage)),
            Effect.flatMap((page) =>
              page.pageItems.every(
                (loan) => loan.clientId === customer.client_id,
              )
                ? Effect.succeed(page)
                : fail("Core client ownership mismatch."),
            ),
            Effect.map((page) => ({ customer, page, error: null })),
            Effect.catchAll(() =>
              Effect.succeed({
                customer,
                page: null,
                error:
                  "Core loan list is unavailable, invalid or does not match this registered client.",
              }),
            ),
          ),
      { concurrency: 8 },
    );
    const errors: { customerId: string; message: string }[] = [];
    let limited = customers.length !== count.total;
    let reported = 0;
    const rows: LoanExposure["rows"][number][] = [];
    for (const { customer, page, error } of results) {
      if (!page) {
        errors.push({
          customerId: customer.id,
          message: error ?? "Core list unavailable.",
        });
        continue;
      }
      reported += page.totalFilteredRecords;
      limited ||= page.totalFilteredRecords !== page.pageItems.length;
      for (const loan of page.pageItems)
        rows.push({
          customerId: customer.id,
          customerName: customer.display_name,
          loan,
        });
    }
    limited ||= rows.length > 500;
    if (new Set(rows.map((r) => r.loan.id)).size !== rows.length)
      return yield* fail(
        "Duplicate Core loan identities. Exposure evidence withheld.",
      );
    const missingSummary = rows.some((r) => !r.loan.summary);
    if (missingSummary)
      errors.push({
        customerId: "",
        message:
          "Some Core loan summaries were not returned. Product totals are unavailable.",
      });
    return {
      branchId: branch,
      applicationDate: bankingDate(startedAt),
      startedAt,
      observedAt: yield* Clock.currentTimeMillis,
      complete: !limited && errors.length === 0,
      coverage: {
        totalCustomers: count.total,
        loadedCustomers: customers.length,
        clientLimit: branchCustomerLimit,
        loanLimitPerClient: 50,
        rowLimit: 500,
        limited,
        reportedLoans: results.some((r) => !r.page) ? null : reported,
      },
      rows: rows.slice(0, 500),
      errors,
    } satisfies LoanExposure;
  });
export const readBranchLoan = (
  session: Session,
  customerId: string,
  loanId: number,
) =>
  Effect.gen(function* () {
    const { customer, branch } = yield* branchCustomer(session, customerId);
    if (!Number.isSafeInteger(loanId) || loanId <= 0)
      return yield* fail("Choose a valid Core loan identifier.", 400);
    const core = yield* Core;
    const loan = yield* core
      .request<unknown>(
        "GET",
        `loans/${loanId}?associations=repaymentSchedule,transactions`,
      )
      .pipe(
        Effect.flatMap(Schema.decodeUnknown(CoreLoanDetail)),
        Effect.mapError(
          () =>
            new BankingError({
              message:
                "Core loan detail is unavailable or invalid. Evidence withheld.",
              status: 503,
            }),
        ),
      );
    if (loan.id !== loanId || loan.clientId !== customer.client_id)
      return yield* fail(
        "Core loan ownership does not match the registered client. Evidence withheld.",
      );
    return {
      customerId,
      branchId: branch,
      observedAt: yield* Clock.currentTimeMillis,
      loan: {
        ...loan,
        repaymentSchedule: loan.repaymentSchedule
          ? {
              ...loan.repaymentSchedule,
              periods: loan.repaymentSchedule.periods.map(
                (period, position) => ({ ...period, sourceLine: position + 1 }),
              ),
            }
          : loan.repaymentSchedule,
      },
    } satisfies LoanEnquiry;
  });
