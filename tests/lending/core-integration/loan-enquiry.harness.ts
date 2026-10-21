import { Effect, Layer } from "effect";
import { BankingError } from "../../../src/platform/banking-workspace/domain/banking";
import { Core } from "../../../src/platform/banking-workspace/domain/ports";
import {
  LoanEnquiry,
  type LoanLookup,
} from "../../../src/platform/lending/domain/origination/loan-engine";
import { loanEnquiryLayer } from "../../../src/platform/lending/infrastructure/loan-enquiry";

export function createHarness() {
  const lookup: LoanLookup = {
    owner: {
      bank_id: "example-bank",
      client_id: 12,
      product_id: 11,
      savings_account_id: 13,
    },
    terms: {
      product: "core-personal",
      principal: 12000,
      months: 12,
      purpose: "education",
      monthly_income: 30000,
      monthly_commitments: 5000,
      monthly_expenses: 10000,
    },
    expected_disbursement_date: "2026-10-17",
    external_id: "of-loan-example",
    core_id: 21,
  };
  const external = "of-disburse-example";
  const currency = { code: "INR", decimalPlaces: 2 };
  const basicTransfer = {
    id: 51,
    reversed: false,
    currency,
    transferAmount: 12000,
    transferDate: [2026, 10, 17],
  };
  const transaction = {
    id: 31,
    type: { id: 1 },
    currency,
    date: [2026, 10, 17],
    amount: 12000,
    manuallyReversed: false,
    externalId: external,
    transfer: basicTransfer,
  };
  const raw = {
    id: 21,
    externalId: lookup.external_id,
    clientId: 12,
    loanProductId: 11,
    loanType: { id: 1 },
    linkedAccount: { id: 13 },
    currency,
    principal: 12000,
    proposedPrincipal: 12000,
    approvedPrincipal: 12000,
    termFrequency: 12,
    termPeriodFrequencyType: { id: 2 },
    numberOfRepayments: 12,
    repaymentEvery: 1,
    repaymentFrequencyType: { id: 2 },
    interestRatePerPeriod: 1,
    interestRateFrequencyType: { id: 2 },
    annualInterestRate: 12,
    amortizationType: { id: 1 },
    interestType: { id: 0 },
    interestCalculationPeriodType: { id: 1 },
    transactionProcessingStrategyCode: "mifos-standard-strategy",
    multiDisburseLoan: false,
    isTopup: false,
    isInterestRecalculationEnabled: false,
    isFloatingInterestRate: false,
    status: {
      id: 300,
      pendingApproval: false,
      waitingForDisbursal: false,
      active: true,
      closed: false,
    },
    timeline: {
      submittedOnDate: [2026, 10, 17],
      approvedOnDate: [2026, 10, 17],
      expectedDisbursementDate: [2026, 10, 17],
      actualDisbursementDate: [2026, 10, 17],
    },
    summary: {
      principalDisbursed: 12000,
      principalOutstanding: 12000,
      totalOutstanding: 13200,
      feeChargesCharged: 0,
      penaltyChargesCharged: 0,
    },
    repaymentSchedule: {
      currency,
      totalPrincipalDisbursed: 12000,
      totalPrincipalExpected: 12000,
      totalInterestCharged: 1200,
      totalFeeChargesCharged: 0,
      totalPenaltyChargesCharged: 0,
      totalRepaymentExpected: 13200,
      periods: [
        {
          period: 0,
          dueDate: [2026, 10, 17],
          principalDisbursed: 12000,
          feeChargesDue: 0,
          totalDueForPeriod: 0,
        },
        ...Array.from({ length: 12 }, (_, i) => {
          const d = new Date(Date.UTC(2026, 10 + i, 17));
          return {
            period: i + 1,
            dueDate: [d.getUTCFullYear(), d.getUTCMonth() + 1, 17],
            principalDue: 1000,
            interestDue: 100,
            feeChargesDue: 0,
            penaltyChargesDue: 0,
            totalDueForPeriod: 1100,
          };
        }),
      ],
    },
    transactions: [transaction],
    charges: null,
  };
  const transfer = {
    ...basicTransfer,
    // Direct AccountTransferData uses Jackson ISO_LOCAL_DATE; embedded legacy loan data uses arrays.
    transferDate: "2026-10-17",
    fromClient: { id: 12 },
    toClient: { id: 12 },
    fromAccountType: { id: 1 },
    toAccountType: { id: 2 },
    fromAccount: { id: 21 },
    toAccount: { id: 13 },
  };
  const loanPath =
    "loans/external-id/of-loan-example?associations=repaymentSchedule,transactions,charges,linkedAccount";
  const harness = (
    loan: unknown = raw,
    fullTransfer: unknown = transfer,
    failedPath?: string,
    failedStatus = 422,
  ) => {
    const calls: { method: string; path: string }[] = [];
    const core = Layer.succeed(Core, {
      request: <T>(method: string, path: string) =>
        Effect.gen(function* () {
          calls.push({ method, path });
          if (
            method !== "GET" ||
            (path !== loanPath && path !== "accounttransfers/51")
          )
            return yield* Effect.fail(
              new BankingError({
                message: "Unexpected route or write",
                status: 500,
              }),
            );
          if (path === failedPath)
            return yield* Effect.fail(
              new BankingError({
                message: "Core object unavailable",
                status: failedStatus,
              }),
            );
          return structuredClone(path === loanPath ? loan : fullTransfer) as T;
        }),
    });
    const task = (proof: boolean, input = lookup, transactionId = external) =>
      Effect.gen(function* () {
        const enquiry = yield* LoanEnquiry;
        return proof
          ? yield* enquiry.confirmDisbursement({
              ...input,
              transaction_external_id: transactionId,
            })
          : yield* enquiry.inspect(input);
      }).pipe(Effect.provide(loanEnquiryLayer), Effect.provide(core));
    return {
      calls,
      statement: () =>
        Effect.runPromise(
          Effect.gen(function* () {
            return yield* (yield* LoanEnquiry).statement(lookup);
          }).pipe(Effect.provide(loanEnquiryLayer), Effect.provide(core)),
        ),
      statementDenied: () =>
        Effect.runPromise(
          Effect.gen(function* () {
            return yield* (yield* LoanEnquiry).statement(lookup);
          }).pipe(
            Effect.provide(loanEnquiryLayer),
            Effect.provide(core),
            Effect.flip,
          ),
        ),
      inspect: (input = lookup) => Effect.runPromise(task(false, input)),
      proof: () => Effect.runPromise(task(true)),
      denied: (proof = false, input = lookup, transactionId = external) =>
        Effect.runPromise(task(proof, input, transactionId).pipe(Effect.flip)),
    };
  };
  const statementRaw = {
    ...raw,
    summary: {
      ...raw.summary,
      currency,
      principalPaid: 0,
      interestPaid: 0,
      totalRepayment: 0,
      interestOutstanding: 1200,
      feeChargesPaid: 0,
      penaltyChargesPaid: 0,
      feeChargesOutstanding: 0,
      penaltyChargesOutstanding: 0,
    },
    transactions: [
      {
        ...transaction,
        loanId: 21,
        externalLoanId: lookup.external_id,
        principalPortion: 0,
        interestPortion: 0,
        feeChargesPortion: 0,
        penaltyChargesPortion: 0,
        overpaymentPortion: 0,
        unrecognizedIncomePortion: 0,
        reversedOnDate: null,
      },
    ],
  };
  return {
    get lookup() {
      return lookup;
    },
    get external() {
      return external;
    },
    get currency() {
      return currency;
    },
    get basicTransfer() {
      return basicTransfer;
    },
    get transaction() {
      return transaction;
    },
    get raw() {
      return raw;
    },
    get transfer() {
      return transfer;
    },
    get loanPath() {
      return loanPath;
    },
    get harness() {
      return harness;
    },
    get statementRaw() {
      return statementRaw;
    },
  };
}
