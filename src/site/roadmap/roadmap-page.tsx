import { ProductArticle } from "../product/product-article";
import { gates } from "../product/product-evidence";
export const metadata = { title: "OpenFinacle — The road ahead" };
export default function RoadmapPage() {
  return (
    <ProductArticle
      title="From a useful prototype to a bank-owned platform."
      intro="A production-grade system grows around a particular institution, its customers and its responsibilities. These are the next workstreams, not completed production capabilities."
    >
      <section>
        <h2>Build around the bank.</h2>
        <p>
          Start with a bounded set of customer journeys and bank-approved
          financial rules. Reuse the core where it fits; integrate the bank’s
          real identity, payments, compliance and operational systems.
        </p>
        <dl>
          {gates.map(([name, owner, evidence]) => (
            <div key={name}>
              <dt>
                {name} · {owner}
              </dt>
              <dd>{evidence}</dd>
            </div>
          ))}
        </dl>
        <p>
          No delivery date or regulatory certification is implied. Independent
          bank acceptance and relevant jurisdiction-specific requirements remain
          essential.
        </p>
      </section>
      <section id="agents">
        <h2>Let the customer bring their own AI.</h2>
        <p>
          Proposed direction: a customer’s AI harness asks for a scoped banking
          capability, the customer grants limited consent, and the bank enforces
          that permission at every tool call.
        </p>
        <ol>
          <li>
            <strong>Read access:</strong> time-stamped account observations and
            statements, limited to permitted accounts.
          </li>
          <li>
            <strong>Write access:</strong> prepare a specific instruction, then
            obtain explicit human confirmation bound to payee, amount and
            limits.
          </li>
          <li>
            <strong>Durable outcomes:</strong> preserve intent and receipts,
            prevent duplicate posting and block further writes while an outcome
            is uncertain.
          </li>
          <li>
            <strong>Revocation and defence:</strong> short-lived grants, least
            privilege, credential isolation, prompt-injection defences and an
            auditable access trail.
          </li>
        </ol>
        <p>
          A customer-facing MCP server and banking chatbot are not implemented.
          A chatbot would need grounded answers, privacy boundaries, escalation
          and evaluation before customer use.
        </p>
      </section>
      <section>
        <h2>Take planning further, responsibly.</h2>
        <p>
          Synthetic household planning is already live. Production wealth
          services are a separate next chapter: market data, suitability and
          advice controls, order execution, custody, settlement and
          reconciliation.
        </p>
        <a href="/assessment#readiness">
          Explore the detailed production boundaries
        </a>
      </section>
    </ProductArticle>
  );
}
