import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import {
  inspectOnboardingOpening,
  onboardingStatus,
  saveOnboardingDraft,
  startOnboardingDraft,
  submitOnboarding,
} from "../../src/platform/account-opening/application/onboarding";
import {
  emptyOnboarding,
  validateOnboarding,
} from "../../src/platform/account-opening/domain/onboarding";
import { reviewApplication } from "../../src/platform/banking-workspace/application/banking";
import {
  BankingError,
  type Session,
} from "../../src/platform/banking-workspace/domain/banking";
import {
  Core,
  type CoreService,
  Store,
  type StoreService,
} from "../../src/platform/banking-workspace/domain/ports";
import { completedOnboarding } from "../fixtures/onboarding";

let db: Database;
let temporaryDirectory: string | null = null;
let writes: { path: string; key?: string }[];
let reads: string[];
let failCore = false;
let loseAck = false;
let failSubmission = false;
let coreActive = true;
let clientMatches = true;
const id = "d31e6f90-97c2-4ee9-a22b-baf06508ec0c";
const session: Session = {
  token_hash: "applicant",
  bank_id: "applicant-a",
  role: "customer",
  expires_at: Number.MAX_SAFE_INTEGER,
};
const initialize = async (path = ":memory:") => {
  db = new Database(path);
  for (const file of [...new Bun.Glob("*.sql").scanSync("migrations")].sort())
    db.exec(await Bun.file(`migrations/${file}`).text());
  db.run(
    "INSERT INTO banks(id,status,journey) VALUES('shared-new','ready','new'),('applicant-a','ready','new'),('applicant-b','ready','new')",
  );
  db.run(
    "INSERT INTO settings(key,value) VALUES('demo_new_bank','shared-new'),('savings_product','5'),('cash_payment_type','1')",
  );
  db.run(
    "INSERT INTO customer_applicant_scopes(operation_id,owner_session_hash,bank_id,customer_id,branch_id) VALUES(?,'applicant','applicant-a','customer-a','shared-new')",
    [id],
  );
  for (const kind of ["identity", "address"])
    db.run(
      "INSERT INTO documents(id,bank_id,name,kind,object_key,size) VALUES(?,'applicant-a',?,?,?,100)",
      [kind, `Demo-onboarding-${kind}.txt`, kind, `sample/${kind}`],
    );
  writes = [];
  reads = [];
  failCore = false;
  loseAck = false;
  failSubmission = false;
  coreActive = true;
  clientMatches = true;
};
beforeEach(() => initialize());
afterEach(() => {
  db.close();
  if (temporaryDirectory) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = null;
  }
});
const dependencies = () =>
  Layer.merge(
    Layer.succeed(Store, {
      one: <T>(sql: string, ...values: (string | number | null)[]) =>
        Effect.sync(() => db.query(sql).get(...values) as T | null),
      all: <T>(sql: string, ...values: (string | number | null)[]) =>
        Effect.sync(() => db.query(sql).all(...values) as T[]),
      run: (sql: string, ...values: (string | number | null)[]) =>
        Effect.gen(function* () {
          if (
            (failSubmission && sql.startsWith("INSERT INTO applications")) ||
            (loseAck && sql.includes("SET status='submitted',updated_at"))
          )
            return yield* Effect.fail(
              new BankingError({
                message: "Injected persistence acknowledgement failure",
                status: 503,
              }),
            );
          return db.run(sql, values).changes;
        }),
    }),
    Layer.succeed(Core, {
      request: <T>(
        method: string,
        path: string,
        _body?: unknown,
        key?: string,
      ) =>
        Effect.gen(function* () {
          if (method !== "GET") {
            writes.push({ path, key });
            if (failCore)
              return yield* Effect.fail(
                new BankingError({
                  message: "Lost Core response",
                  status: 503,
                  uncertain: true,
                }),
              );
            return { resourceId: path === "clients" ? 51 : 61 } as T;
          }
          reads.push(path);
          if (path === "clients/51")
            return {
              id: 51,
              externalId: clientMatches
                ? "applicant-a-customer"
                : "wrong-applicant",
              displayName: completedOnboarding.name,
              active: true,
            } as T;
          return {
            id: 61,
            clientId: 51,
            accountNo: "SYNTHETIC-61",
            externalId: "applicant-a-customer",
            savingsProductId: 5,
            currency: { code: "INR", decimalPlaces: 2 },
            status: { active: coreActive },
          } as T;
        }),
    }),
  );
const run = <A, E>(effect: Effect.Effect<A, E, StoreService | CoreService>) =>
  Effect.runPromise(effect.pipe(Effect.provide(dependencies())));
const ready = async () => {
  const draft = await run(startOnboardingDraft(session, id));
  return run(
    saveOnboardingDraft(session, {
      version: draft.version,
      step: 6,
      fields: completedOnboarding,
    }),
  );
};

test("all seven stages reject incomplete data, and complete fictional records validate", () => {
  for (let step = 0; step < 7; step++)
    expect(
      Object.keys(validateOnboarding(emptyOnboarding, step)).length,
    ).toBeGreaterThan(0);
  expect(validateOnboarding(completedOnboarding)).toEqual({});
  expect(
    validateOnboarding({
      ...completedOnboarding,
      nomineeChoice: "decline",
      nomineeName: "",
      nomineeRelationship: "",
    }),
  ).toEqual({});
  expect(
    validateOnboarding({
      ...completedOnboarding,
      taxResidency: "other",
      birthDate: "2020-01-01",
      email: "real@gmail.com",
      phone: "9876543210",
    }),
  ).toHaveProperty("taxResidency");
});
test("draft persists across reads, conserves its original operation and rejects stale tab saves", async () => {
  const saved = await ready();
  expect(await run(onboardingStatus(session))).toEqual(saved);
  expect(saved).toMatchObject({
    operationId: id,
    version: 1,
    step: 6,
    fields: completedOnboarding,
    account: null,
  });
  await expect(
    run(
      saveOnboardingDraft(session, {
        version: 0,
        step: 2,
        fields: emptyOnboarding,
      }),
    ),
  ).rejects.toThrow("another tab");
  expect(
    (await run(startOnboardingDraft(session, "another-operation-identity")))
      .operationId,
  ).toBe(id);
  expect(writes).toEqual([]);
});
test("shared original new-customer scenario and staff cannot start/edit applicant drafts", async () => {
  await expect(
    run(startOnboardingDraft({ ...session, bank_id: "shared-new" }, id)),
  ).rejects.toThrow("individual application");
  await expect(
    run(startOnboardingDraft({ ...session, role: "officer" }, id)),
  ).rejects.toThrow("customer");
  await ready();
  await expect(
    run(
      saveOnboardingDraft(
        { ...session, role: "approver" },
        { version: 1, step: 2, fields: completedOnboarding },
      ),
    ),
  ).rejects.toThrow("customer");
});
test("independent applicant scopes cannot read each other's draft", async () => {
  await ready();
  await expect(
    run(onboardingStatus({ ...session, bank_id: "applicant-b" })),
  ).rejects.toThrow("individual application");
  expect(
    db.query("SELECT customer_account FROM banks WHERE id='shared-new'").get(),
  ).toEqual({ customer_account: 0 });
});
test("draft persistence refuses real-looking identity/contact data", async () => {
  await ready();
  for (const fields of [
    { ...completedOnboarding, name: "Real Person" },
    { ...completedOnboarding, email: "private@gmail.com" },
    { ...completedOnboarding, phone: "9876543210" },
    { ...completedOnboarding, address: "14 Actual Street" },
  ])
    await expect(
      run(saveOnboardingDraft(session, { version: 1, step: 6, fields })),
    ).rejects.toThrow("fictional");
});
test("submission requires complete stages and an unchanged version", async () => {
  await run(startOnboardingDraft(session, id));
  await expect(run(submitOnboarding(session, id, 0))).rejects.toThrow(
    "Confirm",
  );
  await ready();
  await expect(run(submitOnboarding(session, id, 0))).rejects.toThrow(
    "draft changed",
  );
  expect(db.query("SELECT COUNT(*) AS n FROM applications").get()).toEqual({
    n: 0,
  });
});
test("concurrent final confirmations create one durable application and never dispatch Core", async () => {
  const saved = await ready();
  const outcomes = await Promise.allSettled([
    run(submitOnboarding(session, id, saved.version)),
    run(submitOnboarding(session, id, saved.version)),
  ]);
  expect(outcomes.some((outcome) => outcome.status === "fulfilled")).toBe(true);
  expect(
    db
      .query(
        "SELECT COUNT(*) AS n FROM applications WHERE bank_id='applicant-a'",
      )
      .get(),
  ).toEqual({ n: 1 });
  expect((await run(onboardingStatus(session))).applicationStatus).toBe(
    "submitted",
  );
  expect(writes).toEqual([]);
  await expect(
    run(submitOnboarding(session, "replacement-operation", saved.version)),
  ).rejects.toThrow("replacement");
});
test("lost submission acknowledgement is resolved through canonical application without replay", async () => {
  const saved = await ready();
  loseAck = true;
  await expect(
    run(submitOnboarding(session, id, saved.version)),
  ).rejects.toThrow("acknowledgement");
  const inspected = await run(onboardingStatus(session));
  expect(inspected).toMatchObject({
    status: "submitted",
    applicationStatus: "submitted",
    operationId: id,
  });
  expect(await run(submitOnboarding(session, id, saved.version))).toEqual(
    inspected,
  );
  expect(db.query("SELECT COUNT(*) AS n FROM applications").get()).toEqual({
    n: 1,
  });
});
test("unconfirmed submission blocks dispatch and edit after persistence failure", async () => {
  const saved = await ready();
  failSubmission = true;
  await expect(
    run(submitOnboarding(session, id, saved.version)),
  ).rejects.toThrow("acknowledgement");
  failSubmission = false;
  expect(await run(submitOnboarding(session, id, saved.version))).toMatchObject(
    { status: "submission_exception", applicationStatus: null },
  );
  await expect(
    run(
      saveOnboardingDraft(session, {
        version: 2,
        step: 1,
        fields: completedOnboarding,
      }),
    ),
  ).rejects.toThrow("reserved");
  expect(db.query("SELECT COUNT(*) AS n FROM applications").get()).toEqual({
    n: 0,
  });
});
test("real application service preserves officer then approver and provisions one Core account", async () => {
  const saved = await ready();
  await run(submitOnboarding(session, id, saved.version));
  await expect(
    run(reviewApplication({ ...session, role: "approver" }, "approve", "")),
  ).rejects.toThrow("separate approver");
  await run(
    reviewApplication(
      { ...session, role: "officer" },
      "recommend",
      "Sample identity and address reviewed",
    ),
  );
  expect((await run(onboardingStatus(session))).account).toBeNull();
  await run(
    reviewApplication(
      { ...session, role: "approver" },
      "approve",
      "Approved separately",
    ),
  );
  expect(await run(onboardingStatus(session))).toMatchObject({
    account: { id: 61, accountNo: "SYNTHETIC-61" },
    applicationStatus: "approved",
  });
  expect(writes.map((write) => write.path)).toEqual([
    "clients",
    "savingsaccounts",
    "savingsaccounts/61?command=approve",
    "savingsaccounts/61?command=activate",
  ]);
  expect(writes.map((write) => write.key)).toEqual([
    "applicant-a-customer-client",
    "applicant-a-customer-account",
    "applicant-a-customer-approve",
    "applicant-a-customer-activate",
  ]);
  await expect(
    run(reviewApplication({ ...session, role: "approver" }, "approve", "")),
  ).rejects.toThrow();
  expect(writes).toHaveLength(4);
});
test("lost Core opening response yields opening_exception and never replays original creation", async () => {
  const saved = await ready();
  await run(submitOnboarding(session, id, saved.version));
  await run(
    reviewApplication({ ...session, role: "officer" }, "recommend", "Reviewed"),
  );
  failCore = true;
  await expect(
    run(reviewApplication({ ...session, role: "approver" }, "approve", "")),
  ).rejects.toThrow("Lost Core");
  expect(await run(onboardingStatus(session))).toMatchObject({
    account: null,
    applicationStatus: "opening_exception",
  });
  await expect(
    run(reviewApplication({ ...session, role: "approver" }, "approve", "")),
  ).rejects.toThrow();
  expect(writes).toHaveLength(1);
});
test("opening receipt requires matching active Core account", async () => {
  const saved = await ready();
  await run(submitOnboarding(session, id, saved.version));
  await run(
    reviewApplication({ ...session, role: "officer" }, "recommend", "Reviewed"),
  );
  await run(reviewApplication({ ...session, role: "approver" }, "approve", ""));
  coreActive = false;
  await expect(run(onboardingStatus(session))).rejects.toThrow(
    "confirmed active",
  );
});

test("approver reconciles a fully active original Core outcome with no creation replay", async () => {
  const saved = await ready();
  await run(submitOnboarding(session, id, saved.version));
  await run(
    reviewApplication({ ...session, role: "officer" }, "recommend", "Reviewed"),
  );
  db.run(
    "UPDATE applications SET status='opening_exception' WHERE bank_id='applicant-a'",
  );
  await expect(run(inspectOnboardingOpening(session))).rejects.toThrow(
    "independent approver",
  );
  expect(
    await run(inspectOnboardingOpening({ ...session, role: "approver" })),
  ).toMatchObject({
    applicationStatus: "approved",
    account: { id: 61, accountNo: "SYNTHETIC-61" },
  });
  expect(reads).toEqual([
    "savingsaccounts/external-id/applicant-a-customer",
    "clients/51",
    "savingsaccounts/61",
  ]);
  expect(writes).toEqual([]);
});
test("recovery refuses an inactive or mismatched original Core account without dispatch", async () => {
  const saved = await ready();
  await run(submitOnboarding(session, id, saved.version));
  await run(
    reviewApplication({ ...session, role: "officer" }, "recommend", "Reviewed"),
  );
  db.run(
    "UPDATE applications SET status='opening_exception' WHERE bank_id='applicant-a'",
  );
  coreActive = false;
  await expect(
    run(inspectOnboardingOpening({ ...session, role: "approver" })),
  ).rejects.toThrow("not confirmed");
  coreActive = true;
  clientMatches = false;
  await expect(
    run(inspectOnboardingOpening({ ...session, role: "approver" })),
  ).rejects.toThrow("could not be matched");
  expect((await run(onboardingStatus(session))).applicationStatus).toBe(
    "opening_exception",
  );
  expect(writes).toEqual([]);
});

test("missing sample documents fail before reserving submission, and original identities cannot be reset", async () => {
  const saved = await ready();
  db.run("DELETE FROM documents WHERE bank_id='applicant-a'");
  await expect(
    run(submitOnboarding(session, id, saved.version)),
  ).rejects.toThrow("Attach the sample");
  expect((await run(onboardingStatus(session))).status).toBe("draft");
  expect(() =>
    db.run(
      "UPDATE onboarding_drafts SET operation_id='replacement' WHERE bank_id='applicant-a'",
    ),
  ).toThrow("permanent");
  expect(() =>
    db.run("DELETE FROM onboarding_drafts WHERE bank_id='applicant-a'"),
  ).toThrow("cannot be reset");
});

test("saved draft and submitted receipt survive closing and reopening persistent workflow storage", async () => {
  db.close();
  temporaryDirectory = mkdtempSync(join(tmpdir(), "finacle6-onboarding-"));
  const path = join(temporaryDirectory, "workflow.sqlite");
  await initialize(path);
  const saved = await ready();
  db.close();
  db = new Database(path);
  expect(await run(onboardingStatus(session))).toEqual(saved);
  const submitted = await run(submitOnboarding(session, id, saved.version));
  db.close();
  db = new Database(path);
  expect(await run(onboardingStatus(session))).toEqual(submitted);
  expect(submitted).toMatchObject({
    operationId: id,
    applicationStatus: "submitted",
    account: null,
  });
  expect(writes).toEqual([]);
});
