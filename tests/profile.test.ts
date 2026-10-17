import { Database } from "bun:sqlite";
import { beforeEach, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { customerProfile } from "../src/application/profile";
import {
  actOnServiceCase,
  serviceCase,
  submitServiceCase,
} from "../src/application/service-cases";
import { BankingError, type Session } from "../src/domain/banking";
import { Store, type StoreService } from "../src/domain/ports";
import type { CaseAction } from "../src/domain/service-cases";

let db: Database;
const customer: Session = {
  bank_id: "profile-bank",
  role: "customer",
  token_hash: "synthetic",
  expires_at: Number.MAX_SAFE_INTEGER,
};
const officer: Session = { ...customer, role: "officer" };
const approver: Session = { ...customer, role: "approver" };
const initialize = async (profile = true) => {
  db?.close();
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const file of [
    "0001_workflows.sql",
    "0002_reversal_guard.sql",
    "0003_customer_journey.sql",
    "0004_persistent_demo.sql",
    "0005_service_cases.sql",
    "0006_legacy_service_guards.sql",
    "0007_cards.sql",
  ])
    db.exec(await Bun.file(`migrations/${file}`).text());
  db.run(
    "INSERT INTO banks(id,status,customer_account) VALUES('profile-bank','ready',101),('other-profile','ready',202),('unopened-profile','ready',0)",
  );
  if (profile) db.exec(await Bun.file("migrations/0008_profiles.sql").text());
};
beforeEach(() => initialize());
const failure = () =>
  new BankingError({ message: "Profile persistence failed", status: 503 });
const layer = () =>
  Layer.succeed(Store, {
    all: <T>(sql: string, ...values: (string | number | null)[]) =>
      Effect.try({
        try: () => db.query(sql).all(...values) as T[],
        catch: failure,
      }),
    one: <T>(sql: string, ...values: (string | number | null)[]) =>
      Effect.try({
        try: () => db.query(sql).get(...values) as T | null,
        catch: failure,
      }),
    run: (sql: string, ...values: (string | number | null)[]) =>
      Effect.try({ try: () => db.run(sql, values).changes, catch: failure }),
  });
const run = <A, E>(task: Effect.Effect<A, E, StoreService>) =>
  Effect.runPromise(task.pipe(Effect.provide(layer())));
const denied = <A>(task: Effect.Effect<A, BankingError, StoreService>) =>
  run(task.pipe(Effect.flip));
const action = (session: Session, id: string, action: CaseAction) =>
  Effect.gen(function* () {
    const { request } = yield* serviceCase(session, id);
    return yield* actOnServiceCase(session, {
      id,
      version: request.version,
      action,
      note: "Reviewed synthetic profile maintenance",
    });
  });
const prepare = (
  code = "address_change",
  fields: Record<string, string> = {
    address: "29 Synthetic Street",
    city: "Chennai",
    pincode: "600020",
  },
) =>
  Effect.gen(function* () {
    const { request } = yield* submitServiceCase(
      customer,
      code,
      fields,
      crypto.randomUUID(),
    );
    yield* action(officer, request.id, "start");
    yield* action(officer, request.id, "submit_for_approval");
    return request.id;
  });

test("profile effects require independent fulfilment and retain source case snapshots", async () => {
  const before = await run(customerProfile(customer));
  const id = await run(prepare());
  expect((await run(customerProfile(customer))).profile).toEqual(
    before.profile,
  );
  expect(await denied(action(officer, id, "fulfil"))).toMatchObject({
    status: 403,
  });
  await run(action(approver, id, "fulfil"));
  const current = await run(customerProfile(officer));
  expect(
    (await run(serviceCase(customer, id))).request.profile_patch,
  ).toBeTypeOf("string");
  expect(current.profile).toMatchObject({
    version: 1,
    fields: {
      address: "29 Synthetic Street",
      city: "Chennai",
      pincode: "600020",
      email: before.profile.fields.email,
    },
  });
  expect(current.history).toHaveLength(2);
  expect(current.history[0].fields).toEqual(before.profile.fields);
  expect(current.history[1]).toMatchObject({
    case_id: id,
    actor: "approver",
    version: 1,
    fields: current.profile.fields,
  });
  expect((await run(customerProfile(approver))).profile).toEqual(
    current.profile,
  );
  expect(await denied(action(approver, id, "fulfil"))).toMatchObject({
    status: 403,
  });
  expect((await run(customerProfile(customer))).history).toHaveLength(2);
});

test("email, branch and employer approvals preserve unrelated profile fields", async () => {
  const address = await run(prepare());
  await run(action(approver, address, "fulfil"));
  for (const [code, fields] of [
    [
      "email_change",
      { email: "updated@example.test", explanation: "Synthetic email update" },
    ],
    [
      "branch_transfer",
      {
        branch: "Example North Branch",
        explanation: "Synthetic branch update",
      },
    ],
    [
      "employer_change",
      {
        employer: "Example Industries",
        explanation: "Synthetic employer update",
      },
    ],
  ] as const) {
    const id = await run(prepare(code, fields));
    await run(action(approver, id, "fulfil"));
  }
  expect((await run(customerProfile(customer))).profile).toMatchObject({
    version: 4,
    fields: {
      address: "29 Synthetic Street",
      email: "updated@example.test",
      home_branch: "Example North Branch",
      employer: "Example Industries",
    },
  });
  expect(db.query("SELECT COUNT(*) AS n FROM commands").get()).toEqual({
    n: 0,
  });
  expect(
    db
      .query("SELECT customer_account FROM banks WHERE id='profile-bank'")
      .get(),
  ).toEqual({ customer_account: 101 });
});

test("simultaneous approvals preserve both field changes and ordered snapshots", async () => {
  const address = await run(prepare());
  const email = await run(
    prepare("email_change", {
      email: "concurrent@example.test",
      explanation: "Synthetic parallel maintenance",
    }),
  );
  await Promise.all([
    run(action(approver, address, "fulfil")),
    run(action(approver, email, "fulfil")),
  ]);
  const saved = await run(customerProfile(customer));
  expect(saved.profile).toMatchObject({
    version: 2,
    fields: {
      address: "29 Synthetic Street",
      email: "concurrent@example.test",
    },
  });
  expect(saved.history.map((event) => event.version)).toEqual([0, 1, 2]);
  expect(new Set(saved.history.slice(1).map((event) => event.case_id))).toEqual(
    new Set([address, email]),
  );
});

test("rejection, cancellation and processing never change the profile", async () => {
  const rejected = await run(prepare());
  await run(action(approver, rejected, "reject"));
  const { request } = await run(
    submitServiceCase(
      customer,
      "address_change",
      { address: "43 Synthetic Street", city: "Chennai", pincode: "600020" },
      "profile-cancel-key",
    ),
  );
  await run(action(customer, request.id, "cancel"));
  expect((await run(customerProfile(customer))).profile.version).toBe(0);
  expect((await run(customerProfile(customer))).history).toHaveLength(1);
});

test("effect failure rolls back fulfilment, profile, case history and audit together", async () => {
  const id = await run(prepare());
  const before = await run(customerProfile(customer));
  const audit = db.query("SELECT COUNT(*) AS n FROM audit").get();
  db.exec(
    "CREATE TRIGGER fail_profile_event BEFORE INSERT ON profile_events WHEN NEW.version>0 BEGIN SELECT RAISE(ABORT,'Injected profile failure'); END;",
  );
  expect(await denied(action(approver, id, "fulfil"))).toMatchObject({
    status: 503,
  });
  expect(await run(customerProfile(customer))).toEqual(before);
  expect((await run(serviceCase(customer, id))).request.status).toBe(
    "awaiting_approval",
  );
  expect((await run(serviceCase(customer, id))).history).toHaveLength(3);
  expect(db.query("SELECT COUNT(*) AS n FROM audit").get()).toEqual(audit);
  db.exec("DROP TRIGGER fail_profile_event");
  await run(action(approver, id, "fulfil"));
  expect((await run(customerProfile(customer))).profile.version).toBe(1);
});

test("profiles are scoped and storage prevents untracked writes or history changes", async () => {
  const id = await run(prepare());
  await run(action(approver, id, "fulfil"));
  const other = await run(
    customerProfile({ ...officer, bank_id: "other-profile" }),
  );
  expect(other.profile.version).toBe(0);
  expect(other.history).toHaveLength(1);
  expect(
    other.history.every((event) => event.bank_id === "other-profile"),
  ).toBe(true);
  expect(
    await denied(customerProfile({ ...customer, bank_id: "missing" })),
  ).toMatchObject({ status: 404 });
  expect(() =>
    db.run(
      "UPDATE synthetic_profiles SET fields='{}' WHERE bank_id='profile-bank'",
    ),
  ).toThrow("approved case event");
  expect(() =>
    db.run("DELETE FROM profile_events WHERE bank_id='profile-bank'"),
  ).toThrow("immutable");
});

test("a rolled-back Worker cannot complete maintenance without the domain effect", async () => {
  const id = await run(prepare());
  expect(() =>
    db.run(
      "UPDATE service_requests SET status='fulfilled',version=version+1,updated_by='approver' WHERE id=?",
      [id],
    ),
  ).toThrow("domain patch");
  expect((await run(serviceCase(customer, id))).request.status).toBe(
    "awaiting_approval",
  );
  expect((await run(customerProfile(customer))).profile.version).toBe(0);
});

test("migration does not invent prior effects and opening imports application data only once", async () => {
  await initialize(false);
  const id = await run(prepare());
  db.run(
    "UPDATE service_requests SET status='fulfilled',version=version+1,updated_by='approver',outcome_note='Historical approval before profile effects' WHERE id=?",
    [id],
  );
  db.exec(await Bun.file("migrations/0008_profiles.sql").text());
  const imported = await run(customerProfile(customer));
  expect(
    db.query("SELECT profile_patch FROM service_requests WHERE id=?").get(id),
  ).toEqual({ profile_patch: null });
  expect(imported.profile.version).toBe(0);
  expect(imported.profile.fields.address).not.toBe("29 Synthetic Street");
  expect(imported.history[0]).toMatchObject({
    case_id: null,
    actor: "system",
    version: 0,
  });
  expect(imported.history[0].note).toContain(
    "earlier maintenance effects are unavailable",
  );
  expect(
    await denied(customerProfile({ ...customer, bank_id: "unopened-profile" })),
  ).toMatchObject({ status: 404 });
  db.run(
    "INSERT INTO applications(id,bank_id,name,email,phone,address,employment,maker) VALUES('opening-profile','unopened-profile','Example Customer','opening@example.test','9000000002','71 Opening Lane','Example Studio','customer')",
  );
  db.run("UPDATE banks SET customer_account=303 WHERE id='unopened-profile'");
  db.run("UPDATE banks SET customer_account=303 WHERE id='unopened-profile'");
  const opened = await run(
    customerProfile({ ...customer, bank_id: "unopened-profile" }),
  );
  expect(opened.profile.fields).toMatchObject({
    email: "opening@example.test",
    address: "71 Opening Lane",
    employer: "Example Studio",
  });
  expect(opened.history).toHaveLength(1);
});
