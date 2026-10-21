import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import type { OnboardingDraft } from "../../src/platform/account-opening/domain/onboarding";
import type { Session } from "../../src/platform/banking-workspace/domain/banking";
import { Core, Store } from "../../src/platform/banking-workspace/domain/ports";
import { onboardingRoute } from "../../src/runtime/http/onboarding-http";
import { completedOnboarding } from "../fixtures/onboarding";

let db: Database;
const session: Session = {
  token_hash: "owner",
  bank_id: "branch",
  role: "customer",
  expires_at: Number.MAX_SAFE_INTEGER,
};
const operationId = "01234567-1234-4567-8901-123456789abc";
beforeEach(async () => {
  db = new Database(":memory:");
  for (const file of [...new Bun.Glob("*.sql").scanSync("migrations")].sort())
    db.exec(await Bun.file(`migrations/${file}`).text());
  db.run(
    "INSERT INTO banks(id,journey,status,recipient_account,employer_account) VALUES('branch','existing','ready',22,33)",
  );
  db.run(
    "INSERT INTO settings(key,value) VALUES('demo_existing_bank','branch')",
  );
  db.run(
    "INSERT INTO sessions(token_hash,bank_id,role,expires_at) VALUES('owner','branch','customer',9999999999999)",
  );
  db.run(
    "INSERT INTO financial_snapshots(bank_id,payload,synced_at,invalidated_at) VALUES('branch',?,1,0)",
    [
      JSON.stringify({
        account: { id: 1 },
        recipient: { id: 22 },
        employer: { id: 33 },
      }),
    ],
  );
});
afterEach(() => db.close());
const route = (path: string, body?: unknown, actor = session) =>
  Effect.runPromise(
    onboardingRoute(
      new Request(
        `http://localhost/api${path}`,
        body === undefined
          ? {}
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            },
      ),
      actor,
    ).pipe(
      Effect.provide(
        Layer.merge(
          Layer.succeed(Store, {
            one: <T>(sql: string, ...values: (string | number | null)[]) =>
              Effect.sync(() => db.query(sql).get(...values) as T | null),
            all: <T>(sql: string, ...values: (string | number | null)[]) =>
              Effect.sync(() => db.query(sql).all(...values) as T[]),
            run: (sql: string, ...values: (string | number | null)[]) =>
              Effect.sync(() => db.run(sql, values).changes),
          }),
          Layer.succeed(Core, {
            request: () =>
              Effect.die("Unexpected Core dispatch in onboarding HTTP test"),
          }),
        ),
      ),
    ),
  );
test("start allocates an independent registry scope, switches same session and resumes original after response loss", async () => {
  const response = await route("/onboarding/start", { operationId });
  const saved = (await response?.json()) as OnboardingDraft;
  expect(saved.bankId).toBe(`applicant-${operationId}`);
  expect(saved.operationId).toBe(operationId);
  const actor = { ...session, bank_id: saved.bankId };
  expect(
    db.query("SELECT bank_id FROM sessions WHERE token_hash='owner'").get(),
  ).toEqual({ bank_id: saved.bankId });
  expect(
    await (await route("/onboarding/start", { operationId }, actor))?.json(),
  ).toEqual(saved);
  expect(
    db.query("SELECT COUNT(*) AS n FROM customer_applicant_scopes").get(),
  ).toEqual({ n: 1 });
  expect(
    db.query("SELECT customer_account FROM banks WHERE id='branch'").get(),
  ).toEqual({ customer_account: 0 });
  await expect(
    route(
      "/onboarding/start",
      { operationId },
      { ...actor, token_hash: "another-owner" },
    ),
  ).rejects.toThrow("different session");
});
test("route validates payloads, stores resumable draft and rejects unknown fields", async () => {
  const saved = (await (
    await route("/onboarding/start", { operationId })
  )?.json()) as OnboardingDraft;
  const actor = { ...session, bank_id: saved.bankId };
  const result = await route(
    "/onboarding/draft",
    { version: 0, step: 6, fields: completedOnboarding },
    actor,
  );
  expect(await result?.json()).toMatchObject({
    fields: completedOnboarding,
    version: 1,
  });
  expect(
    await (await route("/onboarding", undefined, actor))?.json(),
  ).toMatchObject({ fields: completedOnboarding, version: 1 });
  await expect(
    route(
      "/onboarding/draft",
      { version: 1, step: 7, fields: completedOnboarding },
      actor,
    ),
  ).rejects.toThrow("invalid");
  await expect(
    route("/onboarding/start", { operationId, reset: true }, actor),
  ).rejects.toThrow("invalid");
  expect(await route("/unrelated", undefined, actor)).toBeNull();
});

test("legacy application route cannot bypass the staged record while original legacy flow remains", async () => {
  expect(await route("/application", {})).toBeNull();
  const saved = (await (
    await route("/onboarding/start", { operationId })
  )?.json()) as OnboardingDraft;
  await expect(
    route("/application", {}, { ...session, bank_id: saved.bankId }),
  ).rejects.toThrow("staged savings application");
});
