"use client";

import { gates } from "../../product/product-evidence";
import "../assessment-report.css";
import { TableRegion } from "../evidence-presentation";
export function ProductionReadiness() {
  return (
    <section
      id="readiness"
      className="evidence-section evidence-readiness"
      aria-labelledby="readiness-title"
    >
      <div className="evidence-section-heading">
        <h2 id="readiness-title">
          The production gap is an acceptance programme.
        </h2>
        <p>
          Selected controls exist. Independent end-to-end bank acceptance
          remains outstanding. Each gate needs a named owner, an agreed
          threshold and evidence that survives adverse conditions.
        </p>
      </div>
      <TableRegion label="Scrollable production acceptance gates">
        <table>
          <caption>
            Required acceptance gates · planning framework, not legal or
            regulatory certification
          </caption>
          <thead>
            <tr>
              <th scope="col">Gate</th>
              <th scope="col">Accountable participants</th>
              <th scope="col">Evidence required before release</th>
              <th scope="col">Current acceptance</th>
            </tr>
          </thead>
          <tbody>
            {gates.map(([name, owner, evidence]) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                <td>{owner}</td>
                <td>{evidence}</td>
                <td>
                  <span className="evidence-gate-state">Outstanding</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableRegion>
      <p className="evidence-note">
        Core engine features do not automatically satisfy these
        implementation-level gates. Regulatory applicability and acceptance
        criteria must be established with the target institution and
        jurisdiction.
      </p>
    </section>
  );
}
