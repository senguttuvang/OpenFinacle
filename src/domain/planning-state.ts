import { Data, Effect, Schema } from "effect";
import {
  PlanningAssumptions,
  type PlanningHousehold,
  planningModel,
} from "./planning";

export class PlanningError extends Data.TaggedError("PlanningError")<{
  message: string;
  status: number;
}> {}
export const PlanningScenario = Schema.Struct({
  id: Schema.String.pipe(Schema.pattern(/^[a-zA-Z0-9_-]{1,80}$/)),
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(80)),
  version: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  assumptions: PlanningAssumptions,
});
export type PlanningScenario = typeof PlanningScenario.Type;
export const PlanningState = Schema.Struct({
  model: Schema.Literal("india-household-v1"),
  household: Schema.String,
  version: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  scenarios: Schema.Array(PlanningScenario).pipe(Schema.maxItems(20)),
  budgets: Schema.Record({
    key: Schema.String,
    value: Schema.Number.pipe(Schema.int(), Schema.between(0, 1000000000)),
  }),
  acknowledged: Schema.Array(Schema.String).pipe(Schema.maxItems(100)),
  adviserConsent: Schema.Boolean,
});
export type PlanningState = typeof PlanningState.Type;
export const initialPlanningState = (h: PlanningHousehold): PlanningState => ({
  model: planningModel,
  household: h.id,
  version: 0,
  scenarios: [
    {
      id: "baseline",
      name: "Baseline",
      version: 0,
      assumptions: h.assumptions,
    },
    {
      id: "retire-early",
      name: "Earlier retirement",
      version: 0,
      assumptions: {
        ...h.assumptions,
        retireAge: Math.max(h.assumptions.age, 55),
      },
    },
    {
      id: "step-up",
      name: "SIP step-up 10%",
      version: 0,
      assumptions: { ...h.assumptions, sipStep: 1000 },
    },
    {
      id: "career-break",
      name: "Career break and medical shock",
      version: 0,
      assumptions: {
        ...h.assumptions,
        breakMonths: 12,
        medicalShock: 50000000,
      },
    },
    {
      id: "adverse",
      name: "Adverse early retirement sequence",
      version: 0,
      assumptions: {
        ...h.assumptions,
        retireAge: Math.max(h.assumptions.age, 55),
        adverseSequence: true,
      },
    },
    {
      id: "prepay",
      name: "Home loan prepayment",
      version: 0,
      assumptions: { ...h.assumptions, prepayment: 100000000 },
    },
  ],
  budgets: {
    Groceries: Math.round(h.assumptions.essential * 0.2),
    Dining: Math.round(h.assumptions.discretionary * 0.35),
    Shopping: Math.round(h.assumptions.discretionary * 0.35),
    Travel: Math.round(h.assumptions.discretionary * 0.35),
  },
  acknowledged: [],
  adviserConsent: false,
});
export const validatePlanningState = (value: unknown, household: string) =>
  Schema.decodeUnknown(PlanningState, { onExcessProperty: "error" })(
    value,
  ).pipe(
    Effect.mapError(
      () =>
        new PlanningError({
          message:
            "Saved planning data has invalid inputs or an unsupported model. Preserve this record and inspect its version.",
          status: 400,
        }),
    ),
    Effect.flatMap((state) => {
      if (state.household !== household)
        return Effect.fail(
          new PlanningError({
            message: "Planning state belongs to another household.",
            status: 403,
          }),
        );
      if (
        new Set(state.scenarios.map((s) => s.id)).size !==
          state.scenarios.length ||
        !state.scenarios.some((s) => s.id === "baseline")
      )
        return Effect.fail(
          new PlanningError({
            message: "Keep one baseline and unique scenario references.",
            status: 400,
          }),
        );
      if (
        state.scenarios.some((s) => s.assumptions.longevity < s.assumptions.age)
      )
        return Effect.fail(
          new PlanningError({
            message:
              "The planning horizon must not precede current age; an earlier retirement age is valid for an already-retired household.",
            status: 400,
          }),
        );
      return Effect.succeed(state);
    }),
  );
export const transitionPlanningState = (
  current: PlanningState,
  proposed: PlanningState,
) =>
  validatePlanningState(proposed, current.household).pipe(
    Effect.flatMap((next) => {
      if (
        next.scenarios.some((scenario) => {
          const previous = current.scenarios.find((s) => s.id === scenario.id);
          if (!previous) return scenario.version !== 0;
          const changed =
            scenario.name !== previous.name ||
            JSON.stringify(scenario.assumptions) !==
              JSON.stringify(previous.assumptions);
          return changed
            ? scenario.version !== previous.version + 1
            : ![previous.version, previous.version + 1].includes(
                scenario.version,
              );
        })
      )
        return Effect.fail(
          new PlanningError({
            message:
              "Scenario snapshots require an ordered version for each changed set of assumptions.",
            status: 409,
          }),
        );
      return next.version !== current.version
        ? Effect.fail(
            new PlanningError({
              message:
                "This household changed. Reload before saving your edits.",
              status: 409,
            }),
          )
        : Effect.succeed({ ...next, version: current.version + 1 });
    }),
  );
