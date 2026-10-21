import { expect, type Page, test } from "@playwright/test";
import { savedWorkspace } from "./fixtures/workspace";

async function install(
  page: Page,
  exit: "ok" | "failed" | "malformed" | "expired" = "ok",
) {
  const data = savedWorkspace();
  let authenticated = true;
  const writes: string[] = [];
  const reads: string[] = [];
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET") reads.push(path);
    else writes.push(path);
    if (path === "/api/telemetry-config") return route.fulfill({ json: {} });
    if (path === "/api/session/end") {
      if (exit === "failed")
        return route.fulfill({
          status: 503,
          json: { error: "Session service unavailable", uncertain: false },
        });
      if (exit === "malformed") return route.fulfill({ json: {} });
      authenticated = false;
      return route.fulfill({
        status: exit === "expired" ? 401 : 200,
        json:
          exit === "expired" ? { error: "Session expired" } : { ended: true },
      });
    }
    if (path === "/api/customers")
      return route.fulfill({
        json: {
          customers: [
            {
              id: "profile-mira",
              display_name: "Mira Krishnan",
              reference: "SYN-PROFILE",
              account_suffix: "0001",
            },
          ],
        },
      });
    if (path === "/api/customer-selection") {
      authenticated = true;
      return route.fulfill({ json: { dashboard: data } });
    }
    if (path === "/api/dashboard")
      return route.fulfill(
        authenticated
          ? { json: data }
          : { status: 401, json: { error: "Choose a customer" } },
      );
    return route.fulfill({
      status: 404,
      json: { error: "Not part of profile fixture" },
    });
  });
  return {
    data,
    writes,
    reads,
    expire: () => {
      authenticated = false;
    },
  };
}

const profile = (page: Page) =>
  page.getByRole("button", { name: /Profile menu for Mira Krishnan/ });
const exitDemo = async (page: Page) => {
  await profile(page).click();
  await page
    .getByRole("menuitem", { name: "Exit demo (log out)", exact: true })
    .click();
};

test("public website stays public with an active demo; entry deliberately resumes it", async ({
  page,
}) => {
  const fixture = await install(page);
  for (const path of ["/", "/discover"]) {
    for (const entry of [
      ".magazine-header",
      ".magazine-cover",
      "#experience",
      "#demo-entry",
    ]) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: "Banking, seen from both sides." }),
      ).toBeVisible();
      expect(fixture.reads).toEqual([]);
      await page
        .locator(entry)
        .getByRole("link", { name: "Try the demo" })
        .click();
      await expect(page).toHaveURL(/\/demo$/);
      await expect(profile(page)).toBeVisible();
      expect(fixture.writes).toEqual([]);
      fixture.reads.length = 0;
    }
  }
  await profile(page).focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menu", { name: "Profile menu for Mira Krishnan" }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "My profile", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await profile(page).click();
  await page.getByRole("menuitem", { name: "Back to website" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "Banking, seen from both sides." }),
  ).toBeVisible();
  await page.locator("#demo-entry a").click();
  await expect(profile(page)).toBeVisible();
  expect(fixture.writes).toEqual([]);
});

for (const mode of ["ok", "expired"] as const)
  test(`${mode} logout exits to public website, retains original references and permits explicit re-entry`, async ({
    page,
  }) => {
    const fixture = await install(page, mode);
    await page.goto("/demo");
    await expect(profile(page)).toBeVisible();
    const key = `openfinacle:customer-transfer:${fixture.data.bank.id}`;
    const original = JSON.stringify({
      schema: 1,
      bank_id: fixture.data.bank.id,
      key: "preserved-original-key",
      review: {
        offer: {
          id: "original-offer",
          bank_id: fixture.data.bank.id,
          sender_id: "profile-mira",
          recipient_id: "profile-other",
          amount_minor: 10000,
          payment_date: "2026-10-18",
          expires_at: 1893456000000,
        },
        sender_name: "Mira Krishnan",
        sender_suffix: "0001",
        recipient_name: "Other customer",
        recipient_suffix: "0002",
      },
    });
    await page.evaluate(
      ({ key, original }) => sessionStorage.setItem(key, original),
      { key, original },
    );
    await exitDemo(page);
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("heading", { name: "Banking, seen from both sides." }),
    ).toBeVisible();
    expect(await page.evaluate((key) => sessionStorage.getItem(key), key)).toBe(
      original,
    );
    await page.reload();
    await expect(profile(page)).toHaveCount(0);
    await page.locator("#demo-entry a").click();
    await expect(
      page.getByRole("heading", { name: "Choose your banking journey" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Explore existing customer", exact: true })
      .click();
    await page
      .getByRole("button", { name: /Mira Krishnan.*SYN-PROFILE/ })
      .click();
    await expect(page).toHaveURL(/\/overview$/);
    await expect(profile(page)).toBeVisible();
    expect(await page.evaluate((key) => sessionStorage.getItem(key), key)).toBe(
      original,
    );
    expect(fixture.writes).toEqual([
      "/api/session/end",
      "/api/customer-selection",
    ]);
  });

for (const mode of ["failed", "malformed"] as const)
  test(`${mode} logout stays in demo and exposes a retryable error`, async ({
    page,
  }) => {
    const fixture = await install(page, mode);
    await page.goto("/demo");
    await expect(profile(page)).toBeVisible();
    await exitDemo(page);
    await expect(
      page.getByRole("alert").filter({
        hasText:
          mode === "failed"
            ? "Session service unavailable"
            : "could not verify that the demo ended",
      }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/demo$/);
    await expect(profile(page)).toBeEnabled();
    expect(fixture.writes).toEqual(["/api/session/end"]);
  });

test("profile menu supports Escape, focus return and narrow large-text layout", async ({
  page,
}, testInfo) => {
  const fixture = await install(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo");
  await expect(profile(page)).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await profile(page).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  const dimensions = await page.getByRole("menu").evaluate((e) => ({
    left: e.getBoundingClientRect().left,
    right: e.getBoundingClientRect().right,
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.left).toBeGreaterThanOrEqual(0);
  expect(dimensions.right).toBeLessThanOrEqual(dimensions.width);
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
  await page.screenshot({
    path: testInfo.outputPath("profile-mobile-large.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(profile(page)).toBeFocused();
  expect(fixture.writes).toEqual([]);
});

test("a browser-restored portal rechecks an ended session before exposing customer data", async ({
  page,
}) => {
  const fixture = await install(page);
  await page.goto("/demo");
  await expect(profile(page)).toBeVisible();
  fixture.expire();
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  await expect(profile(page)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Choose your banking journey" }),
  ).toBeVisible();
  expect(
    fixture.reads.filter((path) => path === "/api/dashboard"),
  ).toHaveLength(2);
  expect(fixture.writes).toEqual([]);
});

test("staff profile menu labels the selected customer rather than claiming an employee profile", async ({
  page,
}) => {
  const fixture = await install(page);
  fixture.data.role = "officer";
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "Profile menu for Priya Rao" })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Customer profile", exact: true }),
  ).toHaveAttribute("href", "/profile");
  await expect(
    page.getByRole("menuitem", { name: "My profile", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/profile-menu-desktop.png",
    fullPage: true,
  });
  expect(fixture.writes).toEqual([]);
});
