"use client";
import { useState } from "react";
import { formatMoney, type Role } from "../../banking-workspace/domain/banking";
import type { CaseDetail } from "../../service-requests/domain/service-cases";
import {
  type BranchDay,
  type BranchRelationship,
  coreDate,
} from "../domain/branch-day";
import {
  branchInstructionRows,
  filterInstructions,
} from "../domain/work-filters";
import type { BranchMutation } from "./branch-day-actions";
import { BranchServiceHistory } from "./branch-service-history";
import { CoreAccountTerms } from "./core-account-terms";
import { BranchLoanDetail } from "./loans/branch-loan-detail";
import { coreAmount, RelationshipDetails } from "./relationship-details";
import { useRelationshipEnquiry } from "./use-relationship-enquiry";
export function BranchAccountDetail({
  relationship: r,
  loanId,
  chooseLoan,
  reviewFixture,
  role,
  busy,
  mutate,
  openCommand,
  accounting,
  loanAccounting,
  caseChanged,
}: {
  relationship: BranchRelationship;
  loanId: number;
  chooseLoan: (id: number) => void;
  reviewFixture?: boolean;
  role: Role;
  busy: boolean;
  mutate: BranchMutation;
  openCommand: (id: string, customer: string) => void;
  accounting: () => void;
  loanAccounting: () => void;
  caseChanged: (next: CaseDetail) => void;
}) {
  const [kind, setKind] = useState("deposit");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const enquiry = useRelationshipEnquiry(r.customer.id, reviewFixture);
  const account = r.account;
  const inr =
    account?.currency?.code === "INR" && account.currency.decimalPlaces === 2;
  return (
    <section className="panel">
      <span className="eyebrow">Customer 360 → account</span>
      <h3>{r.customer.display_name}</h3>
      <p>
        {r.customer.reference} · {r.customer.account_no}
      </p>
      <p>
        Servicing branch: {r.customer.branch_id} · Account-owning core office:{" "}
        {account?.clientOfficeName ?? account?.clientOfficeId ?? "Not returned"}{" "}
        · Originating office: inspect journals.
      </p>
      <p>
        Source: {reviewFixture ? "STATIC REVIEW FIXTURE" : "Fineract"} ·{" "}
        {account?.currency?.code ?? "Unknown currency"} · observed{" "}
        {new Date(r.observedAt).toLocaleString("en-IN")}
      </p>
      {!account && <p role="alert">{r.error ?? "Core account unavailable"}</p>}
      {account && (
        <>
          <dl className="account-facts">
            <dt>Ledger balance</dt>
            <dd>
              {inr && typeof account.summary?.accountBalance === "number"
                ? formatMoney(account.summary.accountBalance)
                : "Unavailable"}
            </dd>
            <dt>Available balance · core portfolio</dt>
            <dd>
              <strong>
                {reviewFixture
                  ? "Not connected in review fixture"
                  : enquiry.loading
                    ? "Reading core portfolio…"
                    : enquiry.value
                      ? coreAmount(
                          enquiry.value.selectedSavings?.availableBalance,
                          enquiry.value.selectedSavings?.currency,
                        )
                      : "Unavailable"}
              </strong>
              {enquiry.value && (
                <small>
                  {" "}
                  Portfolio observed{" "}
                  {new Date(enquiry.value.observedAt).toLocaleString("en-IN")}
                </small>
              )}
            </dd>
            <dt>Product</dt>
            <dd>
              {account.savingsProductName ??
                account.savingsProductId ??
                "Not returned"}
            </dd>
            <dt>Annual interest rate</dt>
            <dd>
              {account.nominalAnnualInterestRate === undefined
                ? "Not returned"
                : `${account.nominalAnnualInterestRate}%`}
            </dd>
            <dt>Interest posted to date</dt>
            <dd>
              {inr && typeof account.summary?.totalInterestPosted === "number"
                ? formatMoney(account.summary.totalInterestPosted)
                : "Not returned by core"}
            </dd>
            <dt>Fees charged to date</dt>
            <dd>
              {inr && typeof account.summary?.totalFeeCharge === "number"
                ? formatMoney(account.summary.totalFeeCharge)
                : "Not returned by core"}
            </dd>
            <dt>Penalties charged to date</dt>
            <dd>
              {inr && typeof account.summary?.totalPenaltyCharge === "number"
                ? formatMoney(account.summary.totalPenaltyCharge)
                : "Not returned by core"}
            </dd>
            <dt>Account status / restriction</dt>
            <dd>
              {account.status.value} /{" "}
              {account.subStatus?.value ?? "Restriction evidence not returned"}
            </dd>
          </dl>
          <CoreAccountTerms account={account} />
          <p>
            Full tariff, loan schedules, signatory authority and verified
            mandates require separate evidence. Absence here is not proof of
            unrestricted servicing.
          </p>
          <button type="button" onClick={accounting}>
            Trace product → journal → GL
          </button>
          <h4>Core transaction history</h4>
          <div className="table-scroll">
            <table className="branch-table">
              <thead>
                <tr>
                  <th>Core reference</th>
                  <th>Business date</th>
                  <th>Type</th>
                  <th>Amount · {account.currency?.code}</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {account.transactions?.map((t) => (
                  <tr key={t.id}>
                    <td>{t.id}</td>
                    <td>{coreDate(t.date)}</td>
                    <td>{t.transactionType.value}</td>
                    <td>
                      {inr ? formatMoney(t.amount) : "Unsupported currency"}
                    </td>
                    <td>{t.reversed ? "Reversed" : "Core record"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!account.transactions && (
            <p>
              Transaction history not returned. Activity and close checks are
              incomplete.
            </p>
          )}
        </>
      )}
      <RelationshipDetails
        state={enquiry}
        reviewFixture={reviewFixture}
        openLoan={chooseLoan}
      />
      <BranchLoanDetail
        customerId={r.customer.id}
        branchId={r.customer.branch_id}
        loanId={loanId}
        accounting={loanAccounting}
        reviewFixture={reviewFixture}
      />
      <h4>Controlled servicing instruction</h4>
      <p>
        Submit once, then inspect the original instruction. No automatic retry
        of an uncertain outcome.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void mutate(
            "/branch/instruction",
            {
              customerId: r.customer.id,
              instruction: {
                kind,
                ...(["freeze", "unfreeze"].includes(kind)
                  ? {}
                  : { amount: Number(amount) }),
                description,
              },
            },
            key,
          );
        }}
      >
        <label>
          Operation
          <select
            value={kind}
            disabled={busy}
            onChange={(e) => setKind(e.target.value)}
          >
            {["deposit", "withdrawal", "freeze", "unfreeze"].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        {!["freeze", "unfreeze"].includes(kind) && (
          <label>
            Amount in INR
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
        )}
        <label>
          Original instruction
          <input
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <p>Original operation key: {key}</p>
        <button
          type="submit"
          disabled={busy || role !== "officer" || !account || !inr}
        >
          Submit for independent approval
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setKey(crypto.randomUUID());
            setDescription("");
            setAmount("");
          }}
        >
          Start a different instruction
        </button>
      </form>
      <BranchServiceHistory
        key={role}
        relationship={r}
        reviewFixture={reviewFixture}
        caseChanged={(next) => {
          caseChanged(next);
          if (next.request.profile_patch) enquiry.reload();
        }}
      />
      <h4>Instructions</h4>
      {r.commands.map((c) => (
        <p key={c.id}>
          <button
            type="button"
            onClick={() => openCommand(c.id, r.customer.id)}
          >
            {c.id} · {c.kind} · {c.status}
          </button>
        </p>
      ))}
      <h4>Latest application audit events (up to 100)</h4>
      {r.audit.map((a) => (
        <p key={a.id}>
          {a.created_at} · {a.actor} · {a.action} · {a.detail}
        </p>
      ))}
    </section>
  );
}
export function InstructionDetail({
  day,
  customerId,
  commandId,
  initialCustomerId,
  openCommand,
  role,
  busy,
  mutate,
  accounting,
}: {
  day: BranchDay;
  customerId: string;
  commandId: string;
  initialCustomerId?: string;
  openCommand: (id: string, customer: string) => void;
  role: Role;
  busy: boolean;
  mutate: BranchMutation;
  accounting: () => void;
}) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState("unresolved");
  const [owner, setOwner] = useState("all");
  const [customerFilter, setCustomerFilter] = useState(initialCustomerId ?? "");
  const rows = filterInstructions(day, query, state, owner, customerFilter);
  const total = branchInstructionRows(day).length;
  const r = day.relationships.find((item) => item.customer.id === customerId);
  const command = r?.commands.find((c) => c.id === commandId);
  return (
    <section className="panel">
      <h3>Transaction enquiry & approval inbox</h3>
      <label>
        Search instructions, customer or Core reference
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="branch-day-actions branch-day-filters">
        <label>
          Instruction customer filter
          <select
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
          >
            <option value="">All loaded customers</option>
            {day.relationships.map(({ customer }) => (
              <option key={customer.id} value={customer.id}>
                {customer.display_name} · {customer.reference}
              </option>
            ))}
          </select>
        </label>
        <label>
          Instruction state filter
          <select value={state} onChange={(e) => setState(e.target.value)}>
            {[
              ["unresolved", "All unresolved"],
              ["pending", "Pending approval"],
              ["executing", "Executing"],
              ["uncertain", "Uncertain"],
              ["failed", "Failed"],
              ["posted", "Posted"],
              ["rejected", "Rejected"],
              ["all", "All states"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Instruction owner filter
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="all">All owner labels</option>
            {["unassigned", "teller", "checker", "manager", "accountant"].map(
              (value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ),
            )}
          </select>
        </label>
      </div>
      <button
        type="button"
        onClick={() => {
          setQuery("");
          setState("unresolved");
          setOwner("all");
          setCustomerFilter("");
        }}
      >
        Reset instruction filters
      </button>
      <p>
        {rows.length} of {total} loaded instructions match. Owner labels
        organise work and grant no approval authority. Filters do not change
        branch coverage or close readiness.
      </p>
      {day.coverage.workflowLimited && (
        <p role="alert">
          Workflow coverage is incomplete. Filter results cannot establish that
          all branch instructions are listed.
        </p>
      )}
      {rows.map(({ customer, command: c, owner }) => (
        <p key={c.id}>
          <button type="button" onClick={() => openCommand(c.id, customer.id)}>
            {customer.display_name} · {c.kind} · {c.status} · {c.id}
          </button>
          <small>Owner label: {owner}</small>
        </p>
      ))}
      {!rows.length && (
        <p>
          No matching instructions in loaded records. Reset filters to inspect
          other work.
        </p>
      )}
      {command &&
        !rows.some(
          (row) =>
            row.command.id === command.id && row.customer.id === customerId,
        ) && (
          <p role="status">
            The selected original instruction is outside these filters. Its
            detail remains visible below.
          </p>
        )}
      {command && r ? (
        <article className="branch-day-item">
          <h4>
            {r.customer.display_name} · {command.id}
          </h4>
          <p>
            Servicing branch {day.branchId} · account {command.account_id} ·{" "}
            {day.businessDate} · INR · observed{" "}
            {new Date(day.observedAt).toLocaleString("en-IN")}
          </p>
          <dl>
            <dt>Instruction</dt>
            <dd>{command.description}</dd>
            <dt>Kind / status</dt>
            <dd>
              {command.kind} / {command.status}
            </dd>
            <dt>Instruction amount</dt>
            <dd>{formatMoney(command.amount_minor / 100)}</dd>
            <dt>Maker / checker</dt>
            <dd>
              {command.maker} / {command.approver ?? "No decision recorded"}
            </dd>
            <dt>Core reference</dt>
            <dd>{command.core_id ?? "No confirmed financial reference"}</dd>
            <dt>Created</dt>
            <dd>{command.created_at} UTC</dd>
            <dt>Recovery</dt>
            <dd>
              {command.error ??
                "Inspect status and core references before repeating an instruction."}
            </dd>
          </dl>
          <details>
            <summary>Original saved payload</summary>
            <pre>{command.payload}</pre>
          </details>
          <div className="branch-day-actions">
            <button
              type="button"
              disabled={
                busy ||
                role !== "approver" ||
                command.status !== "pending" ||
                command.maker === "approver"
              }
              onClick={() =>
                void mutate("/branch/decision", {
                  customerId,
                  commandId,
                  decision: "approve",
                })
              }
            >
              Approve original instruction
            </button>
            <button
              type="button"
              disabled={
                busy || role !== "approver" || command.status !== "pending"
              }
              onClick={() =>
                void mutate("/branch/decision", {
                  customerId,
                  commandId,
                  decision: "reject",
                })
              }
            >
              Reject
            </button>
            <button type="button" onClick={accounting}>
              Inspect core journals
            </button>
            {command.status === "posted" &&
              ["deposit", "withdrawal"].includes(command.kind) && (
                <button
                  type="button"
                  disabled={busy || role !== "officer"}
                  onClick={() =>
                    void mutate(
                      "/branch/instruction",
                      {
                        customerId,
                        instruction: {
                          kind: "reverse",
                          originalId: command.id,
                          description: `Reverse ${command.id}`,
                        },
                      },
                      `branch-reverse-${command.id}`,
                    )
                  }
                >
                  Request controlled reversal
                </button>
              )}
          </div>
          <p>
            A posted instruction alone does not prove a balanced journal,
            physical cash count or settlement match. Uncertain/executing
            instructions require reconciliation; there is no force-post action.
          </p>
        </article>
      ) : (
        <p>
          Select an instruction to inspect its original record and decision.
        </p>
      )}
    </section>
  );
}
