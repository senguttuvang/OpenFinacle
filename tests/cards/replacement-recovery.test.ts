import { expect, test } from "bun:test";
import { Schema } from "effect";
import { ReplacementDetail } from "../../src/platform/cards/domain/card-replacements";
import type { Environment } from "../../src/runtime/http/environment";
import { createHarness } from "./card-replacement-store.harness";

const harness = await createHarness();
test("HTTP replacement routes enforce strict role/owned/versioned commands and no core access", async () => {
  const token = "synthetic-replacement-session";
  const hash = new Bun.CryptoHasher("sha256").update(token).digest("hex");
  harness.db.run(
    "INSERT INTO sessions(token_hash,bank_id,role,expires_at) VALUES(?,'replacement-bank','customer',?)",
    [hash, Number.MAX_SAFE_INTEGER],
  );
  let coreCalls = 0;
  const env = {
    DB: {
      prepare: (sql: string) => {
        let values: (string | number | null)[] = [];
        return {
          bind(...args: (string | number | null)[]) {
            values = args;
            return this;
          },
          first: async () => harness.db.query(sql).get(...values),
          all: async () => ({ results: harness.db.query(sql).all(...values) }),
          run: async () => ({
            meta: { changes: harness.db.run(sql, values).changes },
          }),
        };
      },
    } as unknown as D1Database,
    CORE: {
      fetch: async () => {
        coreCalls++;
        throw new Error("No replacement core effect");
      },
    } as unknown as Environment["CORE"],
    DOCUMENTS: {} as R2Bucket,
    ASSETS: {} as Fetcher,
    CORE_DATABASE: "unused",
    CORE_PASSWORD: "unused",
    ADMIN_TOKEN: "unused",
    APP_REVISION: "replacement-tests",
    DEMO_MODE: "true",
  } satisfies Environment;
  let httpScope = harness.customer.bank_id;
  const http = (
    path: string,
    body?: unknown,
    key = "http-replacement-key",
    cookie = true,
  ) =>
    harness.handleRequest(
      new Request(`https://demo.test/api${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(cookie ? { Cookie: `of_session=${token}` } : {}),
          Origin: "https://demo.test",
          "X-Customer-Scope": httpScope,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env,
    );
  expect(
    (await http("/card-replacements", undefined, "unused-key", false)).status,
  ).toBe(401);
  expect(
    (await http("/card-replacements", { ...harness.terms, fee: 99 })).status,
  ).toBe(400);
  expect((await http("/card-replacements", harness.terms, "bad")).status).toBe(
    400,
  );
  const response = await http("/card-replacements", harness.terms);
  expect(response.status).toBe(200);
  const saved = Schema.decodeUnknownSync(ReplacementDetail)(
    await response.json(),
  );
  const id = saved.replacement.id;
  expect(
    (await http(`/card-replacements?id=${id}&key=http-replacement-key`)).status,
  ).toBe(400);
  const input = {
    id,
    version: 0,
    action: "recommend",
    note: "HTTP synthetic review",
  };
  expect(
    (await http("/card-replacements/action", input, "customer-recommend-key"))
      .status,
  ).toBe(403);
  harness.db.run("UPDATE sessions SET role='officer' WHERE token_hash=?", [
    hash,
  ]);
  expect(
    (
      await http(
        "/card-replacements/action",
        { ...input, status: "recommended" },
        "extra-field-key",
      )
    ).status,
  ).toBe(400);
  expect(
    (await http("/card-replacements/action", input, "http-recommend-key"))
      .status,
  ).toBe(200);
  const issue = { ...input, action: "issue", version: 1, source_version: 0 };
  expect(
    (await http("/card-replacements/action", issue, "self-http-issue-key"))
      .status,
  ).toBe(403);
  harness.db.run("UPDATE sessions SET role='approver' WHERE token_hash=?", [
    hash,
  ]);
  expect(
    (
      await http(
        "/card-replacements/action",
        { ...issue, card_version: 0 },
        "irrelevant-version-key",
      )
    ).status,
  ).toBe(400);
  expect(
    (await http("/card-replacements/action", issue, "http-issue-key")).status,
  ).toBe(200);
  expect((await http("/card-replacements?key=http-issue-key")).status).toBe(
    200,
  );
  harness.db.run("UPDATE sessions SET bank_id='other' WHERE token_hash=?", [
    hash,
  ]);
  httpScope = "other";
  expect((await http(`/card-replacements?id=${id}`)).status).toBe(404);
  expect((await http("/card-replacements?key=http-issue-key")).status).toBe(
    404,
  );
  expect(
    (
      await harness.handleRequest(
        new Request("https://demo.test/api/card-replacements"),
        { ...env, DEMO_MODE: "false" },
      )
    ).status,
  ).toBe(503);
  expect(coreCalls).toBe(0);
  expect(harness.db.query("SELECT COUNT(*) AS n FROM commands").get()).toEqual({
    n: 0,
  });
});
