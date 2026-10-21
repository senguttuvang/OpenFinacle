import { expect, test } from "@playwright/test";
import { planningHouseholds } from "../../src/demo/households/planning-fixtures";
import { initialPlanningState } from "../../src/platform/household-planning/domain/planning-state";
import { chooseOption } from "../fixtures/form-select";
import { openWorkspace } from "../fixtures/navigation";
import { createHarness } from "./customer-banking.harness";

const harness = createHarness();
test("explicit picker, reviewed transfer, switch and reload show each customer's own statement", async ({
  page,
}) => {
  const fixture = await harness.installCustomers(page);
  await page.goto("/demo");
  await page.getByRole("button", { name: "Explore existing customer" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose an existing customer" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Mira Krishnan.*SYN-001/ }),
  ).toBeVisible();
  expect(fixture.posts()).toBe(0);
  await page
    .getByLabel("Search name, reference or account suffix")
    .fill("0001");
  await page.getByRole("button", { name: /Mira Krishnan.*SYN-001/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".person strong")).toHaveText("Mira Krishnan");
  await openWorkspace(page, "transfer");
  await expect(page.locator(".customer-legacy-transfer")).toHaveCount(0);
  await page.getByRole("combobox", { name: "Recipient", exact: true }).click();
  await page.getByRole("option", { name: "Aadhya Iyer · ending 0200" }).click();
  await page.getByLabel("Amount in INR").fill("1234.56");
  await page
    .getByRole("button", { name: "Review transfer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review your transfer" }),
  ).toBeVisible();
  expect(fixture.posts()).toBe(0);
  await page.getByRole("button", { name: "Confirm transfer once" }).click();
  await expect(
    page.getByRole("heading", { name: "Transfer completed" }),
  ).toBeVisible();
  await expect(
    page.getByText("Sender debit 501 · Recipient credit 502"),
  ).toBeVisible();
  expect(fixture.posts()).toBe(1);
  await page
    .getByRole("button", { name: "Switch customer", exact: true })
    .click();
  await page
    .getByLabel("Search name, reference or account suffix")
    .fill("Aadhya");
  await page.getByRole("button", { name: /Aadhya Iyer.*SYN-002/ }).click();
  await expect(page.locator(".person strong")).toHaveText("Aadhya Iyer");
  await openWorkspace(page, "statements");
  await expect(
    page.getByRole("cell", { name: "Deposit", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".person strong")).toHaveText("Aadhya Iyer");
  await page
    .getByRole("button", { name: "Switch customer", exact: true })
    .click();
  await page.getByRole("button", { name: /Mira Krishnan.*SYN-001/ }).click();
  await openWorkspace(page, "statements");
  await expect(
    page.getByRole("cell", { name: "Withdrawal", exact: true }),
  ).toBeVisible();
  expect(fixture.posts()).toBe(1);
  await page.screenshot({
    path: "test-results/customer-statement-desktop.png",
    fullPage: true,
  });
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 720, height: 900 },
])
  test(`customer picker reflows at${viewport.width}px with200percent text`, async ({
    page,
  }) => {
    await harness.installCustomers(page);
    await page.setViewportSize(viewport);
    await page.goto("/demo");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await page
      .getByRole("button", { name: "Explore existing customer" })
      .click();
    const picker = page.getByRole("region", {
      name: "Choose an existing customer",
    });
    await expect(picker).toBeVisible();
    await page
      .getByLabel("Search name, reference or account suffix")
      .fill("Aadhya");
    await expect(
      page.getByRole("button", { name: /Aadhya Iyer.*SYN-002/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/customer-picker-${viewport.width}.png`,
      fullPage: true,
    });
  });

test("standalone shared planning binds its verified registered customer before saving", async ({
  page,
}) => {
  const relationship = "sample-branch-002";
  let state = initialPlanningState(planningHouseholds()[1]);
  let writes = 0;
  await page.addInitScript(() =>
    localStorage.setItem("openfinacle-planning-source", "shared"),
  );
  await page.route("**/api/**", (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (path === "/api/planning/context")
      return route.fulfill({
        json: { relationship, role: "customer", readOnly: false },
      });
    if (path === "/api/planning" && request.method() === "GET")
      return route.fulfill({
        json: { state, relationship, readOnly: false, history: [] },
      });
    if (path === "/api/planning" && request.method() === "POST") {
      expect(request.headers()["x-customer-scope"]).toBe(relationship);
      writes++;
      state = { ...request.postDataJSON(), version: state.version + 1 };
      return route.fulfill({
        json: {
          state,
          relationship,
          confirmedKey: request.headers()["idempotency-key"],
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/planning");
  await expect(
    page.getByRole("heading", { name: "Household net worth" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Cash flow", exact: true }).click();
  await chooseOption(
    page,
    page.getByLabel("Category", { exact: true }),
    "Dining",
  );
  await page.getByLabel("Dining monthly budget INR").fill("123");
  await page.getByRole("button", { name: "Save budget", exact: true }).click();
  await expect(
    page.getByText("Saved on the planning server", { exact: false }),
  ).toBeVisible();
  expect(writes).toBe(1);
  await page.reload();
  await page.getByRole("link", { name: "Cash flow", exact: true }).click();
  await chooseOption(
    page,
    page.getByLabel("Category", { exact: true }),
    "Dining",
  );
  await expect(page.getByLabel("Dining monthly budget INR")).toHaveValue("123");
});

test("in-flight confirmation explains verification without prematurely requesting inspection", async ({
  page,
}) => {
  const fixture = await harness.installCustomers(page);
  await harness.prepareTransfer(page);
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/customer-transfers/confirm", async (route) => {
    await held;
    await route.fallback();
  });
  try {
    await page.getByRole("button", { name: "Confirm transfer once" }).click();
    await expect(
      page.getByText(
        "Sending your transfer once and verifying both accounts…",
        {
          exact: true,
        },
      ),
    ).toBeVisible();
    await expect(
      page.getByText(/The original outcome needs inspection/),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Inspect original transfer" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Confirm transfer once" }),
    ).toHaveCount(0);
    expect(fixture.posts()).toBe(0);
    expect(
      await page.evaluate(() =>
        sessionStorage.getItem(
          "openfinacle:customer-transfer:synthetic-workspace",
        ),
      ),
    ).not.toBeNull();
  } finally {
    release();
  }
  await expect(
    page.getByRole("heading", { name: "Transfer completed" }),
  ).toBeVisible();
  expect(fixture.posts()).toBe(1);
});

for (const mode of ["funds", "null", "malformed"] as const)
  test(`${mode} review failure explains that no transfer was sent and never creates an original command`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const fixture = await harness.installCustomers(page, {
      reviewFailure: mode,
    });
    await harness.prepareTransfer(page);
    const alert = page.locator(".customer-transfer").getByRole("alert");
    await expect(alert).toContainText("No transfer was sent.");
    if (mode === "funds")
      await expect(alert).toContainText("current available funds");
    if (mode === "null")
      await expect(alert).toContainText("The request could not be completed.");
    await expect(
      page.getByRole("button", {
        name: "Inspect original transfer",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Confirm transfer once", exact: true }),
    ).toHaveCount(0);
    expect(fixture.posts()).toBe(0);
    expect(
      await page.evaluate(
        () =>
          Object.keys(sessionStorage).filter((key) =>
            key.startsWith("openfinacle:customer-transfer:"),
          ).length,
      ),
    ).toBe(0);
    expect(errors).toEqual([]);
  });

for (const mode of ["lost", "malformed"] as const)
  test(`${mode} transfer acknowledgement retains original across reload even with empty history`, async ({
    page,
  }) => {
    const fixture = await harness.installCustomers(page, {
      lostResponse: mode === "lost",
      malformedResponse: mode === "malformed",
    });
    await harness.prepareTransfer(page);
    await page.getByRole("button", { name: "Confirm transfer once" }).click();
    await expect(
      page.locator(".customer-transfer").getByRole("alert"),
    ).toBeVisible();
    expect(fixture.posts()).toBe(1);
    const stored = await page.evaluate(() =>
      sessionStorage.getItem(
        "openfinacle:customer-transfer:synthetic-workspace",
      ),
    );
    expect(stored).not.toBeNull();
    await expect(page).toHaveURL(/\/payments\/transfer$/);
    await openWorkspace(page, "statements");
    await expect(page).toHaveURL(/\/statements$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/payments\/transfer$/);
    await expect(
      page.getByRole("button", { name: "Inspect original transfer" }),
    ).toBeVisible();
    expect(fixture.posts()).toBe(1);
    await page.reload();
    await openWorkspace(page, "transfer");
    await expect(
      page.getByRole("heading", { name: "Review your transfer" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Confirm transfer once" }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Inspect original transfer" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Transfer completed" }),
    ).toBeVisible();
    expect(fixture.posts()).toBe(1);
    expect(
      await page.evaluate(() =>
        sessionStorage.getItem(
          "openfinacle:customer-transfer:synthetic-workspace",
        ),
      ),
    ).toBeNull();
  });

test("transfer storage failure or unavailable original history prevents dispatch", async ({
  page,
}) => {
  const fixture = await harness.installCustomers(page);
  await page.addInitScript(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("openfinacle:customer-transfer:"))
        throw new DOMException("Storage unavailable", "SecurityError");
      return write.call(this, key, value);
    };
  });
  await harness.prepareTransfer(page);
  await page.getByRole("button", { name: "Confirm transfer once" }).click();
  await expect(
    page.locator(".customer-transfer").getByRole("alert"),
  ).toContainText("storage is unavailable");
  expect(fixture.posts()).toBe(0);
});

test("history read failure blocks a fresh transfer rather than hiding an unresolved original", async ({
  page,
}) => {
  const fixture = await harness.installCustomers(page, {
    historyFailure: true,
  });
  await page.goto("/demo");
  await page.getByRole("button", { name: "Explore existing customer" }).click();
  await page.getByRole("button", { name: /Mira Krishnan.*SYN-001/ }).click();
  await openWorkspace(page, "transfer");
  await expect(
    page.locator(".customer-transfer").getByRole("alert"),
  ).toContainText("original transfer");
  await expect(
    page.getByRole("button", { name: "Review transfer", exact: true }),
  ).toHaveCount(0);
  expect(fixture.posts()).toBe(0);
});
