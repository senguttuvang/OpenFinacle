import { expect, type Page, test } from "@playwright/test";
import source from "../specs/010-icici-navigation/source-inventory.json" with {
  type: "json",
};
import { openWorkspace } from "./fixtures/navigation";
import { choosePersona } from "./fixtures/persona";
import { savedWorkspace } from "./fixtures/workspace";

async function fixture(page: Page) {
  const data = savedWorkspace();
  data.customer = {
    id: "navigation-customer",
    display_name: "Mira Krishnan",
    reference: "SYN-NAV",
    account_suffix: "0001",
  };
  const writes: string[] = [];
  const scopes: { path: string; scope?: string }[] = [];
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    scopes.push({ path, scope: request.headers()["x-customer-scope"] });
    if (path === "/api/session/role") {
      data.role = request.postDataJSON().role;
      return route.fulfill({ json: { role: data.role } });
    }
    if (request.method() !== "GET") writes.push(path);
    if (path === "/api/dashboard") return route.fulfill({ json: data });
    if (path === "/api/deposits")
      return route.fulfill({ json: { deposits: [] } });
    if (path === "/api/recurring-deposits")
      return route.fulfill({ json: { plans: [] } });
    if (path === "/api/telemetry-config") return route.fulfill({ json: {} });
    return route.fulfill({
      status: 404,
      json: { error: `No fixture for ${path}` },
    });
  });
  await page.goto("/demo");
  await expect(
    page.getByRole("navigation", { name: "Banking navigation", exact: true }),
  ).toBeVisible();
  return { data, writes, scopes };
}
async function select(page: Page, family: string, child: string) {
  const nav = page.getByRole("navigation", {
    name: "Banking navigation",
    exact: true,
  });
  await expect(
    page
      .getByRole("navigation", { name: "Workspace shortcuts", exact: true })
      .getByRole("link", { name: "Account opening", exact: true }),
  ).toHaveAttribute("href", "/open-account");
  const toggle = nav.getByRole("button", { name: "Banking menu" });
  if (
    (await toggle.isVisible()) &&
    (await toggle.getAttribute("aria-expanded")) !== "true"
  )
    await toggle.click();
  const trigger = nav.getByRole("button", { name: family, exact: true });
  await trigger.focus();
  if ((await trigger.getAttribute("aria-expanded")) !== "true")
    await trigger.press("Enter");
  const panel = nav.locator(".retail-menu-panel:not([hidden])");
  await panel
    .getByRole("link", { name: child, exact: true })
    .or(
      panel.getByRole("link", {
        name: `${child} Not available in demo`,
        exact: true,
      }),
    )
    .click();
}

test("integrated rail preserves all observed branches, shortcuts, identity and staff navigation", async ({
  page,
}, testInfo) => {
  const { writes } = await fixture(page);
  const nav = page.getByRole("navigation", {
    name: "Banking navigation",
    exact: true,
  });
  for (const family of source.families) {
    const trigger = nav.getByRole("button", {
      name: family.label,
      exact: true,
    });
    await trigger.hover();
    await expect(
      nav.locator(".retail-menu-panel:not([hidden]) .retail-menu-leaf"),
    ).toHaveCount(family.children.length);
    await page.screenshot({
      path: testInfo.outputPath(`${family.id}-integrated.png`),
    });
  }
  await select(page, "Payment & Transfer", "Wire Transfer");
  await expect(
    page.getByRole("heading", { level: 1, name: "Wire Transfer", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toContainText(
    "not available in this demonstration",
  );
  await expect(page.getByRole("banner")).toContainText("Mira Krishnan");
  await openWorkspace(page, "statements");
  await expect(
    page.getByRole("heading", { level: 1, name: "Statements", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("not available in this demonstration", { exact: false }),
  ).not.toBeVisible();
  await choosePersona(page, "officer");
  await expect(nav).not.toBeVisible();
  await openWorkspace(page, "accounts");
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation", exact: true })
      .getByRole("link", { name: /Customer enquiry/ }),
  ).toBeVisible();
  await choosePersona(page, "customer");
  await expect(nav).toBeVisible();
  expect(writes).toEqual([]);
});

test("recurring and fixed menu links choose their supported product and retain customer scope", async ({
  page,
}) => {
  const { data, writes, scopes } = await fixture(page);
  await select(page, "Deposits", "Recurring Deposits");
  await expect(
    page.getByRole("heading", { name: "My recurring deposits", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Deposit products" })
      .getByRole("link", { name: "Recurring deposits", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await select(page, "Deposits", "Fixed Deposits");
  await expect(
    page
      .getByRole("navigation", { name: "Deposit products" })
      .getByRole("link", { name: "Fixed deposits", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect
    .poll(() =>
      [
        ...new Set(
          scopes
            .filter((entry) => entry.path.includes("deposits"))
            .map((entry) => entry.path),
        ),
      ].sort(),
    )
    .toEqual(["/api/deposits", "/api/recurring-deposits"]);
  expect(
    scopes
      .filter((entry) => entry.path.includes("deposits"))
      .map((entry) => entry.scope),
  ).toEqual(expect.arrayContaining([data.bank.id]));
  expect(
    scopes
      .filter((entry) => entry.path.includes("deposits"))
      .every((entry) => entry.scope === data.bank.id),
  ).toBe(true);
  expect(writes).toEqual([]);
});

test("integrated mobile menu reflows without hiding content or changing customer records", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { writes } = await fixture(page);
  await select(page, "Insurance", "Travel Insurance");
  await expect(
    page.getByRole("heading", {
      name: "Travel Insurance",
      level: 1,
      exact: true,
    }),
  ).toBeVisible();
  const toggle = page.getByRole("button", {
    name: "Banking menu",
    exact: true,
  });
  await expect(toggle).toBeFocused();
  await toggle.press("Enter");
  const trigger = page
    .getByRole("navigation", { name: "Banking navigation", exact: true })
    .getByRole("button", { name: "Investments", exact: true });
  await trigger.press("Enter");
  await trigger.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await trigger.press("Escape");
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("integrated-mobile.png"),
    fullPage: true,
  });
  expect(writes).toEqual([]);
});
