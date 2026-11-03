import type { BranchDay } from "../../platform/branch-operations/domain/branch-day";
export function branchDayFixture() {
  const day: BranchDay = {
    reviewFixture: true,
    branchId: "synthetic-adyar",
    businessDate: "2026-11-03",
    observedAt: 1793728800000,
    truncated: false,
    responsibilities: [],
    relationships: ["Mira Krishnan", "Northstar Trading"].map(
      (name, index) => ({
        customer: {
          id: `customer-${index}`,
          branch_id: "synthetic-adyar",
          bank_id: `bank-${index}`,
          reference: `SYN-${index}`,
          display_name: name,
          client_id: index + 1,
          account_id: index + 1,
          account_no: `SYN000${index}`,
          origin: "seed",
          status: "active",
        },
        account: {
          id: index + 1,
          clientId: index + 1,
          clientName: name,
          accountNo: `SYN000${index}`,
          currency: { code: "INR", decimalPlaces: 2 },
          status: { id: 300, value: "Active" },
          summary: { accountBalance: 12000 },
          savingsProductName: "Everyday Savings",
          savingsProductId: 1,
          transactions: [],
        },
        error: null,
        requests: [],
        audit: [],
        observedAt: 1793728800000,
        commands: [
          {
            id: `instruction-${index}`,
            bank_id: `bank-${index}`,
            key: `original-key-${index}`,
            kind: "deposit",
            status: "pending",
            amount_minor: 10000,
            description: "Counter cash instruction",
            maker: "officer",
            approver: null,
            core_id: null,
            account_id: index + 1,
            payload: '{"kind":"deposit","amount":100}',
            error: null,
            created_at: "2026-11-03 10:00:00",
          },
        ],
      }),
    ),
  };

  return day;
}
