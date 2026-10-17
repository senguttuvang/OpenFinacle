import { Database } from "bun:sqlite";
import { beforeEach, expect, test } from "bun:test";
import { Effect, Layer, Schema } from "effect";
import {
  cardDetail,
  cardForKey,
  changeCard,
  listCards,
} from "../src/application/cards";
import { BankingError, type Role, type Session } from "../src/domain/banking";
import {
  Replacement,
  type ReplacementCommand,
  type ReplacementDetail,
  ReplacementEvent,
  ReplacementTerms,
  replacementActions,
  replacementTransition,
} from "../src/domain/card-replacements";
import { Store, type StoreService } from "../src/domain/ports";

let db: Database;
const timestamp = "2026-10-17T09:00:00Z";
const customer: Session = {
  bank_id: "replacement-bank",
  role: "customer",
  token_hash: "synthetic",
  expires_at: Number.MAX_SAFE_INTEGER,
};
const sourceId = "demo-debit:replacement-bank";
const terms: ReplacementTerms = {
  source_card_id: sourceId,
  source_version: 0,
  reason: "damaged",
  address: "12 Example Lane, Example Town 600001",
};
beforeEach(async () => {
  db?.close();
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const migration of [
    "0001_workflows.sql",
    "0002_reversal_guard.sql",
    "0003_customer_journey.sql",
    "0004_persistent_demo.sql",
    "0005_service_cases.sql",
    "0006_legacy_service_guards.sql",
    "0007_cards.sql",
    "0011_card_replacements.sql",
  ])
    db.exec(await Bun.file(`migrations/${migration}`).text());
  db.run(
    "INSERT INTO banks(id,status,customer_account) VALUES('replacement-bank','ready',101),('other','ready',202)",
  );
});
const layer = () => {
  const failure = () =>
    new BankingError({ message: "Injected store failure", status: 503 });
  return Layer.succeed(Store, {
    one: <T>(sql: string, ...values: (string | number | null)[]) =>
      Effect.try({
        try: () => db.query(sql).get(...values) as T | null,
        catch: failure,
      }),
    all: <T>(sql: string, ...values: (string | number | null)[]) =>
      Effect.try({
        try: () => db.query(sql).all(...values) as T[],
        catch: failure,
      }),
    run: (sql: string, ...values: (string | number | null)[]) =>
      Effect.try({ try: () => db.run(sql, values).changes, catch: failure }),
  });
};
const run = <A, E>(task: Effect.Effect<A, E, StoreService>) =>
  Effect.runPromise(task.pipe(Effect.provide(layer())));
const denied = <A>(task: Effect.Effect<A, BankingError, StoreService>) =>
  run(Effect.flip(task));
const submit = (id = "example-replacement", input = terms) =>
  db.run(
    "INSERT INTO card_replacement_events(id,bank_id,replacement_id,command_key,command_payload,actor,action,note,terms,status,version,created_at) VALUES(?, 'replacement-bank', ?, ?, '{}', 'customer','submit','Synthetic replacement application',?,'submitted',0,?)",
    [`${id}-submit`, id, `${id}-submit-key`, JSON.stringify(input), timestamp],
  );
const detail = async (
  id = "example-replacement",
): Promise<ReplacementDetail> => {
  const replacement = Schema.decodeUnknownSync(
    Schema.Struct({
      ...Replacement.fields,
      terms: Schema.parseJson(ReplacementTerms),
    }),
  )(db.query("SELECT * FROM card_replacements WHERE id=?").get(id));
  const source = (
    await run(cardDetail(customer, replacement.terms.source_card_id))
  ).card;
  const card = replacement.card_id
    ? (await run(cardDetail(customer, replacement.card_id))).card
    : null;
  const history = Schema.decodeUnknownSync(Schema.Array(ReplacementEvent))(
    db
      .query(
        "SELECT id,actor,action,note,status,version,created_at FROM card_replacement_events WHERE replacement_id=? ORDER BY version",
      )
      .all(id),
  );
  return {
    replacement,
    source,
    card,
    history,
    actions: replacementActions(replacement, card, customer.role),
    confirmed_key: null,
  };
};
const act = async (
  action: ReplacementCommand["action"],
  role: Role,
  id = "example-replacement",
  beforeInsert?: () => Promise<unknown>,
) => {
  const current = await detail(id);
  const input: ReplacementCommand = {
    id,
    version: current.replacement.version,
    action,
    note: "Reviewed synthetic replacement step",
    ...(action === "issue" ? { source_version: current.source.version } : {}),
    ...(action === "activate" && current.card
      ? { card_version: current.card.version }
      : {}),
  };
  const next = await Effect.runPromise(
    replacementTransition(current, role, input, timestamp),
  );
  await beforeInsert?.();
  db.run(
    "INSERT INTO card_replacement_events(id,bank_id,replacement_id,command_key,command_payload,actor,action,note,terms,status,maker,checker,card_id,source_version,card_version,card,version,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [
      `${id}-${action}`,
      customer.bank_id,
      id,
      `${id}-${action}-key`,
      JSON.stringify(input),
      role,
      action,
      input.note,
      JSON.stringify(current.replacement.terms),
      next.status,
      next.maker,
      next.checker,
      next.card_id,
      input.source_version ?? null,
      input.card_version ?? null,
      next.card ? JSON.stringify(next.card) : null,
      input.version + 1,
      timestamp,
    ],
  );
  return detail(id);
};
const issue = async () => {
  submit();
  await act("recommend", "officer");
  return act("issue", "approver");
};

test("independent issuance preserves the blocked source and distinct held card; ordered delivery enables activation and normal controls", async () => {
  const issued = await issue();
  const id = issued.card?.id;
  if (!id) throw new Error("Expected issued card");
  expect(issued.source).toMatchObject({ status: "blocked", version: 1 });
  expect(issued.card).toMatchObject({
    status: "held",
    activation_required: true,
    replacement_id: "example-replacement",
    version: 0,
  });
  expect((await run(listCards(customer))).cards).toHaveLength(2);
  expect((await run(cardDetail(customer, sourceId))).history).toHaveLength(2);
  expect((await run(cardDetail(customer, id))).history).toHaveLength(1);
  expect(
    await denied(
      changeCard(
        customer,
        { id, version: 0, action: "resume", note: "Attempt early activation" },
        "early-resume-key",
      ),
    ),
  ).toMatchObject({ status: 403 });
  expect(() =>
    db.run("UPDATE replacement_cards SET activation_required=0 WHERE id=?", [
      id,
    ]),
  ).toThrow("immutable command");
  await act("dispatch", "officer");
  await act("deliver", "officer");
  const active = await act("activate", "customer");
  expect(active.card).toMatchObject({
    status: "active",
    activation_required: false,
    version: 1,
    settings: { atm: false, online: false },
  });
  expect(active.history).toHaveLength(6);
  const held = await run(
    changeCard(
      customer,
      { id, version: 1, action: "hold", note: "Synthetic temporary hold" },
      "new-card-hold-key",
    ),
  );
  expect(held.card.status).toBe("held");
  expect((await run(cardForKey(customer, "new-card-hold-key"))).card.id).toBe(
    id,
  );
  expect(
    await denied(cardDetail({ ...customer, bank_id: "other" }, id)),
  ).toMatchObject({ status: 404 });
  expect(
    (
      await run(
        changeCard(
          customer,
          {
            id,
            version: 2,
            action: "resume",
            note: "Synthetic resume after hold",
          },
          "new-card-resume-key",
        ),
      )
    ).card.status,
  ).toBe("active");
  expect((await run(cardDetail(customer, sourceId))).actions).toEqual([]);
  expect(db.query("SELECT COUNT(*) AS n FROM commands").get()).toEqual({
    n: 0,
  });
  const before = db.serialize();
  await run(listCards(customer));
  await detail();
  expect(db.serialize()).toEqual(before);
});

test("issuance audit failure rolls back source block, new instrument, request projection, keys and histories", async () => {
  submit();
  await act("recommend", "officer");
  db.exec(
    "CREATE TRIGGER fail_issue_audit BEFORE INSERT ON audit WHEN NEW.action='card-replacement.issue' BEGIN SELECT RAISE(ABORT,'Injected issue audit failure'); END",
  );
  await expect(act("issue", "approver")).rejects.toThrow(
    "Injected issue audit failure",
  );
  expect((await detail()).replacement).toMatchObject({
    status: "recommended",
    version: 1,
    card_id: null,
  });
  expect((await run(cardDetail(customer, sourceId))).card).toMatchObject({
    status: "active",
    version: 0,
  });
  expect((await run(listCards(customer))).cards).toHaveLength(1);
  expect(
    db
      .query(
        "SELECT COUNT(*) AS n FROM card_replacement_events WHERE action='issue'",
      )
      .get(),
  ).toEqual({ n: 0 });
  db.exec("DROP TRIGGER fail_issue_audit");
  const issued = await act("issue", "approver");
  expect(issued.replacement.status).toBe("issued");
  expect(() => submit("second-source-request")).toThrow(
    "duplicate replacement submission",
  );
  expect((await run(listCards(customer))).cards).toHaveLength(2);
});

test("concurrent source changes abort issuance before side effects and activation audit failure leaves the delivered card held", async () => {
  submit();
  await act("recommend", "officer");
  await expect(
    act("issue", "approver", "example-replacement", () =>
      run(
        changeCard(
          customer,
          {
            id: sourceId,
            version: 0,
            action: "hold",
            note: "Concurrent source security hold",
          },
          "concurrent-source-key",
        ),
      ),
    ),
  ).rejects.toThrow("Source card changed");
  expect((await detail()).replacement).toMatchObject({
    status: "recommended",
    version: 1,
  });
  expect((await run(listCards(customer))).cards).toHaveLength(1);
  const issued = await act("issue", "approver");
  expect(issued.source).toMatchObject({ status: "blocked", version: 2 });
  await act("dispatch", "officer");
  await act("deliver", "officer");
  db.exec(
    "CREATE TRIGGER fail_activation_audit BEFORE INSERT ON audit WHEN NEW.action='card-replacement.activate' BEGIN SELECT RAISE(ABORT,'Injected activation failure'); END",
  );
  await expect(act("activate", "customer")).rejects.toThrow(
    "Injected activation failure",
  );
  expect((await detail()).replacement).toMatchObject({
    status: "delivered",
    version: 4,
  });
  expect((await detail()).card).toMatchObject({
    status: "held",
    activation_required: true,
    version: 0,
  });
  db.exec("DROP TRIGGER fail_activation_audit");
  expect((await act("activate", "customer")).card?.status).toBe("active");
});

test("protectively blocked replacements cannot activate and may have exactly one later successor with immutable histories", async () => {
  const issued = await issue();
  const id = issued.card?.id;
  if (!id) throw new Error("Expected issued card");
  await run(
    changeCard(
      customer,
      {
        id,
        version: 0,
        action: "block",
        note: "Synthetic replacement reported lost",
      },
      "new-card-block-key",
    ),
  );
  await act("dispatch", "officer");
  await act("deliver", "officer");
  expect((await detail()).actions).toEqual([]);
  await expect(act("activate", "customer")).rejects.toThrow("not permitted");
  submit("next-generation", {
    ...terms,
    source_card_id: id,
    source_version: 1,
    reason: "lost",
  });
  await act("recommend", "officer", "next-generation");
  const next = await act("issue", "approver", "next-generation");
  expect(next.card?.id).not.toBe(id);
  expect((await run(listCards(customer))).cards).toHaveLength(3);
  expect((await run(cardDetail(customer, id))).card.status).toBe("blocked");
  expect(() => db.run("DELETE FROM card_replacement_events")).toThrow(
    "immutable",
  );
  expect(() => db.run("DELETE FROM replacement_cards")).toThrow("immutable");
  expect(() =>
    db.run(
      "UPDATE card_replacements SET terms='{}' WHERE id='example-replacement'",
    ),
  ).toThrow("immutable command");
});

test("card references reconcile across both stores and SQL refuses a conflicting legacy command key", async () => {
  await run(
    changeCard(
      customer,
      {
        id: sourceId,
        version: 0,
        action: "hold",
        note: "Initial synthetic source hold",
      },
      "shared-card-command-key",
    ),
  );
  submit("cross-key-request", { ...terms, source_version: 1 });
  await act("recommend", "officer", "cross-key-request");
  const issued = await act("issue", "approver", "cross-key-request");
  const id = issued.card?.id;
  if (!id) throw new Error("Expected issued card");
  expect(
    (await run(cardForKey(customer, "shared-card-command-key"))).card.id,
  ).toBe(sourceId);
  expect(
    await denied(
      changeCard(
        customer,
        {
          id,
          version: 0,
          action: "block",
          note: "Conflicting synthetic block",
        },
        "shared-card-command-key",
      ),
    ),
  ).toMatchObject({ status: 409 });
  expect(() =>
    db.run(
      "INSERT INTO replacement_card_events(id,bank_id,card_id,command_key,command_payload,actor,action,note,status,settings,version,created_at) SELECT 'collision',bank_id,id,'shared-card-command-key','{}','customer','block','Conflicting synthetic SQL block','blocked',settings,version+1,? FROM replacement_cards WHERE id=?",
      [timestamp, id],
    ),
  ).toThrow("reference conflict");
  expect((await run(cardDetail(customer, id))).card).toMatchObject({
    status: "held",
    version: 0,
  });
});
