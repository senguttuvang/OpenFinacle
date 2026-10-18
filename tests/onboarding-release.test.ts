import { expect, test } from "bun:test";
import { Effect } from "effect";
import { verifyWorkflowDump } from "../src/cli/workflow-release";

const baseline = [
  "settings",
  "banks",
  "sessions",
  "applications",
  "beneficiaries",
  "commands",
  "audit",
  "documents",
  "service_requests",
  "usage_limits",
  "financial_snapshots",
  "demo_seed_lease",
]
  .map((table) => `CREATE TABLE ${table}(id TEXT PRIMARY KEY);`)
  .join("\n");

test("workflow backup verification permits pre-onboarding and complete onboarding schema but rejects partial guards", async () => {
  const onboarding = await Bun.file(
    "migrations/0017_customer_onboarding.sql",
  ).text();
  await Effect.runPromise(verifyWorkflowDump(baseline));
  await Effect.runPromise(verifyWorkflowDump(`${baseline}\n${onboarding}`));
  for (const partial of [
    onboarding.split("CREATE TRIGGER onboarding_original_identity")[0],
    onboarding.split("CREATE TRIGGER onboarding_no_reset")[0],
  ]) {
    const result = await Effect.runPromise(
      Effect.either(verifyWorkflowDump(`${baseline}\n${partial}`)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left")
      expect(result.left.message).toContain("did not restore");
  }
});
