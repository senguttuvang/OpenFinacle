"use client";

import { FormSelect } from "../../../platform/form-controls/form-select";
import {
  assessmentDate,
  capabilities,
  statuses,
} from "../../product/product-evidence";
import "../assessment-report.css";
import { Source, Status, TableRegion } from "../evidence-presentation";
import type { AssessmentContext } from "../use-assessment";
export function CapabilityMatrix({ context }: { context: AssessmentContext }) {
  const { area, setArea, status, setStatus, visible } = context;
  return (
    <section
      id="capabilities"
      className="evidence-section evidence-matrix-section"
      aria-labelledby="capability-title"
    >
      <div className="evidence-section-heading">
        <h2 id="capability-title">
          Capability, engine, product.
          <br />
          Keep the layers separate.
        </h2>
        <p>
          OpenFinacle is this implementation. Fineract 1.15.0 is its open-source
          core. Finacle is a broader commercial reference, not the engine or an
          equivalent deployment.
        </p>
      </div>
      <div className="evidence-filters">
        <div>
          <label htmlFor="evidence-area">Capability area</label>
          <FormSelect
            id="evidence-area"
            value={area}
            onValueChange={setArea}
            options={[
              "All areas",
              "Retail journeys",
              "Products",
              "Bank controls",
              "Future channels",
            ].map((value) => ({ value, label: value }))}
          />
        </div>
        <div>
          <label htmlFor="evidence-status">Implementation status</label>
          <FormSelect
            id="evidence-status"
            value={status}
            onValueChange={setStatus}
            options={[
              { value: "all", label: "All statuses" },
              ...statuses.map((s) => ({ value: s.id, label: s.label })),
            ]}
          />
        </div>
        <p role="status">
          Showing {visible.length} of {capabilities.length} selected groups
        </p>
      </div>
      <TableRegion label="Scrollable capability comparison">
        <table className="evidence-matrix">
          <caption>
            Selected capability comparison · {assessmentDate}. All rows still
            require bank-specific acceptance.
          </caption>
          <thead>
            <tr>
              <th scope="col">Capability / implementation boundary</th>
              <th scope="col">OpenFinacle</th>
              <th scope="col">Fineract upstream</th>
              <th scope="col">Finacle reference</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.name}>
                <th scope="row">
                  {row.name}
                  <span className="evidence-boundary">{row.boundary}</span>
                </th>
                <td>
                  <Status id={row.status} />
                  <Source id={row.proof}>App evidence</Source>
                </td>
                <td>
                  {row.fineract}
                  <Source id="fineract">Documentation</Source>
                </td>
                <td>
                  {row.finacle}
                  <Source id={row.source}>Vendor source</Source>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableRegion>
      {visible.length === 0 && (
        <p className="evidence-empty">
          No groups match these filters. Select “All areas” or “All statuses” to
          widen the view.
        </p>
      )}
      <p className="evidence-note">
        “Not assessed” means unknown in this review, not absent from a vendor
        product. Upstream features require configuration, integration and
        validation here. Bundled commercial modules and deployed scope vary by
        bank.
      </p>
    </section>
  );
}
