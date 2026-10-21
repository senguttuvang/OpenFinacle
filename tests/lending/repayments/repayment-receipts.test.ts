import { expect, test } from "bun:test";
import { createHarness } from "./loan-repayment-persistence.harness";

const harness = await createHarness();
test("Indian midnight blocks dispatch even within fifteen minutes and orphan claims cannot own lending operations", () => {
  const db = harness.harness();
  const quoted = Date.parse("2026-10-17T18:29:00Z");
  const accepted = quoted + 1000;
  const midnight = quoted + 61000;
  const lateOffer = {
    ...harness.originalOffer,
    quoted_at: quoted,
    expires_at: quoted + 900000,
  };
  harness.offer(db, lateOffer);
  harness.submit(db, { consented_at: accepted, at_ms: accepted });
  harness.decision(db, "recommend", "officer", {
    consented_at: accepted,
    at_ms: quoted + 2000,
  });
  const lateCommand = {
    ...harness.command,
    offer: lateOffer,
    consented_at: accepted,
  };
  expect(() =>
    harness.reserve(db, {
      command_json: JSON.stringify(lateCommand),
      started_at: midnight,
      observed_at: midnight,
    }),
  ).toThrow();
  harness.reserve(db, {
    command_json: JSON.stringify(lateCommand),
    started_at: quoted + 3000,
    observed_at: quoted + 3000,
  });
  expect(harness.row(db, "loan_repayment_operations")).toMatchObject({
    status: "executing",
  });
  const other = harness.harness();
  expect(() =>
    other.run(
      "INSERT INTO core_write_claims(id,owner_kind,owner_id,bank_id,account_id,origin,status,version,created_at,updated_at) VALUES('loan:orphan','loan','orphan','loan-test-bank',51,'loan','executing',0,'same','same')",
    ),
  ).toThrow();
  expect(() =>
    other.run(
      "UPDATE core_write_claims SET status='uncertain',version=version+1 WHERE owner_id='original-operation-0'",
    ),
  ).toThrow();
  expect(harness.row(other, "loan_applications")).toMatchObject({
    status: "active",
    version: 7,
  });
});
