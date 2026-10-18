import { afterEach, expect, test } from "bun:test";
import { Effect } from "effect";
import {
  prepareCustomerManifest,
  resumeCustomerSeed,
} from "../src/application/customer-provisioning";
import { customerRoute } from "../src/customer-http";
import type { Session } from "../src/domain/banking";
import { customerHarness } from "./fixtures/customer-banking";

const fixtures: ReturnType<typeof customerHarness>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.db.close();
});
test("directory route requires explicit registered selection; transfer routes bind scope and reject caller account selectors", async () => {
  const h = customerHarness();
  fixtures.push(h);
  await Effect.runPromise(
    prepareCustomerManifest("branch").pipe(Effect.provide(h.layer)),
  );
  await Effect.runPromise(
    resumeCustomerSeed("branch", 1, 1).pipe(Effect.provide(h.layer)),
  );
  const session: Session = {
    bank_id: "branch",
    token_hash: "old-token",
    role: "customer",
    expires_at: Date.now() + 100000,
  };
  h.db.run(
    "INSERT INTO sessions(token_hash,bank_id,role,expires_at) VALUES(?,?,'customer',?)",
    [session.token_hash, session.bank_id, session.expires_at],
  );
  const route = (
    path: string,
    body?: unknown,
    current: Session | null = session,
    scope = "branch",
  ) =>
    customerRoute(
      new Request(`https://demo.test/api${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Customer-Scope": scope,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      current,
      (value) => Effect.succeed(value),
    );
  const run = <A, E>(
    effect: Effect.Effect<
      A,
      E,
      Effect.Effect.Context<ReturnType<typeof customerRoute>>
    >,
  ) => Effect.runPromise(effect.pipe(Effect.provide(h.layer)));
  const directory = await run(route("/customers", undefined, null));
  const choices = (await directory.json()) as { customers: { id: string }[] };
  expect(choices.customers).toHaveLength(2);
  expect(
    await run(route("/customer-selection", {}).pipe(Effect.flip)),
  ).toMatchObject({ status: 400 });
  expect(
    await run(
      route("/customer-selection", { customerId: "not-registered" }).pipe(
        Effect.flip,
      ),
    ),
  ).toMatchObject({ status: 404 });
  expect(
    await run(
      route("/customer-selection", {
        customerId: "sample-branch-001",
        accountId: 11,
      }).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 400 });
  expect(
    await run(
      route(
        "/customer-transfers/review",
        { recipientId: "sample-branch-001", amount: "1.00" },
        session,
        "previous-customer",
      ).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 409 });
  expect(
    await run(
      route("/customer-transfers/review", {
        recipientId: "sample-branch-001",
        amount: "1.00",
        toAccountId: 14,
      }).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 400 });
  const selected = await run(
    route("/customer-selection", { customerId: "sample-branch-001" }),
  );
  expect(selected.headers.get("Set-Cookie")).toContain(
    "HttpOnly; Secure; SameSite=Strict",
  );
  const body = (await selected.json()) as {
    dashboard: { bank: { id: string }; account: { id: number } };
  };
  expect(body.dashboard.bank.id).toBe("sample-branch-001");
  expect(body.dashboard.account.id).toBe(200);
  expect(
    h.db
      .query("SELECT token_hash FROM sessions WHERE token_hash='old-token'")
      .get(),
  ).toBeNull();
  expect(
    h.calls.filter((call) => call.path === "accounttransfers"),
  ).toHaveLength(0);
});
