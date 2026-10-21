import Image from "next/image";
import { ProductArticle } from "../product/product-article";
export const metadata = { title: "OpenFinacle — Connected capabilities" };
export default function CapabilitiesPage() {
  return (
    <ProductArticle
      title="One relationship. Several connected viewpoints."
      intro="Explore the prototype’s everyday journeys and the boundaries that make each one understandable."
    >
      <section id="everyday" className="magazine-article-grid">
        <div>
          <h2>Everyday banking, from end to end.</h2>
          <p>
            Open an individual savings relationship through a staged synthetic
            application and staff decisions. Read a customer’s core balance and
            statement. Review an internal INR transfer and see its two sides.
          </p>
          <p>
            Selected teller cash journeys use separate officer and approver
            decisions. Customer-specific payee lists keep the relationship
            personal.
          </p>
          <p>
            Apache Fineract is the financial system of record. Money, identity
            checks and documents are synthetic. External payment networks and
            production identity are outside the current application.
          </p>
        </div>
        <figure className="article-screen">
          <Image
            src="/product/statements.webp"
            alt="Synthetic customer statement with search and export"
            width={1440}
            height={1000}
            unoptimized
          />
          <figcaption>
            Actual local acceptance fixture. Not a live balance.
          </figcaption>
        </figure>
      </section>
      <section id="products">
        <h2>Keep the customer’s history in view.</h2>
        <div className="magazine-article-grid">
          <dl>
            <div>
              <dt>Deposits and recurring savings</dt>
              <dd>
                Saved simulated product applications, approvals and holdings.
                These do not debit savings or invest funds.
              </dd>
            </div>
            <div>
              <dt>Cards, profiles and service requests</dt>
              <dd>
                Persistent app workflows and decision histories; no card-network
                processing or external fulfilment.
              </dd>
            </div>
          </dl>
          <dl>
            <div>
              <dt>Personal lending</dt>
              <dd>
                Selected origination and core repayment pilot. Full servicing,
                collections and broader product rules remain to be developed.
              </dd>
            </div>
            <div>
              <dt>Shared branch work</dt>
              <dd>
                Customer context, queues and distinct officer/approver
                decisions. Demo persona switching is not production staff
                identity.
              </dd>
            </div>
          </dl>
        </div>
      </section>
      <section id="planning" className="magazine-article-grid">
        <figure className="article-screen">
          <Image
            src="/product/planning.webp"
            alt="Synthetic household goals and cash-flow planning"
            width={1440}
            height={1000}
            unoptimized
          />
          <figcaption>
            Live planning functionality shown with a synthetic household.
          </figcaption>
        </figure>
        <div>
          <h2>The household beyond the account.</h2>
          <p>
            Explore cash flow, budgets, goals, saved scenarios and consented
            adviser review. These models support a conversation; they do not
            execute investments or provide regulated financial advice.
          </p>
          <p>
            Broader wealth management needs market feeds, suitability,
            execution, custody, settlement and their operating controls.
          </p>
          <a href="/roadmap">See the road ahead</a>
        </div>
      </section>
      <section>
        <h2>Go deeper when you need to.</h2>
        <p>
          Selected implementation records, source references and production
          boundaries are available in the detailed assessment. Repository links
          require private access.
        </p>
        <a href="/assessment">Read the technical detail and sources</a>
      </section>
    </ProductArticle>
  );
}
