import { expect, test } from "@playwright/test";

test("unavailable core explains startup failure without creating demo accounts", async ({
  page,
}) => {
  let sessions = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/session") sessions++;
  });
  await page.route("**/api/ready", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      headers: { "X-Request-ID": "readiness-regression" },
      body: JSON.stringify({
        error: "The banking engine is starting. Check again shortly.",
      }),
    }),
  );
  await page.goto("/");
  const button = page.getByRole("button", {
    name: "Explore existing customer",
  });
  await button.click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "The banking engine is starting" }),
  ).toContainText("readiness-regression");
  await expect(button).toBeEnabled();
  expect(sessions).toBe(0);
});

test("browser exceptions reach the Sentry-compatible ingestion endpoint without customer data", async ({
  page,
}) => {
  const accepted = page.waitForResponse(
    (response) =>
      response.url().includes("/envelope/") &&
      response.request().method() === "POST",
    { timeout: 30000 },
  );
  const configured = page.waitForResponse((response) =>
    response.url().includes("/api/telemetry-config"),
  );
  await page.goto("/");
  await configured;
  // Error value deliberately resembles sensitive data; only a static label should leave the browser.
  await page.evaluate(() => {
    window.setTimeout(() => {
      throw new Error("synthetic-sensitive-value@example.test");
    }, 500);
  });
  const response = await accepted;
  const envelope = response.request().postData() ?? "";
  expect(envelope).toContain("OpenFinacle browser exception");
  expect(envelope).not.toContain("synthetic-sensitive-value");
  expect(response.status()).toBe(200);
});
