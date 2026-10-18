import { expect, test } from "@playwright/test";

const artifacts = process.env.ESTIMATOR_ARTIFACTS;

test.beforeEach(async ({ page }) => {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin !== "http://127.0.0.1:8810" ||
      url.pathname.startsWith("/api")
    ) {
      throw new Error(
        `Unexpected network boundary: ${url.origin}${url.pathname}`,
      );
    }
    await route.continue();
  });
  await page.goto("/build-estimator-preview");
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
});

test("desktop comparison fits with common scope, both budgets and output", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(
    page.getByRole("heading", { name: "Finacle", exact: true }),
  ).toBeVisible();
  const a = page.getByRole("article", { name: "Team A results" });
  const b = page.getByRole("article", { name: "Team B results" });
  await expect(a).toContainText("₹12,92,308");
  await expect(b).toContainText("US$1,800");
  await expect(b).toContainText("250 person-days");
  const tokenBox = await page
    .getByLabel("Team B planned tokens (millions)")
    .boundingBox();
  expect((tokenBox?.y ?? 900) + (tokenBox?.height ?? 900)).toBeLessThanOrEqual(
    900,
  );
  const insight = page.locator(".est-insight");
  const box = await insight.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.y ?? 900) + (box?.height ?? 900)).toBeLessThanOrEqual(900);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (artifacts)
    await page.screenshot({ path: `${artifacts}/desktop.png`, fullPage: true });
});

test("token allowance updates spend without inventing productivity", async ({
  page,
}) => {
  const b = page.getByRole("article", { name: "Team B results" });
  const delivery = await b.locator("dl").textContent();
  await page.getByRole("button", { name: "Try 100 billion" }).click();
  await expect(page.getByLabel("Team B planned tokens (millions)")).toHaveValue(
    "100000",
  );
  await expect(b).toContainText("US$360,000");
  expect(await b.locator("dl").textContent()).toBe(delivery);
  await page.getByLabel("Team B planned tokens (millions)").fill("0");
  await expect(b).toContainText("Add AI usage");
  await expect(b).toContainText("Not estimable");
  await page.getByLabel("Team B people", { exact: true }).fill("0");
  await expect(b).toContainText("Not estimable");
  await expect(b).toContainText("US$0");
});

test("keyboard scenario selection distinguishes production and pilot", async ({
  page,
}) => {
  const scenario = page.getByRole("combobox", {
    name: "Scenario",
    exact: true,
  });
  await scenario.focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("option", { name: "Prototype reproduction", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("option", { name: "Production-bank program", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(scenario).toBeFocused();
  await expect(
    page.getByRole("article", { name: "Team A results" }),
  ).toContainText("Scope first");
  await expect(
    page.getByRole("article", { name: "Team B results" }),
  ).toContainText("Not estimable");
  await scenario.click();
  await page
    .getByRole("option", { name: "Controlled-pilot foundations", exact: true })
    .click();
  await page
    .getByText("Inspect assumptions, rates & sources", { exact: true })
    .click();
  await page.getByLabel("Team B experts", { exact: true }).fill("0");
  await expect(
    page.getByRole("article", { name: "Team B results" }),
  ).toContainText("Expert capacity required");
});

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "zoom-reflow", width: 720, height: 450 },
]) {
  test(`${viewport.name} reflows with readable results and usable controls`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    if (viewport.name === "zoom-reflow")
      await page.addStyleTag({ content: "html:root { font-size: 225%; }" });
    await expect(
      page.getByRole("heading", { name: "Team B", exact: true }),
    ).toBeVisible();
    const cards = page.getByRole("article", { name: /Team [AB] results/ });
    const boxes = await cards.evaluateAll((nodes) =>
      nodes.map((node) => ({
        top: node.getBoundingClientRect().top,
        bottom: node.getBoundingClientRect().bottom,
        width: node.getBoundingClientRect().width,
      })),
    );
    expect(boxes[1].top).toBeGreaterThanOrEqual(boxes[0].bottom);
    expect(boxes[0].width).toBeGreaterThan(300);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByLabel("Team A people", { exact: true }).fill("8");
    await expect(page.getByLabel("Team A people", { exact: true })).toHaveValue(
      "8",
    );
    if (artifacts)
      await page.screenshot({
        path: `${artifacts}/${viewport.name}.png`,
        fullPage: true,
      });
  });
}
