import type { LoanExposure } from "./loans";

export type LoanWorkFilters = {
  query: string;
  product: string;
  state: string;
  evidence: "all" | "overdue" | "missing" | "zero";
};
export const loanWorkOptions = (rows: LoanExposure["rows"]) => ({
  products: [
    ...new Map(
      rows.map(({ loan }) => [
        loan.loanProductId,
        loan.loanProductName ?? `Core product ${loan.loanProductId}`,
      ]),
    ),
  ],
  states: [
    ...new Map(
      rows.map(({ loan }) => [
        loan.status.id,
        loan.status.value ?? `Core state ${loan.status.id}`,
      ]),
    ),
  ],
});
export const filterLoanWork = (
  rows: LoanExposure["rows"],
  filters: LoanWorkFilters,
) => {
  const query = filters.query.trim().toLowerCase();
  return rows.filter(({ customerId, customerName, loan }) => {
    const summary = loan.summary;
    return (
      (!filters.product || String(loan.loanProductId) === filters.product) &&
      (!filters.state || String(loan.status.id) === filters.state) &&
      (filters.evidence === "all" ||
        (filters.evidence === "missing" && !summary) ||
        (filters.evidence === "overdue" &&
          !!summary &&
          summary.totalOverdue > 0) ||
        (filters.evidence === "zero" && summary?.totalOverdue === 0)) &&
      (!query ||
        [
          customerId,
          customerName,
          loan.accountNo,
          String(loan.id),
          String(loan.clientId),
          loan.loanProductName ?? "",
          loan.status.value ?? "",
        ].some((value) => value.toLowerCase().includes(query)))
    );
  });
};
