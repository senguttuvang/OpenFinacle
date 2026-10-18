import { expect, test } from "@playwright/test";

test("existing customer opens within three seconds without consulting core readiness", async ({
  page,
}) => {
  let sessions = 0;
  let readiness = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/session") sessions++;
  });
  await page.route("**/api/ready", (route) => {
    readiness++;
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      headers: { "X-Request-ID": "readiness-regression" },
      body: JSON.stringify({
        error: "The banking engine is starting. Check again shortly.",
      }),
    });
  });
  await page.goto("/demo");
  const button = page.getByRole("button", {
    name: "Explore existing customer",
  });
  const started = performance.now();
  await button.click();
  await expect(
    page.getByRole("heading", { name: "Welcome back, Mira" }),
  ).toBeVisible({ timeout: 3000 });
  const elapsed = performance.now() - started;
  expect(elapsed).toBeLessThan(3000);
  console.info(`Existing demo entry: ${Math.round(elapsed)}ms`);
  expect(sessions).toBe(1);
  expect(readiness).toBe(0);
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
  await page.goto("/demo");
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
