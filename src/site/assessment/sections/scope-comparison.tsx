"use client";

import { CircleHelp } from "lucide-react";
import { assessmentDate, statuses } from "../../product/product-evidence";
import "../assessment-report.css";
import { Status } from "../evidence-presentation";
export function ScopeComparison() {
  return (
    <section className="evidence-section" aria-labelledby="scope-title">
      <div className="evidence-section-heading">
        <h2 id="scope-title">Define the comparison before counting.</h2>
        <p>
          The unit is a capability group with an explicit boundary. A visible
          menu, an upstream API and an accepted bank control are different kinds
          of evidence.
        </p>
      </div>
      <div className="evidence-scope-grid">
        <div>
          <h3>Included</h3>
          <p>
            Individual INR savings, customer and branch journeys, selected
            product workflows and the controls needed to assess them.
          </p>
        </div>
        <div>
          <h3>Outside the denominator</h3>
          <p>
            Full corporate banking, trade finance, treasury, multi-country
            coverage and the complete Finacle product portfolio.
          </p>
        </div>
        <div>
          <h3>Method & limitations</h3>
          <p>
            16 unweighted, selected groups as of {assessmentDate}. No
            comprehensive vendor denominator, parity percentage or readiness
            score. Vendor descriptions are attributed claims, not independent
            tests.
          </p>
        </div>
      </div>
      <details className="evidence-method">
        <summary>
          <CircleHelp size={18} aria-hidden="true" /> How to read the evidence
        </summary>
        <dl>
          {statuses.map((s) => (
            <div key={s.id}>
              <dt>
                <Status id={s.id} />
              </dt>
              <dd>{s.meaning}</dd>
            </div>
          ))}
        </dl>
        <p>
          <strong>Evidence ladder:</strong> visible UI → implemented workflow →
          actual Core effect → tested failure/recovery → independent bank
          acceptance. Higher assurance requires new evidence; it cannot be
          inferred from a screen or test count.
        </p>
      </details>
    </section>
  );
}
