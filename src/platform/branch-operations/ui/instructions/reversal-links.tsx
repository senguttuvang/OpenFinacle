import type { BankingCommand } from "../../../banking-workspace/domain/banking";
import { formatMoney } from "../../../banking-workspace/domain/banking";
import { type BranchRelationship, coreDate } from "../../domain/branch-day";
import type { cashReversalTrace } from "../../domain/instructions/reversal-links";

export function InstructionAmount({ command }: { command: BankingCommand }) {
  return command.kind === "reverse"
    ? "No separate monetary amount; see the original transaction below."
    : command.kind === "freeze" || command.kind === "unfreeze"
      ? "Not a monetary instruction."
      : formatMoney(command.amount_minor / 100);
}
const messages: Record<ReturnType<typeof cashReversalTrace>["reason"], string> =
  {
    scope:
      "Instruction scope is unavailable or ambiguous. Reversal links are withheld.",
    original_unavailable:
      "The original posted cash instruction is unavailable or unverified in loaded records.",
    history_incomplete:
      "Reversal history is incomplete or invalid. Refresh and inspect before requesting a reversal.",
    existing_reversal:
      "An existing pending, executing, posted or uncertain reversal prevents another request.",
    native_unavailable:
      "The original native cash transaction could not be corroborated. Reversal eligibility is unavailable.",
    already_reversed:
      "Core already records the original transaction as reversed. Another reversal is unavailable.",
    native_state_unknown:
      "The native reversal state was not returned. Reversal eligibility is unavailable.",
    eligible:
      "Loaded workflow and native cash transaction evidence support a reversal request. The separate approver and Core still validate execution.",
  };
export function CashReversalLinks({
  command,
  relationship,
  trace,
  openCommand,
  reviewFixture = false,
}: {
  command: BankingCommand;
  relationship: BranchRelationship;
  trace: ReturnType<typeof cashReversalTrace>;
  openCommand: (id: string, customer: string) => void;
  reviewFixture?: boolean;
}) {
  if (reviewFixture)
    return (
      <section aria-label="Original cash instruction and reversal history">
        <h5>Original cash instruction and reversal history</h5>
        <p>
          STATIC REVIEW FIXTURE — saved reversal links and native transaction
          effects are not connected.
        </p>
      </section>
    );
  if (
    !["deposit", "withdrawal", "reverse"].includes(command.kind) ||
    (command.status !== "posted" && command.kind !== "reverse")
  )
    return null;
  return (
    <section
      aria-label="Original cash instruction and reversal history"
      className="branch-day-item"
    >
      <h5>Original cash instruction and reversal history</h5>
      {trace.original && trace.original.id !== command.id && (
        <>
          <button
            type="button"
            onClick={() => {
              if (trace.original)
                openCommand(trace.original.id, relationship.customer.id);
            }}
          >
            Open original cash instruction {trace.original.id}
          </button>
          <p>
            Original saved instruction amount · application workflow:{" "}
            {formatMoney(trace.original.amount_minor / 100)}.
          </p>
        </>
      )}
      {trace.native ? (
        <p>
          Native original transaction {trace.native.id} ·{" "}
          {coreDate(trace.native.date)} · INR · amount{" "}
          {formatMoney(trace.native.amount)} · reversal flag{" "}
          {trace.native.reversed === true
            ? "Reversed"
            : trace.native.reversed === false
              ? "Not reversed"
              : "Not returned"}
          . Source: Fineract account {relationship.customer.account_no} ·
          observed {new Date(relationship.observedAt).toLocaleString("en-IN")}.
        </p>
      ) : (
        <p>Native original transaction amount/state unavailable.</p>
      )}
      <p>{messages[trace.reason]}</p>
      {trace.reversals.length ? (
        <ul>
          {trace.reversals.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => openCommand(c.id, relationship.customer.id)}
              >
                Open cash reversal {c.id}
              </button>
              <span>
                {" "}
                · {c.status} · maker {c.maker} / checker{" "}
                {c.approver ?? "Not recorded"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p>
          No matching saved reversal in loaded records. This is not proof of an
          unreversed transaction or complete history.
        </p>
      )}
      <p>
        Links are saved application workflow references. Inspect Core journals
        for financial effects. A reversal's Core response reference is not
        assumed to be a new transaction ID. These records do not establish
        physical cash or settlement.
      </p>
    </section>
  );
}
