"use client";

import { ArrowRight, ArrowUpRight, CheckCheck, Landmark } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { FormSelect } from "./form-select";
import "./product-story.css";

const capabilities = [
  [
    "Open and activate an individual savings account",
    "Connected",
    "Staged synthetic application, staff decisions and an actual Fineract account.",
  ],
  [
    "Read balances and available funds",
    "Connected",
    "Customer-scoped Core balances; stale or unverified data is disclosed.",
  ],
  [
    "View transactions and export statements",
    "Connected",
    "Savings transaction history and CSV exports.",
  ],
  [
    "Manage a personal saved-payee list",
    "Connected",
    "Persistent customer-specific lists, initially 5–15 payees; reviewed changes.",
  ],
  [
    "Transfer within the demo branch",
    "Connected",
    "Reviewed INR transfer with a verified debit, credit and original receipt.",
  ],
  [
    "Deposit and withdraw teller cash",
    "Connected",
    "Separate maker/checker roles and actual synthetic Core postings.",
  ],
  [
    "Explore fixed and recurring deposits",
    "Workflow demo",
    "Persistent simulated products; no corresponding savings debit or actual deposit investment.",
  ],
  [
    "Manage debit-card controls and replacement",
    "Workflow demo",
    "Persistent workflow records; no card-network processing or physical issuance.",
  ],
  [
    "Track profile changes and service requests",
    "Workflow demo",
    "Saved branch workflows; external bank systems are not integrated.",
  ],
  [
    "Plan household wealth and goals",
    "Workflow demo",
    "Synthetic Indian household models, saved scenarios, budgets and consented adviser review.",
  ],
  [
    "Authenticate a real customer and authorize staff",
    "Not demonstrated",
    "Demo role/customer switching does not establish production identity or MFA.",
  ],
  [
    "Perform regulated identity verification",
    "Not demonstrated",
    "PAN, Aadhaar, contact and KYC checks are explicitly synthetic.",
  ],
  [
    "Screen sanctions, laundering and fraud",
    "Not demonstrated",
    "Requires bank policies, specialist systems, evidence and operational response.",
  ],
  [
    "Use external payment and card rails",
    "Not demonstrated",
    "UPI, NEFT, RTGS and network settlement are outside this implementation.",
  ],
  [
    "Validate savings interest, fees and tax rules",
    "Not demonstrated",
    "The demo has not validated bank-specific calculation and posting policy.",
  ],
  [
    "Reconcile the bank ledger and close the day",
    "Not demonstrated",
    "Independent bank-wide reconciliation and end-of-day acceptance remain outstanding.",
  ],
  [
    "Produce regulatory submissions",
    "Not demonstrated",
    "Jurisdiction-specific reporting and control certification are outstanding.",
  ],
  [
    "Handle nominations and exceptional servicing",
    "Not demonstrated",
    "Nominee/deceased-account, legal holds and exceptional lifecycle cases remain outside scope.",
  ],
  [
    "Prove production security and resilience",
    "Not demonstrated",
    "Independent penetration tests, load targets, HA and disaster-recovery acceptance are outstanding.",
  ],
  [
    "Migrate and operate a bank continuously",
    "Not demonstrated",
    "Cutover, migration reconciliation, service levels, incident response and bank sign-off are outstanding.",
  ],
] as const;

const screens = [
  [
    "accounts",
    "Everyday savings, clearly presented",
    "Customer balances, account facts and familiar banking navigation.",
  ],
  [
    "statements",
    "Follow the money",
    "Searchable transaction history and statement export.",
  ],
  [
    "planning",
    "See the household beyond the account",
    "Wealth, cash flow and goals, with the synthetic planning data clearly identified.",
  ],
  [
    "onboarding",
    "Start a banking relationship",
    "A staged application, document review and an account-opening receipt.",
  ],
  [
    "branch",
    "Experience the other side of the counter",
    "Branch queues and separate customer, officer and approver experiences.",
  ],
] as const;

export function ProductStory() {
  const [developers, setDevelopers] = useState("5");
  const [weeks, setWeeks] = useState("10");
  const [budget, setBudget] = useState(100);
  const developerWeeks = Number(developers) * Number(weeks);
  const baselineTokens = developerWeeks * 0.5;
  const represented = capabilities.filter(
    (item) => item[1] !== "Not demonstrated",
  ).length;

  return (
    <div className="product-story">
      <nav className="story-nav" aria-label="About this product">
        <a href="#project">The project</a>
        <a href="#experience">Screens & journeys</a>
        <a href="#capabilities">Capability coverage</a>
        <a href="#readiness">Bank readiness</a>
        <a href="#build">Build economics</a>
      </nav>

      <section
        id="project"
        className="story-section story-intro"
        aria-labelledby="project-title"
      >
        <h2 id="project-title">How far can a banking idea go in a week?</h2>
        <div className="story-columns">
          <p className="story-lead">
            A founder, AI coding tools and an established open-source core.
            OpenFinacle explores how quickly a connected banking experience can
            become working software.
          </p>
          <div>
            <p>
              The inspiration is familiar: internet banking should connect a
              customer's experience to what actually happens in the branch.
              Finacle is a reference for the breadth of that ambition. Apache
              Fineract is the engine this project actually uses.
            </p>
            <p>
              Our mission is to make banking workflows understandable and
              inspectable. Our vision is a path from a compelling prototype to a
              bank-evaluable system, with evidence at every step.
            </p>
            <p>
              Today: a persistent synthetic sandbox, 100 seeded customer
              relationships, independent staged onboarding, saved payees,
              two-sided transfers and household planning. Newly opened customers
              can join the directory. This is a demonstration, with real Core
              postings of synthetic money.
            </p>
          </div>
        </div>
        <div className="story-flow">
          <span>
            <Landmark aria-hidden="true" /> Customer & branch experiences
          </span>
          <ArrowRight aria-hidden="true" />
          <span>Reviewed workflows & saved receipts</span>
          <ArrowRight aria-hidden="true" />
          <span>Apache Fineract · Savings & postings</span>
        </div>
      </section>

      <section
        id="experience"
        className="story-section story-experience"
        aria-labelledby="experience-title"
      >
        <div className="story-section-heading">
          <h2 id="experience-title">Take a look. Then take a journey.</h2>
          <p>
            Actual application captures from local acceptance fixtures, using
            synthetic sample data. Select an image to view it at full size;
            these are screen previews, not live balances.
          </p>
        </div>
        <div className="story-gallery">
          {screens.map(([id, title, description]) => (
            <figure key={id}>
              <a
                href={`/product/${id}.webp`}
                target="_blank"
                rel="noreferrer"
                aria-label={`View full screenshot: ${title} (opens in a new tab)`}
              >
                <Image
                  src={`/product/${id}.webp`}
                  alt={`${title} — OpenFinacle synthetic demonstration screen`}
                  width={1440}
                  height={1000}
                  loading="lazy"
                  unoptimized
                />
                <span>
                  <ArrowUpRight size={18} aria-hidden="true" /> View full screen
                </span>
              </a>
              <figcaption>
                <h3>{title}</h3>
                <p>{description}</p>
              </figcaption>
            </figure>
          ))}
        </div>
        <div className="story-journeys">
          <h3>Choose your viewpoint</h3>
          <ol>
            <li>
              <strong>New customer.</strong> Open your first account, complete
              the synthetic application and follow staff review.{" "}
              <a href="/open-account">
                Start an application <ArrowRight size={16} aria-hidden="true" />
              </a>
            </li>
            <li>
              <strong>Existing customer.</strong> Choose a saved customer above,
              inspect their account, review a small transfer to a saved payee,
              then switch customers to see the credit.
            </li>
            <li>
              <strong>Branch officer & approver.</strong> After entering a
              journey, use “Experience both sides” to follow maker/checker cash
              operations and independent decisions.
            </li>
            <li>
              <strong>Household planner.</strong> Enter an existing customer and
              open Wealth & Planning. Explore the explicitly synthetic
              household, budgets, scenarios and adviser-consent boundary.
            </li>
          </ol>
          <a className="story-link" href="#demo-entry">
            Choose a demo journey <ArrowRight size={18} aria-hidden="true" />
          </a>
        </div>
      </section>

      <section
        id="capabilities"
        className="story-section"
        aria-labelledby="capability-title"
      >
        <h2 id="capability-title">
          A useful slice of retail banking. A transparent boundary.
        </h2>
        <div className="story-columns">
          <div>
            <p className="story-lead">
              {represented} of {capabilities.length} locally defined retail
              capability groups are represented:{" "}
              {(represented / capabilities.length) * 100}%.
            </p>
            <p>
              Six groups connect to real Core accounts or operations (30%); four
              are persistent workflow demonstrations (20%). Ten remain unproven
              or outside this implementation (50%).
            </p>
          </div>
          <div>
            <p>
              This is an unweighted checklist selected for this demo's
              individual savings-account context, assessed on 18 October 2026. A
              group counts as represented when its described demo path exists;
              that does not establish full lifecycle coverage.
            </p>
            <p>
              <strong>
                It is not “50% of Finacle” or “50% production ready.”
              </strong>{" "}
              We have no complete, independently assessed Finacle feature
              denominator. Menu destinations alone do not count. Complex
              assurance work has the same checklist weight as simpler features,
              so this percentage cannot estimate remaining effort.
            </p>
          </div>
        </div>
        <details className="story-details">
          <summary>Inspect all 20 groups and their evidence boundaries</summary>
          <section
            className="story-table-scroll"
            aria-label="Retail capability checklist"
          >
            <table>
              <caption>
                OpenFinacle local retail checklist · 18 October 2026
              </caption>
              <thead>
                <tr>
                  <th scope="col">Capability group</th>
                  <th scope="col">Demonstration status</th>
                  <th scope="col">Boundary</th>
                </tr>
              </thead>
              <tbody>
                {capabilities.map(([name, status, boundary]) => (
                  <tr key={name}>
                    <th scope="row">{name}</th>
                    <td>
                      <span
                        className={`story-status ${status === "Connected" ? "connected" : ""}`}
                      >
                        {status}
                      </span>
                    </td>
                    <td>{boundary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </details>
        <div className="story-comparison">
          <div>
            <h3>OpenFinacle today</h3>
            <p>
              One bounded synthetic retail sandbox. Fineract-backed savings and
              selected financial flows, with separate persistent demo products.
              A working experience to inspect and discuss.
            </p>
          </div>
          <div>
            <h3>Finacle's product scope</h3>
            <p>
              A much broader banking platform addressing retail and corporate
              banking, multi-currency operations, payments and integration
              requirements. Comparing visible screens alone misses most of that
              scope.{" "}
              <a href="https://www.infosys.com/newsroom/press-releases/documents/2000/finacle-05july00.pdf">
                Read Infosys's original launch description
              </a>
              .
            </p>
          </div>
        </div>
        <p>
          Related demonstrations also include personal-loan origination and a
          bounded partial-repayment pilot. They sit outside this savings
          checklist; comprehensive loan servicing is not claimed.
        </p>
      </section>

      <section
        id="readiness"
        className="story-section story-readiness"
        aria-labelledby="readiness-title"
      >
        <h2 id="readiness-title">What a bank would need to accept.</h2>
        <p className="story-lead">
          Production readiness is an evidence programme across the bank, its
          technology and its operating model.
        </p>
        <dl className="story-gates">
          <div>
            <dt>Financial integrity</dt>
            <dd>
              Bank-approved products, interest and fees; independent ledger
              reconciliation, exception handling, end-of-day processing and
              migration proof.
            </dd>
          </div>
          <div>
            <dt>Identity & controls</dt>
            <dd>
              Real customer and staff identity, least privilege, MFA,
              segregation of duties, KYC/AML/fraud integrations and auditable
              access decisions.
            </dd>
          </div>
          <div>
            <dt>Resilience & operations</dt>
            <dd>
              Measured load and service levels, high availability, verified
              backups and recovery, monitoring, incident response and support
              ownership.
            </dd>
          </div>
          <div>
            <dt>Independent acceptance</dt>
            <dd>
              Security assessment, bank UAT, jurisdiction-specific regulatory
              review, vendor assurance and a controlled cutover with rollback
              criteria.
            </dd>
          </div>
        </dl>
        <p>
          Current strengths include reviewed commands, original-receipt
          recovery, maker/checker workflows, automated checks and verified local
          persistence. These are foundations for evaluation; they do not certify
          the system for real customer funds.
        </p>
      </section>

      <section
        id="build"
        className="story-section"
        aria-labelledby="build-title"
      >
        <h2 id="build-title">Fast to demonstrate. Deliberate to bank on.</h2>
        <p className="story-lead">
          The founder reports approximately 500 million AI tokens and one week
          to reach this demonstration.
        </p>
        <p>
          This is a firsthand estimate, not an audited usage or billing record.
          Focused human attention was not logged. The result reuses Apache
          Fineract, modern open-source libraries and hosted infrastructure; it
          is not a banking core created from scratch.
        </p>
        <div className="story-calculator">
          <div>
            <h3>Explore the ten-week proposition</h3>
            <p>
              Change team size, elapsed weeks and token budget. This is resource
              arithmetic, not a prediction of productivity, cost or bank
              acceptance.
            </p>
            <label htmlFor="story-developers">Developers</label>
            <FormSelect
              id="story-developers"
              value={developers}
              onValueChange={setDevelopers}
              options={[1, 3, 5, 10].map((value) => ({
                value: String(value),
                label: `${value} developer${value === 1 ? "" : "s"}`,
              }))}
            />
            <label htmlFor="story-weeks">Calendar weeks</label>
            <FormSelect
              id="story-weeks"
              value={weeks}
              onValueChange={setWeeks}
              options={[4, 10, 26, 52].map((value) => ({
                value: String(value),
                label: `${value} weeks`,
              }))}
            />
            <label htmlFor="story-budget">
              AI token budget: {budget} billion
            </label>
            <input
              id="story-budget"
              type="range"
              min="1"
              max="100"
              step="1"
              value={budget}
              onChange={(event) => setBudget(Number(event.target.value))}
            />
          </div>
          <div
            className="story-calculation"
            aria-live="polite"
            aria-atomic="true"
          >
            <h3>What that capacity means</h3>
            <dl>
              <div>
                <dt>Developer-weeks</dt>
                <dd>{developerWeeks}</dd>
              </div>
              <div>
                <dt>Nominal human effort</dt>
                <dd>{developerWeeks * 5} person-days</dd>
              </div>
              <div>
                <dt>At 40 hours per developer-week</dt>
                <dd>{(developerWeeks * 40).toLocaleString("en-IN")} hours</dd>
              </div>
              <div>
                <dt>If each developer uses 500M tokens weekly</dt>
                <dd>{baselineTokens}B tokens</dd>
              </div>
              <div>
                <dt>Budget relative to that usage assumption</dt>
                <dd>{(budget / baselineTokens).toFixed(1)}×</dd>
              </div>
            </dl>
            <p>
              The usage assumption extrapolates the founder's report; it has not
              been measured for a professional team. More tokens can fund
              retries and exploration without increasing accepted output.
            </p>
          </div>
        </div>
        <section
          className="story-table-scroll"
          aria-label="Illustrative delivery scenarios"
        >
          <table>
            <caption>
              Engineering planning estimates · five experienced developers ·
              reuse the existing core
            </caption>
            <thead>
              <tr>
                <th scope="col">Outcome</th>
                <th scope="col">Conventional approach</th>
                <th scope="col">AI-assisted approach</th>
                <th scope="col">Ten-week assessment</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Reproduce the current demo</th>
                <td>4–8 weeks</td>
                <td>2–4 weeks</td>
                <td>Plausible, with time to refine.</td>
              </tr>
              <tr>
                <th scope="row">Controlled synthetic sandbox pilot</th>
                <td>12–20 weeks</td>
                <td>6–10 weeks</td>
                <td>
                  Plausible with fixed scope and bank-domain participation.
                </td>
              </tr>
              <tr>
                <th scope="row">Limited real-money bank deployment</th>
                <td colSpan={2}>
                  Budget many months, roughly 6–18+ overall; integrations,
                  assurance and bank acceptance can dominate either approach.
                </td>
                <td>
                  Only if substantial bank infrastructure and approvals already
                  exist.
                </td>
              </tr>
              <tr>
                <th scope="row">
                  Broad Finacle-equivalent platform from scratch
                </th>
                <td colSpan={2}>
                  A multi-year programme with a substantially larger
                  organisation.
                </td>
                <td>Not credible for this team and timeframe.</td>
              </tr>
            </tbody>
          </table>
        </section>
        <p>
          These ranges are engineering judgment, not empirical productivity
          findings, contractual commitments or an independently validated
          comparison. They assume stable scope and experienced staff. Bank
          specialists, compliance decisions and independent security review add
          participation beyond the five developers.
        </p>
        <details className="story-details">
          <summary>What a focused ten-week team would work on</summary>
          <ol className="story-plan">
            <li>
              <strong>Weeks 1–2:</strong> freeze scope, assign banking and
              control ownership, define acceptance evidence.
            </li>
            <li>
              <strong>Weeks 3–4:</strong> identity boundaries, integration
              contracts, financial failure and recovery paths.
            </li>
            <li>
              <strong>Weeks 5–6:</strong> reconciliation, restore drills,
              observability and agreed performance targets.
            </li>
            <li>
              <strong>Weeks 7–8:</strong> bank-led UAT, integration tests and
              independent security assessment.
            </li>
            <li>
              <strong>Weeks 9–10:</strong> remediation and a controlled pilot
              only when its exit gates pass.
            </li>
          </ol>
          <p>
            A possible allocation is two developers for banking/integration, one
            for experience, one for quality and one for platform/security. Token
            allocation does not replace independent review or bank operational
            ownership.
          </p>
        </details>
        <aside className="story-history">
          <h3>The historical Finacle benchmark</h3>
          <p>
            Infosys reported over <strong>240,000 person-days</strong> for
            Finacle version 10 and over <strong>US$60 million</strong> invested
            during the preceding three years, in its February 2008 announcement.
            This is a version-specific historical benchmark, not the total
            lifetime investment in Finacle.{" "}
            <a href="https://www.finacle.com/news-room/press-release/finacle-infosys-unveils-finacle-10-next-generation-solution-banking-transformation/">
              Read the official announcement{" "}
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </p>
          <p>
            Five developers over ten five-day weeks provide 250 person-days. The
            published figure exceeds 960 times that effort. The difference
            reflects radically different scope, assurance and context; it cannot
            establish a 960× AI productivity gain. The historical US-dollar
            investment is not a current rebuild estimate.
          </p>
        </aside>
      </section>

      <footer className="story-footer">
        <CheckCheck size={30} aria-hidden="true" />
        <h2>A working demonstration. An open invitation to inspect.</h2>
        <p>
          Try both sides of the counter, follow the same synthetic money and
          assess the evidence behind each claim.
        </p>
        <a className="story-link" href="#demo-entry">
          Explore the demo journeys <ArrowRight size={18} aria-hidden="true" />
        </a>
        <div className="story-credits">
          <h3>Built on shared foundations</h3>
          <p>
            Created by SenG with AI coding assistance. Core banking engine:{" "}
            <a href="https://fineract.apache.org/">Apache Fineract</a>, an
            Apache Software Foundation project. Application foundations include
            Next.js, React, Effect, Radix UI, Bun, PostgreSQL and Cloudflare.
          </p>
          <p>
            Finacle, from Infosys/EdgeVerve, is credited as project inspiration
            and a public banking-product reference. OpenFinacle is an
            independent demonstration, with no affiliation, endorsement or
            certification implied. Finacle is not the engine used here. Product
            names and trademarks belong to their respective owners; OpenFinacle
            remains a working name.
          </p>
          <p>
            Assessment date: 18 October 2026. Screenshots are synthetic
            acceptance fixtures. Only sample details and demonstration money
            should be used.
          </p>
        </div>
      </footer>
    </div>
  );
}
