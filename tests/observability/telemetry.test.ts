import { expect, test } from "bun:test";
import {
  safeCoreRoute,
  safeRoute,
} from "../../src/platform/observability/domain/telemetry";
import { sanitizeEvent } from "../../src/platform/observability/infrastructure/telemetry";

test("telemetry allowlist discards customer data, credentials, source context and unknown SDK fields", () => {
  const sanitized = sanitizeEvent({
    type: undefined,
    event_id: "0123456789abcdef0123456789abcdef",
    release: "revision",
    request: {
      url: "https://bank.test/api?secret=private-value",
      headers: { Authorization: "private-value" },
      data: { customer: "private-value" },
      cookies: { session: "private-value" },
    },
    user: { email: "private-value" },
    extra: { account: "private-value" },
    breadcrumbs: [{ message: "private-value" }],
    tags: {
      requestId: "request-123",
      route: "/api/session",
      customer: "private-value",
    },
    exception: {
      values: [
        {
          type: "Error",
          value: "private-value",
          stacktrace: {
            frames: [
              {
                filename: "worker.js?token=private-value",
                function: "handleRequest",
                lineno: 42,
                vars: { password: "private-value" },
                context_line: "private-value",
              },
            ],
          },
        },
      ],
    },
  });
  expect(JSON.stringify(sanitized)).not.toContain("private-value");
  expect(sanitized.tags).toEqual({
    requestId: "request-123",
    route: "/api/session",
  });
  expect(
    sanitized.exception?.values?.[0].stacktrace?.frames?.[0],
  ).toMatchObject({
    filename: "worker.js",
    function: "handleRequest",
    lineno: 42,
  });
});

test("route labels never retain customer IDs, names or query strings", () => {
  expect(safeRoute("/api/documents/private-file")).toBe("/api/documents/:id");
  expect(safeRoute("/api/admin/core/private")).toBe("/api/admin/:operation");
  expect(safeRoute("/unknown/private-name")).toBe("/unknown");
  expect(
    safeCoreRoute(
      "savingsaccounts/123/transactions/456?command=deposit&name=private",
    ),
  ).toBe("savingsaccounts/:id/transactions/:id");
});

test("browser error reports exclude form values, foreign scripts, cookies and error text", async () => {
  const { sanitizeBrowserEvent } = await import(
    "../../src/platform/observability/ui/browser-errors"
  );
  const event = sanitizeBrowserEvent(
    {
      type: undefined,
      request: { data: "private-browser-value" },
      user: { email: "private-browser-value" },
      extra: { form: "private-browser-value" },
      exception: {
        values: [
          {
            value: "private-browser-value",
            stacktrace: {
              frames: [
                {
                  filename:
                    "https://demo.test/_next/static/chunk.js?token=private-browser-value",
                  lineno: 12,
                  vars: { name: "private-browser-value" },
                },
                { filename: "https://external.test/private-browser-value.js" },
              ],
            },
          },
        ],
      },
    },
    "https://demo.test",
  );
  expect(JSON.stringify(event)).not.toContain("private-browser-value");
  expect(event.exception?.values?.[0].stacktrace?.frames).toEqual([
    {
      filename: "https://demo.test/_next/static/chunk.js",
      function: undefined,
      lineno: 12,
      colno: undefined,
    },
  ]);
});
