import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import {
  type SourceId,
  type StatusId,
  sources,
  statuses,
} from "../product/product-evidence";
import "./assessment-report.css";
export function Source({
  id,
  children,
}: {
  id: SourceId;
  children?: ReactNode;
}) {
  return (
    <a href={sources[id].url} className="evidence-source">
      {children ?? sources[id].title}
      <ArrowUpRight size={13} aria-hidden="true" />
    </a>
  );
}
export function Status({ id }: { id: StatusId }) {
  return (
    <span className={`evidence-status ${id}`}>
      {statuses.find((s) => s.id === id)?.label}
    </span>
  );
}
export function TableRegion({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    // Keyboard focus lets readers scroll the wide data table without a pointer.
    // biome-ignore lint/a11y/noNoninteractiveTabindex: labelled scroll region needs keyboard access
    <section className="evidence-table-scroll" aria-label={label} tabIndex={0}>
      {children}
    </section>
  );
}
export const screens = [
  [
    "accounts",
    "Savings & account facts",
    "Customer balances and account navigation.",
  ],
  [
    "statements",
    "Trace a transaction",
    "Transaction history, search and CSV export.",
  ],
  [
    "planning",
    "Synthetic household planning",
    "Budgets, goals and saved household scenarios.",
  ],
  [
    "onboarding",
    "Staged account opening",
    "Synthetic application and staff decisions.",
  ],
  [
    "branch",
    "The branch viewpoint",
    "Queues, officer review and separate approval.",
  ],
] as const;
export const plans = {
  sandbox: {
    label: "Extend the synthetic sandbox",
    outcome: "A candidate for a bounded evaluation",
    condition:
      "Reuse Fineract and the current app. Freeze a small journey set; use synthetic data and existing infrastructure. Ten weeks is a planning envelope, not a delivery promise.",
  },
  pilot: {
    label: "Prepare a bank pilot",
    outcome: "Conditional on bank dependencies",
    condition:
      "Requires existing identity, rails, approved product rules and named bank reviewers. Discovery may consume the envelope. A real-money pilot starts only after every relevant gate is accepted.",
  },
  scratch: {
    label: "Build a broad core from scratch",
    outcome: "No credible ten-week commitment",
    condition:
      "A new ledger, product engine, integrations and operating assurance are a different programme. This resource model cannot establish Finacle parity or replace that discovery.",
  },
} as const;
