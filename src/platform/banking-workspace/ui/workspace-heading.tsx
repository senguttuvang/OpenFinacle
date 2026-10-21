"use client";

import { Clock3 } from "lucide-react";
import type { WorkspaceContext } from "./use-banking-workspace";
export function WorkspaceHeading({ context }: { context: WorkspaceContext }) {
  const { data, view, staff, retail, account, viewTitle } = context;
  return (
    <div
      className="page-heading"
      hidden={
        view === "unavailable" || view === "family" || view === "forbidden"
      }
    >
      <div>
        <span className="eyebrow">
          {staff
            ? "ADYAR BRANCH · CHENNAI"
            : retail
              ? "PERSONAL BANKING / MY VIEW"
              : "YOUR EVERYDAY, SIMPLIFIED"}
        </span>
        <h1>
          {view === "overview"
            ? staff
              ? "Branch overview"
              : retail
                ? `Welcome back, ${(account?.clientName ?? "Mira").split(" ")[0]}`
                : `Good things ahead, ${(data.application?.name ?? "Mira").split(" ")[0]}.`
            : viewTitle}
        </h1>
        <p>
          {view === "overview"
            ? staff
              ? "Your work queues, customer context and operational controls."
              : retail
                ? "Here's an overview of your relationship with us."
                : "Your money, your next step, and everything in between."
            : view === "application"
              ? "A simple beginning. Carefully reviewed."
              : view === "planning"
                ? "Explore synthetic household spending, wealth and future decisions. Planning is separate from your bank balances."
                : view === "transfer"
                  ? "Send money confidently to the people who matter."
                  : view === "cash"
                    ? "Record the instruction here. A separate approver posts it."
                    : view === "approvals"
                      ? "Review the details. Keep the maker and approver separate."
                      : "Your banking activity, clearly connected."}
        </p>
      </div>
      <span className="business-date">
        <Clock3 size={14} />
        {data.businessDate}
      </span>
    </div>
  );
}
