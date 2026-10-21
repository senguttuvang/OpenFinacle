"use client";

import "../assessment-report.css";
export function AssessmentNavigation() {
  return (
    <nav className="evidence-nav" aria-label="Assessment sections">
      <a href="#project">Assessment</a>
      <a href="#capabilities">Comparison</a>
      <a href="#proof">Evidence</a>
      <a href="#readiness">Production gates</a>
      <a href="#build">Effort & investment</a>
      <a href="#agents">Agent-connected banking</a>
    </nav>
  );
}
