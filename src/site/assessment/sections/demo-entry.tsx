"use client";

import { ArrowRight } from "lucide-react";
import "../assessment-report.css";
import type { AssessmentContext } from "../use-assessment";
export function DemoEntry({ context }: { context: AssessmentContext }) {
  const { children } = context;
  return (
    <section
      id="demo-entry"
      className="evidence-section evidence-demo"
      aria-labelledby="demo-title"
    >
      <div className="evidence-section-heading">
        <h2 id="demo-title">Try a bounded banking journey.</h2>
        <p>
          Use sample details and synthetic money only. Inspect a statement,
          follow customer and staff views, or explore saved household scenarios
          in Wealth & Planning.
        </p>
      </div>
      {children ?? (
        <a className="evidence-demo-link" href="/#demo-entry">
          Open the banking workspace <ArrowRight size={18} aria-hidden="true" />
        </a>
      )}
    </section>
  );
}
