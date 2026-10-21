"use client";
import { type ReactNode, useState } from "react";
import { capabilities } from "../product/product-evidence";
import { plans } from "./evidence-presentation";
import "./assessment-report.css";
export function useAssessment({ children }: { children?: ReactNode }) {
  const [area, setArea] = useState("All areas");
  const [status, setStatus] = useState("all");
  const [developers, setDevelopers] = useState("5");
  const [weeks, setWeeks] = useState("10");
  const [budget, setBudget] = useState(100);
  const [plan, setPlan] = useState<keyof typeof plans>("sandbox");
  const [agentMode, setAgentMode] = useState("read");
  const developerWeeks = Number(developers) * Number(weeks);
  const days = developerWeeks * 5;
  const visible = capabilities.filter(
    (row) =>
      (area === "All areas" || row.area === area) &&
      (status === "all" || row.status === status),
  );
  return {
    children,
    area,
    setArea,
    status,
    setStatus,
    developers,
    setDevelopers,
    weeks,
    setWeeks,
    budget,
    setBudget,
    plan,
    setPlan,
    agentMode,
    setAgentMode,
    developerWeeks,
    days,
    visible,
  };
}
export type AssessmentContext = ReturnType<typeof useAssessment>;
