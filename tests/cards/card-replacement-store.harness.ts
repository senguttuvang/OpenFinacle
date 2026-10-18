import { Database } from "bun:sqlite";
import { beforeEach, mock } from "bun:test";
import { Effect, Layer, Schema, TestClock, TestContext } from "effect";
import {
  BankingError,
  type Role,
  type Session,
} from "../../src/platform/banking-workspace/domain/banking";
import {
  Store,
  type StoreService,
} from "../../src/platform/banking-workspace/domain/ports";
import { cardDetail } from "../../src/platform/cards/application/cards";
import {
  Replacement,
  type ReplacementCommand,
  ReplacementDetail,
  ReplacementEvent,
  ReplacementTerms,
  replacementActions,
  replacementTransition,
} from "../../src/platform/cards/domain/card-replacements";

export async function createHarness() {
  mock.module("@cloudflare/containers", () => ({
    getContainer: (namespace: unknown) => namespace,
  }));
  const { handleRequest } = await import("../../src/runtime/http/http");
  let db: Database;
  let writeFailure: "before" | "after" | null = null;
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
    writeFailure = null;
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
        Effect.try({
          try: () => {
            const inject = sql.startsWith("INSERT INTO card_replacement_events")
              ? writeFailure
              : null;
            if (inject) writeFailure = null;
            if (inject === "before")
              throw new Error("Injected pre-write failure");
            const changes = db.run(sql, values).changes;
            if (inject === "after")
              throw new Error("Injected lost write acknowledgement");
            return changes;
          },
          catch: failure,
        }),
    });
  };
  const run = <A, E>(task: Effect.Effect<A, E, StoreService>) =>
    Effect.runPromise(
      Effect.gen(function* () {
        yield* TestClock.setTime(Date.parse(timestamp));
        return yield* task;
      }).pipe(Effect.provide(layer()), Effect.provide(TestContext.TestContext)),
    );
  const denied = <A>(task: Effect.Effect<A, BankingError, StoreService>) =>
    run(Effect.flip(task));
  const submit = (id = "example-replacement", input = terms) =>
    db.run(
      "INSERT INTO card_replacement_events(id,bank_id,replacement_id,command_key,command_payload,actor,action,note,terms,status,version,created_at) VALUES(?, 'replacement-bank', ?, ?, '{}', 'customer','submit','Synthetic replacement application',?,'submitted',0,?)",
      [
        `${id}-submit`,
        id,
        `${id}-submit-key`,
        JSON.stringify(input),
        timestamp,
      ],
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
  return {
    get handleRequest() {
      return handleRequest;
    },
    get db() {
      return db;
    },
    set db(value: typeof db) {
      db = value;
    },
    get writeFailure() {
      return writeFailure;
    },
    set writeFailure(value: typeof writeFailure) {
      writeFailure = value;
    },
    get timestamp() {
      return timestamp;
    },
    get customer() {
      return customer;
    },
    get sourceId() {
      return sourceId;
    },
    get terms() {
      return terms;
    },
    get layer() {
      return layer;
    },
    get run() {
      return run;
    },
    get denied() {
      return denied;
    },
    get submit() {
      return submit;
    },
    get detail() {
      return detail;
    },
    get act() {
      return act;
    },
    get issue() {
      return issue;
    },
  };
}
