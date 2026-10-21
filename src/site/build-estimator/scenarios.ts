import {
  type ComparisonInput,
  defaultComparison,
} from "../build-story/build-recipe-model";

/** Scope presets wrap the canonical model; production is deliberately not priced. */
export const estimatorScenarios = [
  {
    id: "prototype",
    name: "Prototype reproduction",
    scope: "journeys",
    modules: ["accounts", "branch", "products"],
    included: "Accounts & payments · customer & branch · deposits & cards",
    excluded:
      "Live rails, KYC/AML, migration, independent assurance and bank operations",
    basis:
      "Selected application journeys on an existing core such as Apache Fineract. Synthetic data; no new core.",
    estimable: true,
  },
  {
    id: "pilot",
    name: "Controlled-pilot foundations",
    scope: "pilot",
    modules: ["accounts", "branch", "products", "reconciliation", "operations"],
    included:
      "Prototype slice + ledger/reconciliation + security/operations foundations + expert controls",
    excluded:
      "Bank-specific KYC/AML, live rails, migration, certification and production acceptance",
    basis:
      "The same existing-core application slice, with modelled hardening and human control work. A planning hypothesis, not pilot approval.",
    estimable: true,
  },
  {
    id: "production",
    name: "Production-bank program",
    scope: "pilot",
    modules: [],
    included:
      "Bank-defined product, compliance, identity, rails, resilience, migration and operations program",
    excluded:
      "No bank-specific requirements, dependency dates or acceptance evidence have been supplied",
    basis:
      "Requires bank discovery and workstream estimates. Prototype/pilot coefficients cannot establish a production-bank budget or date.",
    estimable: false,
  },
] as const;
export type EstimatorScenario = (typeof estimatorScenarios)[number];

export function comparisonFor(
  scenario: EstimatorScenario,
  weeks: number,
): ComparisonInput {
  return {
    ...defaultComparison,
    weeks,
    scope: scenario.scope,
    modules: scenario.modules,
  };
}
