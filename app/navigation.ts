import type { CustomerJourney, Role } from "../src/domain/banking";

export type View =
  | "overview"
  | "accounts"
  | "profile"
  | "application"
  | "transfer"
  | "statements"
  | "services"
  | "cards"
  | "deposits"
  | "loans"
  | "cash"
  | "approvals"
  | "operations"
  | "audit";

export const viewLabels: Record<View, string> = {
  overview: "Overview",
  accounts: "My accounts",
  profile: "My profile",
  application: "Account opening",
  transfer: "Pay & transfer",
  statements: "Statements",
  services: "Service requests",
  cards: "Cards",
  deposits: "Deposits",
  loans: "Loans",
  cash: "Cash & salary",
  approvals: "Approval inbox",
  operations: "Bank operations",
  audit: "Activity & audit",
};

const staffAliases: Partial<Record<View, string>> = {
  accounts: "ACCBAL",
  application: "OAAC",
  cash: "TM",
  approvals: "FTI",
  operations: "AFSM",
  statements: "PSP",
  services: "CREQ",
  audit: "TEI",
};

export function navigationFor(role: Role, journey: CustomerJourney) {
  const staff = role !== "customer";
  const views: View[] = staff
    ? [
        "overview",
        journey === "existing" ? "accounts" : "application",
        "cash",
        "approvals",
        "operations",
        "services",
        "cards",
        "deposits",
        "loans",
        "profile",
        "statements",
        "audit",
      ]
    : journey === "existing"
      ? [
          "overview",
          "accounts",
          "transfer",
          "statements",
          "services",
          "cards",
          "deposits",
          "loans",
          "profile",
        ]
      : [
          "overview",
          "application",
          "cards",
          "deposits",
          "loans",
          "profile",
          "transfer",
          "statements",
          "services",
        ];
  return views.map((view) => ({
    view,
    label:
      staff && view === "accounts"
        ? "Customer enquiry"
        : staff && view === "profile"
          ? "Customer profile"
          : viewLabels[view],
    alias: staff ? staffAliases[view] : undefined,
  }));
}
