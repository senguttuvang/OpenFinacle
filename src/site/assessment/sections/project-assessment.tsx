"use client";

import { ArrowDown, ShieldCheck } from "lucide-react";
import { capabilities, statuses } from "../../product/product-evidence";
import "../assessment-report.css";
import { Source } from "../evidence-presentation";
export function ProjectAssessment() {
  return (
    <section
      id="project"
      className="evidence-overview"
      aria-labelledby="assessment-title"
    >
      <div className="evidence-opening">
        <div>
          <h1 id="assessment-title">
            A working banking slice.
            <br />
            <em>An inspectable boundary.</em>
          </h1>
          <p>
            Can AI-assisted development turn a banking idea into a system a bank
            can evaluate? OpenFinacle connects customer and branch journeys to
            Apache Fineract, with real postings of synthetic money.
          </p>
          <a className="evidence-down" href="#proof">
            Inspect the proof <ArrowDown size={17} aria-hidden="true" />
          </a>
        </div>
        <aside className="evidence-verdict" aria-label="Assessment conclusion">
          <ShieldCheck size={28} aria-hidden="true" />
          <h2>
            Ready to inspect.
            <br />
            Bank acceptance outstanding.
          </h2>
          <dl>
            <div>
              <dt>Present</dt>
              <dd>
                Connected savings journeys, persistent workflows, selected
                recovery tests.
              </dd>
            </div>
            <div>
              <dt>Boundary</dt>
              <dd>
                Synthetic identities and money. No independent production
                acceptance.
              </dd>
            </div>
            <div>
              <dt>Decision</dt>
              <dd>
                Evaluate a bounded sandbox; fund assurance before any real-money
                use.
              </dd>
            </div>
          </dl>
        </aside>
      </div>
      <div className="evidence-summary">
        <figure className="evidence-distribution">
          <figcaption>
            <h2>What the selected scope contains</h2>
            <span>
              {capabilities.length} analyst-selected capability groups · count,
              not parity
            </span>
          </figcaption>
          <div className="evidence-stacked" aria-hidden="true">
            {statuses.map((s) => (
              <span
                key={s.id}
                className={s.id}
                style={{
                  flex: capabilities.filter((c) => c.status === s.id).length,
                }}
              />
            ))}
          </div>
          <ul className="evidence-legend">
            {statuses.map((s) => (
              <li key={s.id}>
                <span className={`evidence-dot ${s.id}`} />
                <strong>
                  {capabilities.filter((c) => c.status === s.id).length}
                </strong>{" "}
                {s.label}
              </li>
            ))}
          </ul>
        </figure>
        <div className="evidence-baseline">
          <h2>Evidence checkpoint</h2>
          <p>
            <strong>1d0b8a8</strong> · baseline release
            <br />
            342 automated tests · 87 workspace checks
          </p>
          <Source id="checks">Inspect dated execution record</Source>
          <small>
            Test execution is not certification, coverage or defect absence.
          </small>
        </div>
      </div>
    </section>
  );
}
