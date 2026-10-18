import { expect, type Page, test } from "@playwright/test";
import {
  exportedPortalPaths,
  planningSections,
  retailPath,
} from "../app/portal-routes";
import { planningHouseholds } from "../src/domain/planning-fixtures";
import { initialPlanningState } from "../src/domain/planning-state";
import { retailMenu } from "../src/domain/retail-navigation";
import { serviceCatalog } from "../src/domain/services";
import { openWorkspace } from "./fixtures/navigation";
import { choosePersona } from "./fixtures/persona";
import { savedWorkspace } from "./fixtures/workspace";

async function install(page: Page, authenticated = true) {
  const data = savedWorkspace();
  const household = planningHouseholds()[1];
  if (!household) throw Error("Missing synthetic planning fixture");
  const writes: string[] = [],
    scopes: string[] = [];
  data.customer = {
    id: "routing-mira",
    display_name: "Mira Krishnan",
    reference: "SYN-ROUTE",
    account_suffix: "0001",
  };
  await page.route("**/api/**", (route) => {
    const r = route.request(),
      path = new URL(r.url()).pathname;
    if (r.method() !== "GET") writes.push(path);
    if (path === "/api/telemetry-config") return route.fulfill({ json: {} });
    if (path === "/api/customers")
      return route.fulfill({ json: { customers: [data.customer] } });
    if (path === "/api/customer-selection") {
      authenticated = true;
      return route.fulfill({ json: { dashboard: data } });
    }
    if (!authenticated)
      return route.fulfill({
        status: 401,
        json: { error: "Choose a customer" },
      });
    if (path === "/api/session/role") {
      data.role = r.postDataJSON().role;
      return route.fulfill({ json: { role: data.role } });
    }
    if (path === "/api/dashboard") return route.fulfill({ json: data });
    scopes.push(r.headers()["x-customer-scope"] ?? "missing");
    if (path === "/api/cards") return route.fulfill({ json: { cards: [] } });
    if (path === "/api/card-replacements")
      return route.fulfill({ json: { replacements: [] } });
    if (path === "/api/service-catalog")
      return route.fulfill({ json: { services: serviceCatalog } });
    if (path === "/api/service-cases")
      return route.fulfill({
        json: { requests: [], total: 0, offset: 0, limit: 25 },
      });
    if (path === "/api/planning/context")
      return route.fulfill({
        json: { relationship: data.bank.id, role: data.role, readOnly: false },
      });
    if (path === "/api/planning")
      return route.fulfill({
        json: {
          state: initialPlanningState(household),
          relationship: data.bank.id,
          readOnly: false,
          history: [],
        },
      });
    if (path === "/api/deposits")
      return route.fulfill({ json: { deposits: [] } });
    if (path === "/api/recurring-deposits")
      return route.fulfill({ json: { plans: [] } });
    return route.fulfill({
      status: 404,
      json: { error: "Not part of routing fixture" },
    });
  });
  return { data, writes, scopes };
}

test("all screen bookmarks are actual static exports and unknown URLs return truthful 404", async ({
  request,
  page,
}) => {
  for (const path of [
    ...exportedPortalPaths,
    ...Object.values(planningSections).map((slug) => `/planning/${slug}`),
  ]) {
    const r = await request.get(path);
    expect(r.status(), path).toBe(200);
    expect(r.headers()["content-type"], path).toContain("text/html");
  }
  await install(page);
  const response = await page.goto("/not-a-banking-screen");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "That screen does not exist" }),
  ).toBeVisible();
});

test("direct entry, reload and Back/Forward restore screen and selected customer without writes", async ({
  page,
}) => {
  const fixture = await install(page);
  await page.goto("/accounts");
  await expect(
    page.getByRole("heading", { name: "My accounts", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".person")).toContainText("Mira Krishnan");
  await page.screenshot({ path: "/tmp/finacle-routes-accounts-desktop.png" });
  await openWorkspace(page, "statements");
  await expect(page).toHaveURL(/\/statements$/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Statements", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "My accounts", exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: "Statements", exact: true }),
  ).toBeVisible();
  expect(fixture.writes).toEqual([]);
  await page.goto("/deposits/recurring");
  await expect(
    page.getByRole("link", { name: "Recurring deposits", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: /Recurring deposits/i }),
  ).toBeVisible();
  expect(fixture.scopes.every((scope) => scope === fixture.data.bank.id)).toBe(
    true,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "36px";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/finacle-routes-deposits-mobile.png" });
});

test("all retail leaves expose unique links; unsupported and family destinations survive reload", async ({
  page,
}) => {
  const fixture = await install(page);
  await page.goto("/overview");
  const nav = page.getByRole("navigation", {
    name: "Banking navigation",
    exact: true,
  });
  for (const family of retailMenu) {
    const trigger = nav.getByRole("button", {
      name: family.label,
      exact: true,
    });
    await trigger.focus();
    await trigger.press("Enter");
    for (const item of family.items)
      await expect(nav.locator(`a[href="${retailPath(item)}"]`)).toHaveCount(1);
    await expect(
      nav.getByRole("link", { name: `${family.label} overview`, exact: true }),
    ).toHaveAttribute("href", `/${family.id}`);
    await trigger.press("Escape");
  }
  await page.goto("/payments/wire-transfer");
  await expect(
    page.getByRole("heading", { level: 1, name: "Wire Transfer", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("This service is not available in this demonstration."),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Wire Transfer", exact: true }),
  ).toBeVisible();
  await page.goto("/investments");
  await expect(
    page.getByRole("heading", { name: "Investments", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Buy Mutual Funds", exact: true })
    .click();
  await expect(page).toHaveURL(/\/investments\/mutual-funds$/);
  expect(fixture.writes).toEqual([]);
});

test("direct branch links never grant role and allowed staff routes remain bookmarkable", async ({
  page,
}) => {
  const fixture = await install(page);
  await page.goto("/branch/approvals");
  await expect(
    page.getByRole("region", { name: "Screen access" }),
  ).toContainText("not available for your current persona");
  expect(fixture.data.role).toBe("customer");
  expect(fixture.writes).toEqual([]);
  await choosePersona(page, "officer");
  await openWorkspace(page, "cash");
  await expect(page).toHaveURL(/\/branch\/cash$/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Cash & salary", exact: true }),
  ).toBeVisible();
  await choosePersona(page, "customer");
  await page.goBack();
  await expect(
    page.getByRole("region", { name: "Screen access" }),
  ).toBeVisible();
  expect(fixture.writes).toEqual(["/api/session/role", "/api/session/role"]);
});

test("requested deep link survives saved-customer entry", async ({ page }) => {
  const fixture = await install(page, false);
  await page.goto("/statements");
  await page.getByRole("button", { name: "Explore existing customer" }).click();
  await page.getByRole("button", { name: /Mira Krishnan/ }).click();
  await expect(page).toHaveURL(/\/statements$/);
  await expect(
    page.getByRole("heading", { name: "Statements", exact: true }),
  ).toBeVisible();
  expect(fixture.writes).toEqual(["/api/customer-selection"]);
});

for (const group of [
  {
    nav: "Card workspace view",
    routes: [
      ["/cards/controls", "Card controls"],
      ["/cards/replacements", "Replacement requests"],
    ],
  },
  {
    nav: "Service centre views",
    routes: [
      ["/customer-service/directory", "Raise a new request"],
      ["/customer-service/requests", "Check your service requests"],
      ["/customer-service/deliveries", "Check your deliverables"],
    ],
  },
  ...["wealth-planning", "planning"].map((base) => ({
    nav: "Planning sections",
    routes: Object.entries(planningSections).map(([label, slug]) => [
      `/${base}/${slug}`,
      label,
    ]),
  })),
])
  test(`${group.nav} ${group.routes[0]?.[0]} deep links, reload and history restore nested sections`, async ({
    page,
  }) => {
    const fixture = await install(page);
    for (const [path, label] of group.routes) {
      if (!path || !label) throw Error("Incomplete route fixture");
      await page.goto(path);
      const nav = page.getByRole("navigation", {
        name: group.nav,
        exact: true,
      });
      await expect(
        nav.getByRole("link", {
          name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
        }),
      ).toHaveAttribute("aria-current", "page");
      await page.reload();
      await expect(nav.locator(`a[href="${path}"]`)).toHaveAttribute(
        "aria-current",
        "page",
      );
    }
    const first = group.routes[0]?.[0],
      last = group.routes.at(-1)?.[0];
    if (!first || !last) throw Error("Missing section path");
    const nav = page.getByRole("navigation", { name: group.nav, exact: true });
    await nav.locator(`a[href="${first}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${first}$`));
    await page.goBack();
    await expect(nav.locator(`a[href="${last}"]`)).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.goForward();
    await expect(nav.locator(`a[href="${first}"]`)).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(fixture.writes).toEqual([]);
  });

test("quick service links retain search intent on direct load and reload", async ({
  page,
}) => {
  const fixture = await install(page);
  for (const [slug, query] of [
    ["debit-card", "replacement debit card"],
    ["chequebook", "chequebook"],
    ["address", "address"],
  ]) {
    await page.goto(`/customer-service/${slug}`);
    await expect(page.getByPlaceholder("Search services")).toHaveValue(
      query ?? "",
    );
    await page.reload();
    await expect(page.getByPlaceholder("Search services")).toHaveValue(
      query ?? "",
    );
  }
  expect(fixture.writes).toEqual([]);
});
