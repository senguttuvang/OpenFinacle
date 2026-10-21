"use client";

import "../assessment-report.css";
import { Source, Status, TableRegion } from "../evidence-presentation";
import type { AssessmentContext } from "../use-assessment";
export function AgentWorkflows({ context }: { context: AssessmentContext }) {
  const { agentMode, setAgentMode } = context;
  return (
    <section
      id="agents"
      className="evidence-section evidence-future"
      aria-labelledby="agents-title"
    >
      <div className="evidence-section-heading">
        <h2 id="agents-title">
          A bank your AI can work with.
          <br />
          Under your authority.
        </h2>
        <p>
          Proposed architecture. A customer’s chosen AI harness could use scoped
          banking tools. Language interpretation would remain separate from
          authorisation, posting and financial truth.
        </p>
      </div>
      <fieldset className="evidence-mode" aria-label="Proposed agent scenario">
        <button
          type="button"
          aria-pressed={agentMode === "read"}
          onClick={() => setAgentMode("read")}
        >
          Read an account
        </button>
        <button
          type="button"
          aria-pressed={agentMode === "write"}
          onClick={() => setAgentMode("write")}
        >
          Prepare a payment
        </button>
      </fieldset>
      <ol className="evidence-agent-flow">
        <li>
          <strong>Customer AI harness</strong>
          <span>Interprets the customer’s request.</span>
        </li>
        <li>
          <strong>Consent & delegation</strong>
          <span>
            Short-lived, revocable grant; least privilege and explicit account
            scope.
          </span>
        </li>
        <li>
          <strong>Authorised tools / MCP</strong>
          <span>
            Enforce tool, identity, audience and read/write scopes at the bank
            boundary.
          </span>
        </li>
        <li>
          <strong>Bank command & Core</strong>
          <span>
            Validate policy, persist intent and reconcile the authoritative
            outcome.
          </span>
        </li>
      </ol>
      <div className="evidence-agent-result" aria-live="polite">
        <h3>
          {agentMode === "read"
            ? "Read scope: accounts.read + statements.read"
            : "Write scope: payments.prepare → customer confirmation"}
        </h3>
        <p>
          {agentMode === "read"
            ? "Return only permitted accounts and a timestamped observation. A read grant cannot submit a payment. Revoke access without exposing credentials to the model."
            : "Prepare payee, amount, limits and fees for explicit human review. Bind confirmation to that exact intent; use an idempotent command and a durable receipt. An uncertain outcome blocks further writes until reconciled."}
        </p>
        <p>
          <strong>Always:</strong> defend against prompt injection, minimise
          disclosed data, log access and decisions, enforce revocation at each
          tool call, and keep a recoverable audit trail.{" "}
          <Source id="mcp">Protocol security reference</Source>
        </p>
      </div>
      <TableRegion label="Scrollable roadmap boundaries">
        <table>
          <caption>
            Current foundation versus proposed scope · no delivery dates
            committed
          </caption>
          <thead>
            <tr>
              <th scope="col">Capability</th>
              <th scope="col">State</th>
              <th scope="col">Next evidence required</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Synthetic household planning</th>
              <td>
                <Status id="workflow" /> Already live
              </td>
              <td>
                Retain saved scenarios and consent boundary; do not equate
                planning with regulated wealth services.
              </td>
            </tr>
            <tr>
              <th scope="row">Production wealth management</th>
              <td>
                <Status id="roadmap" />
              </td>
              <td>
                Suitability/advice controls, real market data, order execution,
                custody and settlement acceptance.
              </td>
            </tr>
            <tr>
              <th scope="row">AI chatbot</th>
              <td>
                <Status id="roadmap" />
              </td>
              <td>
                Grounded answers, privacy, escalation, evaluation and clear
                separation from authority to transact.
              </td>
            </tr>
            <tr>
              <th scope="row">Customer-facing MCP / AI harness</th>
              <td>
                <Status id="roadmap" />
              </td>
              <td>
                Consent, scoped authorisation, revocation, threat model and
                tool-level recovery proof.
              </td>
            </tr>
          </tbody>
        </table>
      </TableRegion>
    </section>
  );
}
