"use client";

import {
  ArrowLeftRight,
  Building2,
  Clock3,
  CreditCard,
  FileCheck2,
  FileText,
  Landmark,
  LayoutDashboard,
  LoaderCircle,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import dynamic from "next/dynamic";
import type { Role } from "../domain/banking";
export const Cards = dynamic(
  () =>
    import("../../cards/ui/card-workspace").then(
      (module) => module.CardWorkspace,
    ),
  {
    loading: () => <p role="status">Loading card workspace…</p>,
  },
);
export const Deposits = dynamic(
  () =>
    import("../../deposits/ui/deposit-workspace").then(
      (module) => module.DepositWorkspace,
    ),
  {
    loading: () => <p role="status">Loading deposit workspace…</p>,
  },
);
export const Loans = dynamic(
  () =>
    import("../../lending/ui/loan-workspace").then(
      (module) => module.LoanWorkspace,
    ),
  { loading: () => <p role="status">Loading lending workspace…</p> },
);
export const RetailProfile = dynamic(
  () =>
    import("../../customers/ui/customer-profile").then(
      (module) => module.CustomerProfile,
    ),
  {
    loading: () => <p role="status">Loading profile workspace…</p>,
  },
);
export const Planning = dynamic(
  () =>
    import("../../household-planning/ui/planning-workspace").then(
      (module) => module.PlanningWorkspace,
    ),
  { loading: () => <p role="status">Loading wealth and planning…</p> },
);
export const roles: Record<
  Role,
  { name: string; person: string; initials: string }
> = {
  customer: { name: "Customer", person: "Mira Krishnan", initials: "MK" },
  officer: {
    name: "Bank officer",
    person: "Priya · Branch operations",
    initials: "PR",
  },
  approver: {
    name: "Approver",
    person: "Dev · Branch manager",
    initials: "DV",
  },
};
export const navIcons = {
  overview: LayoutDashboard,
  accounts: Landmark,
  profile: Users,
  application: FileCheck2,
  transfer: ArrowLeftRight,
  statements: FileText,
  services: CreditCard,
  cards: CreditCard,
  deposits: Landmark,
  loans: Landmark,
  planning: TrendingUp,
  cash: Wallet,
  approvals: ShieldCheck,
  operations: Building2,
  audit: Clock3,
};
const statusLabel = (status: string) =>
  ({
    awaiting_approval: "Awaiting approval",
    needs_changes: "Needs information",
    submitted: "Under review",
    approved: "Account opened",
    pending: "Awaiting approval",
    posted: "Completed",
    rejected: "Declined",
    reversed: "Reversed",
    failed: "Not processed",
    uncertain: "Needs reconciliation",
    opening_exception: "Opening exception",
    opening: "Opening account",
  })[status] ?? status.replaceAll("_", " ");
export const Pill = ({ status }: { status: string }) => (
  <span
    className={`pill ${["posted", "approved", "active", "fulfilled"].includes(status) ? "success" : ["failed", "uncertain", "opening_exception", "rejected"].includes(status) ? "danger" : "pending"}`}
  >
    <span />
    {statusLabel(status)}
  </span>
);
export const PendingButton = ({
  busy,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy: boolean }) => (
  <button {...props} disabled={busy || props.disabled}>
    {busy ? <LoaderCircle size={16} className="spin" /> : null}
    {children}
  </button>
);
