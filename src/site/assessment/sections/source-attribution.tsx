"use client";

import { Check } from "lucide-react";
import {
  assessmentDate,
  type SourceId,
  sources,
} from "../../product/product-evidence";
import "../assessment-report.css";
import { Source } from "../evidence-presentation";
export function SourceAttribution() {
  return (
    <footer className="evidence-section evidence-footer">
      <h2>Attribution, sources and the limits of this assessment.</h2>
      <div className="evidence-scope-grid">
        <div>
          <h3>Actual foundations</h3>
          <p>
            Created by SenG with AI coding assistance. Apache Fineract, an
            Apache Software Foundation project, is the actual banking core.
            Other foundations include Next.js, React, Effect, Radix UI, Bun,
            PostgreSQL and Cloudflare.
          </p>
        </div>
        <div>
          <h3>Product reference</h3>
          <p>
            Finacle (Infosys / EdgeVerve) is inspiration and a public comparison
            reference. OpenFinacle is an independent demonstration, with no
            affiliation, endorsement or certification implied. The working name
            carries no legal or trademark-clearance claim.
          </p>
        </div>
        <div>
          <h3>The PhotoCraft analogy</h3>
          <p>
            PhotoCraft describes an independent Photoshop reimplementation. The
            useful idea is inspectable behaviour and explicit limits, not a
            claim that Adobe is open source. Banking adds accounting, control
            and institutional acceptance obligations.{" "}
            <Source id="photocraft">Project self-description</Source>
          </p>
        </div>
      </div>
      <details className="evidence-method">
        <summary>
          <Check size={18} aria-hidden="true" /> Source register · provenance &
          dates
        </summary>
        <ul className="evidence-source-register">
          {Object.entries(sources).map(([id, source]) => (
            <li key={id}>
              <Source id={id as SourceId} />
              <span>{source.kind}</span>
            </li>
          ))}
        </ul>
      </details>
      <p className="evidence-note">
        Assessment date: {assessmentDate}. Reported = firsthand estimate;
        observed = dated maintainer record; tested = selected automated
        execution; modelled = explicit planning assumption; proposed = future
        scope. None means independently accepted production capability.{" "}
        <a href="/assessment">Permanent public assessment URL</a>.
      </p>
    </footer>
  );
}
