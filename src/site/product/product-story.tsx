"use client";

import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Landmark,
  LockKeyhole,
  MessageSquare,
  Network,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import Image from "next/image";
import { type ReactNode, useState } from "react";
import { BuildRecipe } from "../build-story/build-recipe";
import { sources } from "./product-evidence";
import { ProductTable } from "./product-table";
import "./product-story.css";

const comparison = [
  [
    "Everyday savings",
    "Connected customer & account journeys",
    "Core banking product scope",
  ],
  [
    "Statements & internal transfers",
    "Core-backed synthetic transactions",
    "Core + digital banking scope",
  ],
  [
    "Customer & branch collaboration",
    "Shared journeys with separate staff decisions",
    "Core + digital banking scope",
  ],
  [
    "Personal loans",
    "Selected origination & repayment pilot",
    "Broader lending product scope",
  ],
  [
    "Deposits, cards & services",
    "Persistent simulated product workflows",
    "Core / digital product scope",
  ],
  [
    "Household & wealth",
    "Synthetic planning today; investment services proposed",
    "Separate wealth management suite",
  ],
  [
    "Identity & external payments",
    "Production integrations to add",
    "Bank-specific configuration / suites",
  ],
  [
    "Operations & rollout",
    "A path to production to develop with a bank",
    "Deployment-specific operating programme",
  ],
] as const;
function LearnMore({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="magazine-link" href={href}>
      {children}
      <ArrowUpRight size={18} aria-hidden="true" />
    </a>
  );
}
function GitHubLink() {
  return (
    <a
      className="magazine-github"
      href="https://github.com/senguttuvang/OpenFinacle"
      title="OpenFinacle repository · access required"
    >
      GitHub <ArrowUpRight size={16} aria-hidden="true" />
    </a>
  );
}
function Screen({
  id,
  alt,
  className = "",
}: {
  id: string;
  alt: string;
  className?: string;
}) {
  return (
    <Image
      className={className}
      src={`/product/${id}.webp`}
      alt={alt}
      width={1440}
      height={
        (
          {
            accounts: 1624,
            statements: 1624,
            planning: 4492,
            branch: 1743,
          } as Record<string, number>
        )[id] ?? 1000
      }
      unoptimized
    />
  );
}
export function ProductStory({ children }: { children?: ReactNode }) {
  const [view, setView] = useState("customer");
  return (
    <div className="magazine">
      <a className="magazine-skip" href="#inside">
        Skip to capabilities
      </a>
      <header className="magazine-header">
        <a className="magazine-brand" href="/discover">
          <Landmark size={27} aria-hidden="true" />
          OpenFinacle<span>.</span>
        </a>
        <nav aria-label="Explore OpenFinacle">
          <a href="#experience">The experience</a>
          <a href="#inside">What’s inside</a>
          <a href="#next">What’s next</a>
          <a href="#imagine">Build your version</a>
          <GitHubLink />
        </nav>
      </header>
      <section className="magazine-cover" aria-labelledby="cover-title">
        <div className="magazine-cover-copy">
          <h1 id="cover-title">
            Banking, seen
            <br />
            from <span>both sides.</span>
          </h1>
          <p>
            A customer’s everyday banking. A branch’s working day. One connected
            story, from the first account to the next ambition.
          </p>
          <p className="magazine-cover-note">
            Meet OpenFinacle: a working prototype powered by Apache Fineract,
            built to explore what a more connected bank could feel like.
          </p>
          <a className="magazine-cover-link" href="#experience">
            See the experience <ArrowDown size={18} aria-hidden="true" />
          </a>
          <span className="magazine-prototype">
            <span /> Live prototype · Synthetic data & money
          </span>
        </div>
        <figure className="magazine-cover-art">
          <div className="magazine-cover-screen">
            <Screen
              id="accounts"
              alt="OpenFinacle customer savings screen with synthetic account data"
            />
          </div>
          <div className="magazine-cover-branch">
            <Screen
              id="branch"
              alt="The same prototype from the branch viewpoint, using synthetic data"
            />
          </div>
          <figcaption>
            Different viewpoints. A connected relationship.
            <br />
            Actual prototype screens, with sample data.
          </figcaption>
        </figure>
      </section>
      <section
        id="imagine"
        className="magazine-imagine"
        aria-labelledby="imagine-title"
      >
        <div className="magazine-imagine-heading">
          <div>
            <h2 id="imagine-title">
              Decades of banking.
              <br />
              <span>Ten weeks to build.</span>
            </h2>
            <p>
              Finacle’s product journey. A new human-led team. A new AI-first
              team. Shape the talent, scope and budget, then explore what each
              could deliver in ten weeks. The judgment is yours.
            </p>
          </div>
          <div className="magazine-build-note">
            <Sparkles aria-hidden="true" />
            <p>
              The founder reports a week and about 500M AI tokens to reach this
              prototype, building on an existing open-source core. The
              comparison below explores different scopes and people with
              explicit assumptions.
            </p>
            <LearnMore href="/build-story">
              The story behind the build
            </LearnMore>
          </div>
        </div>
        <BuildRecipe />
      </section>
      <section
        id="experience"
        className="magazine-feature"
        aria-labelledby="experience-title"
      >
        <div className="magazine-feature-intro">
          <h2 id="experience-title">
            The account is only
            <br />
            <span>the beginning.</span>
          </h2>
          <p>
            Open a relationship, follow a payment, find a saved payee. Then
            cross the counter and see how the branch helps the same customer.
          </p>
          <LearnMore href="/capabilities">
            Explore the connected journeys
          </LearnMore>
        </div>
        <div className="magazine-view-switch">
          <fieldset>
            <legend>Choose your viewpoint</legend>
            <button
              type="button"
              aria-pressed={view === "customer"}
              onClick={() => setView("customer")}
            >
              <Wallet size={18} aria-hidden="true" />
              Customer
            </button>
            <button
              type="button"
              aria-pressed={view === "branch"}
              onClick={() => setView("branch")}
            >
              <Users size={18} aria-hidden="true" />
              Branch team
            </button>
          </fieldset>
          <figure>
            <Screen
              id={view === "customer" ? "statements" : "branch"}
              alt={
                view === "customer"
                  ? "Synthetic customer statement with transaction search and export"
                  : "Synthetic branch queues and staff workflows"
              }
            />
            <figcaption aria-live="polite">
              {view === "customer"
                ? "Your account, its history, and the next thing you want to do."
                : "Shared customer context, an officer’s review and a separate approver’s decision."}
            </figcaption>
          </figure>
        </div>
      </section>
      <section
        id="inside"
        className="magazine-inside"
        aria-labelledby="inside-title"
      >
        <div className="magazine-inside-title">
          <h2 id="inside-title">
            More of the everyday.
            <br />
            Less of the disconnected.
          </h2>
          <p>
            Familiar banking tasks, brought together in one prototype. Some
            connect to the core; others let you explore a product experience
            with saved, simulated records.
          </p>
        </div>
        <div className="magazine-capability-list">
          <article>
            <span>Accounts & payments</span>
            <h3>Follow the same money.</h3>
            <p>
              Customer-scoped savings, statements, internal INR transfers and
              teller cash journeys connect to Fineract. Review the instruction,
              then follow its outcome.
            </p>
            <LearnMore href="/capabilities#everyday">
              Everyday banking
            </LearnMore>
          </article>
          <article>
            <span>Products & service</span>
            <h3>A relationship that keeps its history.</h3>
            <p>
              Explore saved deposit, card, profile and service workflows. A
              selected personal-loan pilot adds another part of the
              relationship.
            </p>
            <LearnMore href="/capabilities#products">
              Products and their boundaries
            </LearnMore>
          </article>
        </div>
      </section>
      <section className="magazine-planning" aria-labelledby="planning-title">
        <figure>
          <Screen
            id="planning"
            alt="Synthetic household planning with cash flow, goals and saved scenarios"
          />
          <figcaption>
            Household planning is live with synthetic data. Investment execution
            and regulated wealth services are future scope.
          </figcaption>
        </figure>
        <div>
          <h2 id="planning-title">
            A bigger picture
            <br />
            than a balance.
          </h2>
          <p>
            A household has goals, commitments and choices. Bring budgets, cash
            flow and saved scenarios into the conversation, with a clear
            boundary for adviser consent.
          </p>
          <LearnMore href="/capabilities#planning">
            Meet household planning
          </LearnMore>
          <p className="magazine-aside">
            Imagine the next chapter: connected wealth services, with the
            custody, advice and execution controls they deserve.
          </p>
        </div>
      </section>
      <section id="next" className="magazine-next" aria-labelledby="next-title">
        <div className="magazine-next-heading">
          <h2 id="next-title">
            A prototype today.
            <br />
            <span>A platform to take further.</span>
          </h2>
          <p>
            The next step is to shape this around a real institution: its
            people, products, controls and operating model. Production quality
            grows through a deliberate programme, not a change of label.
          </p>
        </div>
        <div className="magazine-growth-path">
          <article>
            <span className="magazine-path-dot" />
            <h3>Shape it to the bank</h3>
            <p>
              Choose the customer journeys. Configure product rules. Connect
              real identity and the bank’s systems.
            </p>
          </article>
          <article>
            <span className="magazine-path-dot" />
            <h3>Make it dependable</h3>
            <p>
              Add reconciliation, payment rails, security, resilience and an
              operating team that can own the service.
            </p>
          </article>
          <article>
            <span className="magazine-path-dot" />
            <h3>Grow with confidence</h3>
            <p>
              Rehearse migration, work through bank acceptance and move into a
              controlled pilot when the bank is ready.
            </p>
          </article>
        </div>
        <LearnMore href="/roadmap">
          The path to a production-grade system
        </LearnMore>
      </section>
      <section className="magazine-future" aria-labelledby="future-title">
        <div className="magazine-future-copy">
          <h2 id="future-title">
            Your bank.
            <br />
            Your AI.
            <br />
            <span>Your say.</span>
          </h2>
          <p>
            Tomorrow’s customer may arrive with an AI assistant of their own. A
            bank should be able to meet them there, with permission that is
            specific, understandable and easy to take back.
          </p>
          <LearnMore href="/roadmap#agents">
            Explore agent-connected banking
          </LearnMore>
        </div>
        <div className="magazine-future-map">
          <section
            className="magazine-agent-path"
            aria-label="Proposed customer AI connection"
          >
            <span>
              <Users aria-hidden="true" />
              You
            </span>
            <ArrowRight aria-hidden="true" />
            <span>
              <LockKeyhole aria-hidden="true" />
              Your consent
            </span>
            <ArrowRight aria-hidden="true" />
            <span>
              <Landmark aria-hidden="true" />
              Your bank
            </span>
          </section>
          <div className="magazine-future-stories">
            <article>
              <MessageSquare aria-hidden="true" />
              <div>
                <h3>A helpful banking conversation</h3>
                <p>
                  Proposed: an AI chatbot for grounded answers, guidance and a
                  clear route to a person.
                </p>
              </div>
            </article>
            <article>
              <Network aria-hidden="true" />
              <div>
                <h3>Bring your own AI harness</h3>
                <p>
                  Proposed: customer-facing MCP tools with scoped access,
                  revocation and confirmation before payments.
                </p>
              </div>
            </article>
          </div>
          <p className="magazine-caption">
            A future direction. Chatbot and customer MCP integration are not
            implemented in this prototype.
          </p>
        </div>
      </section>
      <section
        id="comparison"
        className="magazine-comparison"
        aria-labelledby="comparison-title"
      >
        <div>
          <h2 id="comparison-title">Where this fits.</h2>
          <p>
            A focused prototype beside a much broader banking product family.
            Eight selected areas give useful context; they are not a measure of
            overall parity.
          </p>
        </div>
        <ProductTable label="Scrollable eight-area comparison">
          <table>
            <caption>
              Selected scope · 18 October 2026 · vendor descriptions, not an
              equivalence claim
            </caption>
            <thead>
              <tr>
                <th scope="col">Area</th>
                <th scope="col">OpenFinacle prototype</th>
                <th scope="col">Finacle product family</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map(([name, ours, theirs]) => (
                <tr key={name}>
                  <th scope="row">{name}</th>
                  <td>{ours}</td>
                  <td>{theirs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ProductTable>
        <div className="magazine-comparison-links">
          <a href={sources.core.url}>
            Finacle core & digital scope{" "}
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>
          <a href={sources.wealth.url}>
            Finacle wealth suite <ArrowUpRight size={15} aria-hidden="true" />
          </a>
          <LearnMore href="/capabilities">
            Learn more about this prototype
          </LearnMore>
        </div>
      </section>
      <section
        id="demo-entry"
        className="magazine-demo"
        aria-labelledby="demo-title"
      >
        <div>
          <h2 id="demo-title">Step into the story.</h2>
          <p>
            Explore as a customer, start a synthetic application, or see the
            branch’s side. Use sample details and demonstration money only.
          </p>
        </div>
        {children ?? (
          <a className="magazine-action" href="/#demo-entry">
            Open the banking workspace{" "}
            <ArrowRight size={18} aria-hidden="true" />
          </a>
        )}
      </section>
      <footer className="magazine-footer">
        <a className="magazine-brand" href="/discover">
          <Landmark size={24} aria-hidden="true" />
          OpenFinacle<span>.</span>
        </a>
        <div>
          <p>
            Created by SenG with AI assistance. Powered by{" "}
            <a href="https://fineract.apache.org/">Apache Fineract</a>, an
            Apache Software Foundation project, and shared open-source
            foundations.
          </p>
          <p>
            Finacle (Infosys / EdgeVerve) is inspiration and a public reference,
            not the engine. OpenFinacle is an independent prototype and a
            working name; no affiliation or endorsement is implied.
          </p>
          <nav aria-label="Read more">
            <a href="/capabilities">Capabilities</a>
            <a href="/roadmap">The road ahead</a>
            <a href="/build-story">The build story</a>
            <a href="/assessment">Technical detail & sources</a>
            <GitHubLink />
          </nav>
        </div>
        <span className="magazine-footer-mark">
          <ShieldCheck size={18} aria-hidden="true" />
          Prototype · Synthetic data
        </span>
      </footer>
    </div>
  );
}
