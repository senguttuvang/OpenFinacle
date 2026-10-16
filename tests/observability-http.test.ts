import { expect, mock, test } from "bun:test";
import type { Environment } from "../src/adapters/environment";

mock.module("@cloudflare/containers", () => ({
  getContainer: (namespace: unknown) => namespace,
}));
const { handleRequest } = await import("../src/http");

const env = (database: Partial<D1Database> = {}): Environment => ({
  DB: database as D1Database,
  DOCUMENTS: {} as R2Bucket,
  ASSETS: {} as Fetcher,
  CORE: {} as Environment["CORE"],
  CORE_DATABASE: "unused",
  CORE_PASSWORD: "unused",
  ADMIN_TOKEN: "test-admin",
  APP_REVISION: "test-revision",
});
const request = (path: string) => new Request(`https://demo.test${path}`);

test("liveness remains independent while readiness detects failed workflow storage", async () => {
  const environment = env({
    prepare: () => {
      throw new Error("private storage detail");
    },
  });
  expect(
    (await handleRequest(request("/api/health"), environment)).status,
  ).toBe(200);
  const ready = await handleRequest(request("/api/ready"), environment);
  expect(ready.status).toBe(503);
  expect(await ready.text()).not.toContain("private storage detail");
  expect(ready.headers.get("X-Request-ID")).toMatch(/^[a-f0-9-]{36}$/);
  expect(ready.headers.get("Server-Timing")).toMatch(/^app;dur=\d+$/);
});

test("controlled exception probe requires administrator authority and returns a correlation ID", async () => {
  expect(
    (
      await handleRequest(
        new Request("https://demo.test/api/admin/telemetry-probe", {
          method: "POST",
        }),
        env(),
      )
    ).status,
  ).toBe(401);
  const response = await handleRequest(
    new Request("https://demo.test/api/admin/telemetry-probe", {
      method: "POST",
      headers: { Authorization: "Bearer test-admin" },
    }),
    env(),
  );
  expect(response.status).toBe(500);
  const body = (await response.json()) as { requestId: string; error: string };
  expect(body.requestId).toBe(response.headers.get("X-Request-ID") ?? "");
  expect(body.error).not.toContain("probe");
});

test("readiness uses only the authenticated core read and never initializes a workspace", async () => {
  const statement = {
    bind() {
      return this;
    },
    first: async () => ({ ready: 1 }),
  } as unknown as D1PreparedStatement;
  const environment = env({ prepare: () => statement });
  const calls: string[] = [];
  environment.CORE = {
    fetch: async (input: Request) => {
      calls.push(`${input.method} ${new URL(input.url).pathname}`);
      expect(input.headers.get("Authorization")).toBe(
        `Basic ${btoa("mifos:unused")}`,
      );
      return Response.json({ id: 1 });
    },
  } as unknown as Environment["CORE"];
  const ready = await handleRequest(request("/api/ready"), environment);
  expect(ready.status).toBe(200);
  expect(await ready.json()).toEqual({
    status: "ready",
    revision: "test-revision",
  });
  expect(calls).toEqual(["GET /fineract-provider/api/v1/offices/1"]);
});
