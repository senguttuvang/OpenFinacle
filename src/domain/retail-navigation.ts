/** Menu labels observed in the authenticated reference on 18 October 2026.
 * Destinations describe OpenFinacle capabilities, never reference-bank URLs.
 */
type RetailDestination =
  | {
      kind: "workspace";
      view:
        | "overview"
        | "accounts"
        | "profile"
        | "transfer"
        | "services"
        | "deposits"
        | "loans"
        | "planning";
      section?: "fixed" | "recurring";
    }
  | {
      kind: "unavailable";
      related?: "cards" | "services" | "planning" | "transfer" | "deposits";
    };

export interface RetailMenuItem {
  readonly id: string;
  readonly label: string;
  readonly destination: RetailDestination;
}
interface RetailMenuFamily {
  readonly id: string;
  readonly label: string;
  readonly items: readonly RetailMenuItem[];
}
const item = (
  id: string,
  label: string,
  destination: RetailDestination,
): RetailMenuItem => ({ id, label, destination });
const unavailable = (
  id: string,
  label: string,
  related?: Extract<RetailDestination, { kind: "unavailable" }>["related"],
) => item(id, label, { kind: "unavailable", ...(related ? { related } : {}) });

export const retailMenu: readonly RetailMenuFamily[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      item("my-view", "My View", { kind: "workspace", view: "overview" }),
      item("personal-details", "Personal Details", {
        kind: "workspace",
        view: "profile",
      }),
      item("know-your-spends", "Know your spends", {
        kind: "workspace",
        view: "planning",
      }),
    ],
  },
  {
    id: "accounts",
    label: "Accounts",
    items: [
      item("bank-accounts", "Bank Accounts", {
        kind: "workspace",
        view: "accounts",
      }),
      unavailable("ifinance", "iFinance", "planning"),
      unavailable("smart-wire", "Smart Wire", "transfer"),
      item("financial-dashboard", "Power your Financial Dashboard", {
        kind: "workspace",
        view: "planning",
      }),
    ],
  },
  {
    id: "payments",
    label: "Payment & Transfer",
    items: [
      item("funds-transfer", "Funds Transfer", {
        kind: "workspace",
        view: "transfer",
      }),
      unavailable("pay-bills", "Pay Bills", "transfer"),
      unavailable("fastag", "Buy / Recharge Fastag"),
      unavailable("inward-remittance", "Inward Remittance", "transfer"),
      unavailable("payments-tax-center", "Tax Center", "services"),
      unavailable("wire-transfer", "Wire Transfer", "transfer"),
    ],
  },
  {
    id: "deposits",
    label: "Deposits",
    items: [
      item("fixed-deposits", "Fixed Deposits", {
        kind: "workspace",
        view: "deposits",
        section: "fixed",
      }),
      item("recurring-deposits", "Recurring Deposits", {
        kind: "workspace",
        view: "deposits",
        section: "recurring",
      }),
      unavailable("iwish", "Flexible RD (iWish)", "deposits"),
      unavailable("bank-guarantee", "Bank Guarantee", "services"),
    ],
  },
  {
    id: "cards",
    label: "Cards",
    items: [
      unavailable("credit-cards", "Credit Cards", "cards"),
      unavailable("forex-card", "Forex Prepaid Card", "cards"),
      unavailable("prepaid-card", "Prepaid Card", "cards"),
    ],
  },
  {
    id: "loans",
    label: "Loans",
    items: [
      item("my-loans", "My Loans", { kind: "workspace", view: "loans" }),
      item("apply-online", "Apply online", {
        kind: "workspace",
        view: "loans",
      }),
      unavailable("cibil", "CIBIL"),
    ],
  },
  {
    id: "investments",
    label: "Investments",
    items: [
      unavailable("invest-online", "Invest Online", "planning"),
      unavailable("mutual-funds", "Buy Mutual Funds", "planning"),
      unavailable("demat", "Demat", "services"),
      unavailable("icici-direct", "ICICI Direct (3-in-1)", "planning"),
      unavailable("nps", "National Pension System", "planning"),
      unavailable("ppf", "PPF Accounts", "planning"),
      unavailable("ssy", "SSY Accounts", "planning"),
      unavailable(
        "senior-savings",
        "Senior Citizen Savings Scheme",
        "planning",
      ),
    ],
  },
  {
    id: "insurance",
    label: "Insurance",
    items: [
      unavailable("my-insurance", "My Insurance", "planning"),
      unavailable("term-life", "Term Life Insurance", "planning"),
      unavailable("motor-insurance", "Motor/Two Wheeler Insurance", "planning"),
      unavailable("travel-insurance", "Travel Insurance", "planning"),
      unavailable("pmsby", "PMSBY Scheme"),
      unavailable("pmjjby", "PMJJBY Scheme"),
    ],
  },
  {
    id: "customer-service",
    label: "Customer Service",
    items: [
      item("service-request", "Service Request", {
        kind: "workspace",
        view: "services",
      }),
      unavailable("smart-lock", "Smart Lock", "cards"),
      unavailable("mailbox", "My Mailbox", "services"),
      unavailable("service-tax-center", "Tax Center", "services"),
      unavailable("digi-locker", "Digi Locker"),
      unavailable("campus-power", "Campus Power"),
      unavailable("complaints", "Complaints", "services"),
    ],
  },
];
