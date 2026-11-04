import { expect, test } from "bun:test";
import { Effect, Either, Layer, Schema } from "effect";
import {
  BankingError,
  type Session,
} from "../../../src/platform/banking-workspace/domain/banking";
import {
  Core,
  Store,
} from "../../../src/platform/banking-workspace/domain/ports";
import { branchCustomer } from "../../../src/platform/branch-operations/application/branch-day";
import {
  assignCaseResponsibility,
  readCaseResponsibility,
} from "../../../src/platform/branch-operations/application/service-work/responsibility";
import { ResponsibilityDetail } from "../../../src/platform/branch-operations/domain/service-work/responsibility";
import { submitServiceCase } from "../../../src/platform/service-requests/application/service-cases";
import { branchRoutes } from "../../../src/runtime/http/routes/branch-routes";
import { createHarness } from "../../customers/customer-banking.harness";

const harness = createHarness();
const setup = async () => {
  const { h, source, recipientId } = await harness.twoCustomers(),
    officer = { ...source, role: "officer" as const },
    approver = { ...source, role: "approver" as const };
  const { scoped } = await harness.run(h, branchCustomer(officer, recipientId));
  const created = await harness.run(
    h,
    submitServiceCase(
      { ...scoped, role: "customer" },
      "email_change",
      {
        email: "responsibility@example.test",
        explanation: "Synthetic responsibility fixture",
      },
      "responsibility-case-original",
    ),
  );
  const run = <A, E>(
    e: Effect.Effect<
      A,
      E,
      Effect.Effect.Context<ReturnType<typeof branchRoutes>>
    >,
  ) =>
    harness.run(
      h,
      e.pipe(
        Effect.provide(
          Layer.succeed(Core, {
            request: () => Effect.die("Responsibility must not call Core"),
          }),
        ),
      ),
    );
  const command = (
    version = 0,
    owner: "teller" | "manager" | null = "teller",
  ) => ({ version, owner, note: "Synthetic service work handover" });
  const assign = (
    key = "assignment-original",
    input = command(),
    actor: Session = officer,
  ) =>
    assignCaseResponsibility(
      actor,
      recipientId,
      created.request.id,
      input,
      key,
    );
  const read = () =>
    readCaseResponsibility(officer, recipientId, created.request.id);
  return {
    h,
    source,
    recipientId,
    officer,
    approver,
    created,
    run,
    command,
    assign,
    read,
  };
};

test("owned responsibility and explicit unassignment retain original confirmation independently of latest history without case or Core effects", async () => {
  const s = await setup(),
    before = JSON.stringify(
      s.h.db.query("SELECT * FROM service_requests").all(),
    ),
    events = JSON.stringify(
      s.h.db.query("SELECT * FROM service_case_events").all(),
    ),
    posts = s.h.calls.filter((c) => c.method !== "GET").length;
  expect(await s.run(s.read())).toMatchObject({
    latest: null,
    history: [],
    historyComplete: true,
    confirmedEvent: null,
  });
  const first = await s.run(s.assign());
  expect(first.latest).toMatchObject({
    owner: "teller",
    version: 1,
    actor: "officer",
    expectedVersion: 0,
  });
  const second = await s.run(
    s.assign("assignment-second", s.command(1, "manager"), s.approver),
  );
  expect(second.latest).toMatchObject({
    owner: "manager",
    version: 2,
    actor: "approver",
  });
  const replay = await s.run(s.assign());
  expect(replay.confirmedEvent?.id).toBe(first.latest?.id);
  expect(replay.latest?.id).toBe(second.latest?.id);
  const unassigned = await s.run(
    s.assign("assignment-unassign", s.command(2, null)),
  );
  expect(unassigned.latest).toMatchObject({ owner: null, version: 3 });
  expect(unassigned.history.map((e) => e.owner)).toEqual([
    "teller",
    "manager",
    null,
  ]);
  expect(Schema.is(ResponsibilityDetail)(unassigned)).toBe(true);
  expect(
    JSON.stringify(s.h.db.query("SELECT * FROM service_requests").all()),
  ).toBe(before);
  expect(
    JSON.stringify(s.h.db.query("SELECT * FROM service_case_events").all()),
  ).toBe(events);
  expect(s.h.calls.filter((c) => c.method !== "GET").length).toBe(posts);
});

test("customer, foreign relationship and foreign owned case are denied before assignment evidence is exposed", async () => {
  const s = await setup();
  expect(
    await s.run(
      readCaseResponsibility(
        s.source,
        s.recipientId,
        s.created.request.id,
      ).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 403 });
  expect(
    await s.run(
      readCaseResponsibility(s.officer, "foreign", s.created.request.id).pipe(
        Effect.flip,
      ),
    ),
  ).toMatchObject({ status: 404 });
  const foreign = await harness.run(
    s.h,
    submitServiceCase(
      s.source,
      "email_change",
      { email: "foreign@example.test", explanation: "Foreign synthetic case" },
      "foreign-case-original",
    ),
  );
  expect(
    await s.run(
      readCaseResponsibility(s.officer, s.recipientId, foreign.request.id).pipe(
        Effect.flip,
      ),
    ),
  ).toMatchObject({ status: 404 });
  await s.run(s.assign());
  s.h.db.run(
    "INSERT INTO banks(id,status,customer_client,customer_account) VALUES('foreign-responsibility-bank','ready',999001,999002)",
  );
  s.h.db.run(
    "INSERT INTO customers(id,branch_id,bank_id,reference,display_name,client_id,account_id,account_no,origin,status) VALUES('foreign-responsibility-customer','foreign-responsibility-bank','foreign-responsibility-bank','foreign-responsibility-ref','Synthetic foreign customer',999001,999002,'999002','seed','active')",
  );
  expect(
    await s.run(
      readCaseResponsibility(
        { ...s.officer, bank_id: "foreign-responsibility-bank" },
        s.recipientId,
        s.created.request.id,
      ).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 404 });
});

test("changed original key payload or actor, stale versions and no-op owners cannot append history", async () => {
  const s = await setup();
  await s.run(s.assign());
  for (const e of [
    s.assign("assignment-original", { ...s.command(), note: "Changed reason" }),
    s.assign("assignment-original", s.command(), s.approver),
    s.assign("assignment-stale", s.command(0, "manager")),
    s.assign("assignment-noop", s.command(1, "teller")),
  ])
    expect(await s.run(e.pipe(Effect.flip))).toMatchObject({ status: 409 });
  expect((await s.run(s.read())).history).toHaveLength(1);
  expect(
    await s.run(
      readCaseResponsibility(
        s.officer,
        s.recipientId,
        s.created.request.id,
        "not-recorded-key",
      ).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 404 });
  expect(
    await s.run(
      s.assign("bad key!", s.command(1, "manager")).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 400 });
});

test("two distinct keys racing past current history admit one atomic append and a definite conflict", async () => {
  const s = await setup(),
    store = await harness.run(s.h, Store),
    barrier = Promise.withResolvers<void>();
  let arrivals = 0;
  const concurrent = Layer.succeed(Store, {
    ...store,
    run: (sql: string, ...values: (string | number | null)[]) =>
      sql.startsWith("INSERT INTO branch_case_responsibility_events")
        ? Effect.gen(function* () {
            if (++arrivals === 2) barrier.resolve();
            yield* Effect.promise(() => barrier.promise);
            return yield* store.run(sql, ...values);
          })
        : store.run(sql, ...values),
  });
  const results = await Promise.all(
    ["assignment-race-first", "assignment-race-second"].map((key) =>
      s.run(s.assign(key).pipe(Effect.provide(concurrent), Effect.either)),
    ),
  );
  const winners = results.filter(Either.isRight),
    conflicts = results.filter(Either.isLeft);
  expect(winners).toHaveLength(1);
  expect(conflicts).toHaveLength(1);
  expect(conflicts[0].left).toMatchObject({ status: 409, uncertain: false });
  expect((await s.run(s.read())).history).toHaveLength(1);
});

test("original assignment keys cannot be reused or inspected under a different owned service case", async () => {
  const s = await setup();
  await s.run(s.assign());
  const other = await harness.run(
    s.h,
    submitServiceCase(
      { ...s.officer, role: "customer", bank_id: s.created.request.bank_id },
      "email_change",
      {
        email: "other-case@example.test",
        explanation: "Another owned synthetic case",
      },
      "responsibility-other-case",
    ),
  );
  expect(
    await s.run(
      assignCaseResponsibility(
        s.officer,
        s.recipientId,
        other.request.id,
        s.command(),
        "assignment-original",
      ).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 409 });
  expect(
    await s.run(
      readCaseResponsibility(
        s.officer,
        s.recipientId,
        other.request.id,
        "assignment-original",
      ).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 404 });
  expect(
    (
      await s.run(
        readCaseResponsibility(s.officer, s.recipientId, other.request.id),
      )
    ).history,
  ).toEqual([]);
});

test("lost write acknowledgement is confirmed by its exact original saved event and retry cannot duplicate it", async () => {
  const s = await setup(),
    store = await harness.run(s.h, Store);
  const lost = Layer.succeed(Store, {
    ...store,
    run: (sql: string, ...values: (string | number | null)[]) =>
      store.run(sql, ...values).pipe(
        Effect.flatMap((changes) =>
          sql.startsWith("INSERT INTO branch_case_responsibility_events")
            ? Effect.fail(
                new BankingError({
                  message: "Synthetic acknowledgement loss",
                  status: 503,
                  uncertain: true,
                }),
              )
            : Effect.succeed(changes),
        ),
      ),
  });
  const result = await s.run(s.assign().pipe(Effect.provide(lost)));
  expect(result.confirmedEvent).toMatchObject({
    key: "assignment-original",
    owner: "teller",
    version: 1,
  });
  const retry = await s.run(s.assign());
  expect(retry.history).toHaveLength(1);
  expect(retry.confirmedEvent?.id).toBe(result.confirmedEvent?.id);
});

test("unavailable original confirmation remains uncertain after a saved append and a later exact retry recovers it", async () => {
  const s = await setup(),
    store = await harness.run(s.h, Store);
  let keyReads = 0;
  const unavailable = Layer.succeed(Store, {
    ...store,
    one: <T>(sql: string, ...values: (string | number | null)[]) =>
      sql.includes("AND command_key=?") && ++keyReads > 1
        ? Effect.fail(
            new BankingError({
              message: "Synthetic confirmation unavailable",
              status: 503,
            }),
          )
        : store.one<T>(sql, ...values),
  });
  expect(
    await s.run(s.assign().pipe(Effect.provide(unavailable), Effect.flip)),
  ).toMatchObject({ status: 503, uncertain: true });
  const recovered = await s.run(s.assign());
  expect(recovered.history).toHaveLength(1);
  expect(recovered.confirmedEvent?.key).toBe("assignment-original");
});

test("routes reject excess/malformed commands and scope key inspection to the requested owned case", async () => {
  const s = await setup();
  const post = (body: unknown) =>
    branchRoutes(
      new Request("https://example.test/api/branch/service-responsibility", {
        method: "POST",
        body: JSON.stringify(body),
      }),
      s.officer,
    );
  const body = {
    customerId: s.recipientId,
    requestId: s.created.request.id,
    key: "assignment-route-key",
    command: s.command(),
  };
  for (const invalid of [
    { ...body, unexpected: true },
    { ...body, command: { ...s.command(), version: 0.5 } },
    { ...body, command: { ...s.command(), owner: "admin" } },
    { ...body, command: { ...s.command(), note: "     " } },
    { ...body, command: { ...s.command(), note: "😀😀😀" } },
    { ...body, command: { ...s.command(), unexpected: true } },
  ])
    expect(await s.run(post(invalid).pipe(Effect.flip))).toMatchObject({
      status: 400,
    });
  const response = await s.run(post(body));
  expect(response?.status).toBe(200);
  const detail = Schema.decodeUnknownSync(ResponsibilityDetail)(
    await response?.json(),
  );
  expect(detail.confirmedEvent?.key).toBe(body.key);
});

test("SQL rejects mutable history, stale versions and forged request identity", async () => {
  const s = await setup();
  await s.run(s.assign());
  expect(() =>
    s.h.db.exec("UPDATE branch_case_responsibility_events SET owner='manager'"),
  ).toThrow("immutable");
  expect(() =>
    s.h.db.exec("DELETE FROM branch_case_responsibility_events"),
  ).toThrow("cannot be reset");
  const row = s.h.db
    .query("SELECT * FROM branch_case_responsibility_events")
    .get() as Record<string, string | number | null>;
  const insert = s.h.db.prepare(
    "INSERT INTO branch_case_responsibility_events(id,branch_id,customer_id,request_id,command_key,actor,owner,note,expected_version,version,request_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
  );
  expect(() =>
    insert.run(
      "forged",
      row.branch_id,
      row.customer_id,
      row.request_id,
      "assignment-forged",
      row.actor,
      "manager",
      row.note,
      1,
      2,
      row.request_json,
      row.created_at,
    ),
  ).toThrow("identity differs");
  expect((await s.run(s.read())).history).toHaveLength(1);
});

test("over200 immutable events expose latest separately, retain original replay, and withhold new assignments", async () => {
  const s = await setup();
  for (let i = 0; i <= 200; i++)
    await s.run(
      s.assign(
        `assignment-history-${i}`,
        s.command(i, i % 2 ? "manager" : "teller"),
      ),
    );
  const detail = await s.run(s.read());
  expect(detail.historyComplete).toBe(false);
  expect(detail.history).toHaveLength(200);
  expect(detail.latest?.version).toBe(201);
  const original = await s.run(s.assign("assignment-history-0", s.command()));
  expect(original.confirmedEvent?.version).toBe(1);
  expect(original.latest?.version).toBe(201);
  expect(
    await s.run(
      s
        .assign("assignment-history-next", s.command(201, "manager"))
        .pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 409 });
  for (const corrupt of [
    { ...detail, historyComplete: true },
    { ...detail, latest: { ...detail.latest, customerId: "foreign" } },
    { ...detail, latest: { ...detail.latest, key: detail.history[0].key } },
    { ...detail, confirmedEvent: { ...detail.latest, owner: "accountant" } },
    {
      ...detail,
      history: [
        detail.history[1],
        detail.history[0],
        ...detail.history.slice(2),
      ],
    },
    {
      ...detail,
      history: [...detail.history.slice(0, 199), detail.history[0]],
    },
  ])
    expect(Schema.is(ResponsibilityDetail)(corrupt)).toBe(false);
});
