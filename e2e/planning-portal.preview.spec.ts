import { expect, type Page, test } from "@playwright/test";
import { choosePersona } from "./fixtures/persona";

const start = async (page: Page) => {
  const relationship = `synthetic-preview-${crypto.randomUUID()}`;
  expect(
    (
      await page.request.post("/api/planning-preview/session", {
        data: { relationship, role: "customer" },
      })
    ).status(),
  ).toBe(200);
  // A stale device preference must not select device data inside the authenticated portal.
  await page.addInitScript(() =>
    localStorage.setItem("openfinacle-planning-source", "device"),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Wealth & Planning", exact: true })
    .click();
  return relationship;
};
const setup = async (page: Page) => {
  await page
    .getByRole("button", { name: "Set up this synthetic household" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Household net worth" }),
  ).toBeVisible();
};
const dining = async (page: Page) => {
  await page.getByRole("button", { name: "Cash flow", exact: true }).click();
  await page.getByLabel("Category", { exact: true }).selectOption("Dining");
};

test("existing portal tab saves actual D1 records, preserves banking navigation, and reflows at large mobile text", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const relationship = await start(page);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Wealth & Planning",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Device preview", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Local planning-only demonstration session", {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Household wealth and planning" }),
  ).toContainText(relationship);
  for (const name of [
    "My accounts",
    "Pay & transfer",
    "Statements",
    "Service requests",
    "Cards",
    "Deposits",
    "Loans",
    "My profile",
  ]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await setup(page);
  await dining(page);
  await page.getByLabel("Dining monthly budget INR").fill("456");
  await page.getByRole("button", { name: "Save budget", exact: true }).click();
  await expect(
    page.getByText("Saved on the planning server", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "My accounts", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "My accounts", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Wealth & Planning", exact: true })
    .click();
  await dining(page);
  await expect(page.getByLabel("Dining monthly budget INR")).toHaveValue("456");
  await page.reload();
  await page
    .getByRole("button", { name: "Wealth & Planning", exact: true })
    .click();
  await dining(page);
  await expect(page.getByLabel("Dining monthly budget INR")).toHaveValue("456");
  await page
    .getByRole("button", { name: "Overview", exact: true })
    .last()
    .click();
  await page.screenshot({
    path: testInfo.outputPath("planning-portal-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Extra-large text", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-reading", "large");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("Household", { exact: true }).focus();
  await expect(page.getByLabel("Household", { exact: true })).toBeFocused();
  await page.screenshot({
    path: testInfo.outputPath("planning-portal-mobile-large.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("portal role changes enforce household consent, read-only review and approver exclusion", async ({
  page,
}) => {
  const relationship = await start(page);
  await setup(page);
  await choosePersona(page, "officer");
  await expect(
    page.getByRole("combobox", { name: "Demo persona" }),
  ).toContainText("Bank officer");
  await expect(
    page.getByRole("combobox", { name: "Demo persona" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Wealth & Planning", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Household wealth and planning" })
      .getByRole("alert"),
  ).toContainText("has not consented");
  await choosePersona(page, "customer");
  await expect(
    page.getByRole("combobox", { name: "Demo persona" }),
  ).toContainText("Customer");
  await expect(
    page.getByRole("combobox", { name: "Demo persona" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Wealth & Planning", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Grant read-only planning review" })
    .click();
  await expect(
    page.getByRole("button", { name: "Revoke planning review consent" }),
  ).toBeVisible();
  await choosePersona(page, "officer");
  await expect(
    page.getByRole("combobox", { name: "Demo persona" }),
  ).toContainText("Bank officer");
  await expect(
    page.getByRole("combobox", { name: "Demo persona" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Wealth & Planning", exact: true })
    .click();
  await expect(
    page.getByText("Consented planning review · read only", { exact: false }),
  ).toBeVisible();
  await dining(page);
  await expect(page.getByLabel("Dining monthly budget INR")).toBeDisabled();
  const record = (await (
    await page.request.get(
      `/api/planning?household=synthetic-nila&relationship=${relationship}`,
    )
  ).json()) as { state: unknown };
  expect(
    (
      await page.request.post(
        `/api/planning?household=synthetic-nila&relationship=${relationship}`,
        {
          data: record.state,
          headers: { "Idempotency-Key": crypto.randomUUID() },
        },
      )
    ).status(),
  ).toBe(403);
  await choosePersona(page, "approver");
  await expect(
    page.getByRole("combobox", { name: "Demo persona" }),
  ).toContainText("Approver");
  await expect(
    page.getByRole("combobox", { name: "Demo persona" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Wealth & Planning", exact: true }),
  ).toHaveCount(0);
  expect((await page.request.get("/api/planning/context")).status()).toBe(403);
  await expect(
    page.getByRole("button", { name: "Loans", exact: true }),
  ).toBeVisible();
});

test("switching the portal relationship cannot restore another owner's scenario or retained command", async ({
  page,
}) => {
  const first = await start(page);
  await setup(page);
  await dining(page);
  await page.getByLabel("Dining monthly budget INR").fill("987");
  await page.getByRole("button", { name: "Save budget", exact: true }).click();
  await expect(
    page.getByText("Saved on the planning server", { exact: false }),
  ).toBeVisible();
  const next = `synthetic-preview-${crypto.randomUUID()}`;
  expect(
    (
      await page.request.post("/api/planning-preview/session", {
        data: { relationship: next, role: "customer" },
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await page
    .getByRole("button", { name: "Wealth & Planning", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Set up this synthetic household" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Household net worth" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Household wealth and planning" }),
  ).toContainText(next);
  expect(
    (
      await page.request.get(
        `/api/planning?household=synthetic-nila&relationship=${first}`,
      )
    ).status(),
  ).toBe(409);
});
