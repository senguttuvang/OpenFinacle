import { expect, test } from "bun:test";
import "../src/cli/planning-preview";
import preview from "../src/planning-preview";

const env = {
  LOCAL_PLANNING_PREVIEW: "true",
  APP_REVISION: "synthetic-test",
  DB: new Proxy({} as D1Database, {
    get: () => {
      throw new Error("Preview guard accessed storage");
    },
  }),
  ASSETS: new Proxy({} as Fetcher, {
    get: () => {
      throw new Error("Preview guard accessed assets");
    },
  }),
};
test("local planning harness refuses remote hosts and disabled mode before touching storage or assets", async () => {
  expect(
    (
      await preview.fetch(
        new Request("https://synthetic.invalid/api/planning-preview/session", {
          method: "POST",
          body: "{}",
        }),
        env,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await preview.fetch(
        new Request("http://localhost/api/planning-preview/info"),
        { ...env, LOCAL_PLANNING_PREVIEW: "false" },
      )
    ).status,
  ).toBe(403);
});
test("local preview requires explicit session and validates persona setup without touching bank/core", async () => {
  const info = await preview.fetch(
    new Request("http://localhost/api/planning-preview/info"),
    env,
  );
  expect(await info.json()).toEqual({
    localOnly: true,
    revision: "synthetic-test",
  });
  expect(
    (
      await preview.fetch(
        new Request("http://localhost/api/planning/context"),
        env,
      )
    ).status,
  ).toBe(401);
  const invalid = await preview.fetch(
    new Request("http://localhost/api/planning-preview/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ relationship: "real-person", role: "customer" }),
    }),
    env,
  );
  expect(invalid.status).toBe(400);
  const home = await preview.fetch(new Request("http://localhost/"), env);
  expect(home.headers.get("Location")).toBe("http://localhost/planning");
});
