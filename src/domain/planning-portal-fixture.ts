import type { Account } from "./banking";

/** Explicit local UI fixture, never a core account or a fallback for failed banking calls. */
export const planningPortalFixture = () => {
  const account = (id: number, name: string): Account => ({
    id,
    accountNo: `LOCAL-PLANNING-FIXTURE-${id}`,
    clientId: id,
    clientName: name,
    status: { id: 300, value: "Synthetic local fixture", active: true },
    summary: { accountBalance: 0, availableBalance: 0 },
    transactions: [],
    currency: { code: "INR", decimalPlaces: 2 },
  });
  return {
    account: account(1, "Local synthetic portal fixture"),
    recipient: account(2, "Invented preview recipient"),
    employer: account(3, "Invented preview employer"),
  };
};
