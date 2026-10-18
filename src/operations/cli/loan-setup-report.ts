import {
  type LoanSetupState,
  loanSetupNext,
  loanSetupPending,
} from "../../platform/lending/domain/origination/loan-setup";

// Public Fineract configuration parameter names only. Never emit saved Core prose,
// payload values, transport causes or credentials in administrative diagnostics.
const configurationFields = [
  "name",
  "shortName",
  "externalId",
  "description",
  "locale",
  "currencyCode",
  "digitsAfterDecimal",
  "inMultiplesOf",
  "principal",
  "minPrincipal",
  "maxPrincipal",
  "numberOfRepayments",
  "minNumberOfRepayments",
  "maxNumberOfRepayments",
  "repaymentEvery",
  "repaymentFrequencyType",
  "interestRatePerPeriod",
  "minInterestRatePerPeriod",
  "maxInterestRatePerPeriod",
  "interestRateFrequencyType",
  "amortizationType",
  "interestType",
  "interestCalculationPeriodType",
  "transactionProcessingStrategyCode",
  "accountingRule",
  "daysInMonthType",
  "daysInYearType",
  "inArrearsTolerance",
  "multiDisburseLoan",
  "isInterestRecalculationEnabled",
  "canDefineInstallmentAmount",
  "allowVariableInstallments",
  "isLinkedToFloatingInterestRates",
  "isFloatingInterestRateCalculationAllowed",
  "canUseForTopup",
  "enableDownPayment",
  "enableAutoRepaymentForDownPayment",
  "isEqualAmortization",
  "isRatesEnabled",
  "interestRecognitionOnDisbursementDate",
  "enableIncomeCapitalization",
  "enableBuyDownFee",
  "holdGuaranteeFunds",
  "allowPartialPeriodInterestCalculation",
  "includeInBorrowerCycle",
  "useBorrowerCycle",
  "loanScheduleType",
  "loanScheduleProcessingType",
  "repaymentStartDateType",
  "charges",
  "loanType",
  "submittedOnDate",
  "expectedDisbursementDate",
  "clientId",
  "productId",
  "loanTermFrequency",
  "loanTermFrequencyType",
  "period",
  "dueDate",
  "fundSourceAccountId",
  "loanPortfolioAccountId",
  "transfersInSuspenseAccountId",
  "overpaymentLiabilityAccountId",
  "interestOnLoanAccountId",
  "incomeFromFeeAccountId",
  "incomeFromPenaltyAccountId",
  "incomeFromRecoveryAccountId",
  "writeOffAccountId",
  "goodwillCreditAccountId",
  "chargeOffExpenseAccountId",
  "chargeOffFraudExpenseAccountId",
  "incomeFromChargeOffInterestAccountId",
  "incomeFromChargeOffFeesAccountId",
  "incomeFromChargeOffPenaltyAccountId",
  "incomeFromGoodwillCreditInterestAccountId",
  "incomeFromGoodwillCreditFeesAccountId",
  "incomeFromGoodwillCreditPenaltyAccountId",
];
const loanValidationHints = (failure: string) => ({
  validation_fields: configurationFields.filter((field) =>
    new RegExp(`\\b${field}\\b`).test(failure),
  ),
  validation_checks: [
    ...(/not supported|unsupported/i.test(failure)
      ? ["unsupported-parameter"]
      : []),
    ...(/mandatory|required|not.*null|not.*blank/i.test(failure)
      ? ["required-field"]
      : []),
    ...(/invalid|must|between|greater than|less than|out of range/i.test(
      failure,
    )
      ? ["invalid-value"]
      : []),
  ],
});
export const loanSetupReport = (state: LoanSetupState) => {
  const last = state.events.at(-1);
  return {
    version: state.version,
    next: loanSetupNext(state),
    pending: loanSetupPending(state)?.status ?? null,
    history_events: state.events.length,
    complete: loanSetupNext(state) === null,
    last_status: last?.status ?? null,
    ...loanValidationHints(last?.status === "failed" ? last.message : ""),
  };
};
export const loanAdminHttpFailure = (status: number, input: unknown) => {
  const uncertain =
    typeof input === "object" &&
    input !== null &&
    "uncertain" in input &&
    input.uncertain === true;
  const message =
    !uncertain &&
    typeof input === "object" &&
    input !== null &&
    "error" in input &&
    typeof input.error === "string"
      ? input.error
      : "";
  return new Error(
    `Loan administration HTTP ${status}; ${JSON.stringify({ uncertain, ...loanValidationHints(message) })}. Read the saved checkpoint and inspect before any create; no request was retried.`,
  );
};
