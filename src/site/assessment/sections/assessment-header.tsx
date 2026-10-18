"use client";

import { Landmark } from "lucide-react";
import { assessmentDate } from "../../product/product-evidence";
import "../assessment-report.css";
export function AssessmentHeader() {
  return (
    <header className="evidence-header">
      <a className="evidence-brand" href="/assessment">
        <Landmark size={25} aria-hidden="true" />
        OpenFinacle<span>.</span>
      </a>
      <span>
        Banking capability assessment{" "}
        <span className="evidence-date">/ {assessmentDate}</span>
      </span>
    </header>
  );
}
