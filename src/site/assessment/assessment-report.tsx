"use client";

import type { ReactNode } from "react";
import { AgentWorkflows } from "./sections/agent-workflows";
import { AssessmentHeader } from "./sections/assessment-header";
import { AssessmentNavigation } from "./sections/assessment-navigation";
import { AssessmentSkip } from "./sections/assessment-skip";
import { BuildInvestment } from "./sections/build-investment";
import { CapabilityMatrix } from "./sections/capability-matrix";
import { DemoEntry } from "./sections/demo-entry";
import { ExperienceDesign } from "./sections/experience-design";
import { ImplementationProof } from "./sections/implementation-proof";
import { ProductionReadiness } from "./sections/production-readiness";
import { ProjectAssessment } from "./sections/project-assessment";
import { ScopeComparison } from "./sections/scope-comparison";
import { SourceAttribution } from "./sections/source-attribution";
import { useAssessment } from "./use-assessment";
export function AssessmentReport({ children }: { children?: ReactNode }) {
  const context = useAssessment({ children });
  return (
    <div className="product-story">
      <AssessmentSkip />
      <AssessmentHeader />
      <AssessmentNavigation />
      <ProjectAssessment />
      <ScopeComparison />
      <CapabilityMatrix context={context} />
      <ImplementationProof />
      <ProductionReadiness />
      <BuildInvestment context={context} />
      <AgentWorkflows context={context} />
      <ExperienceDesign />
      <DemoEntry context={context} />
      <SourceAttribution />
    </div>
  );
}
