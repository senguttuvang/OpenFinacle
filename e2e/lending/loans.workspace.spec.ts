import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { choosePersona } from "../fixtures/persona";
import { enlargeText } from "../fixtures/text-scale";
import { createHarness } from "./loans.harness";

const harness = createHarness();
test("loan quote review, saved application and independent Core decisions recover uncertainty without another financial instruction", async ({
  page,
}) => {
  test.setTimeout(90000);
  const state = await harness.setup(page, {
    lostSubmit: true,
    uncertainDisburse: true,
  });
  await page.goto("/demo");
  await harness.open(page);
  await expect(
    page.getByRole("heading", { name: "No loan applications yet" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Apply for a personal loan", exact: true })
    .click();
  await harness.fillBudget(page);
  await page.getByLabel("Principal (₹)", { exact: true }).fill("550");
  await page
    .getByRole("button", { name: "Get Core quote", exact: true })
    .click();
  expect(state.quotes).toBe(0);
  await page.getByLabel("Principal (₹)", { exact: true }).fill("12000");
  await page
    .getByRole("button", { name: "Get Core quote", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review loan application", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Edit loan terms", exact: true })
    .click();
  await expect(
    page.getByLabel("Monthly income (₹)", { exact: true }),
  ).toHaveValue("30000");
  await page.getByRole("radio", { name: /^home$/i }).check();
  await page
    .getByRole("button", { name: "Get Core quote", exact: true })
    .click();
  await expect(page.locator(".loan-form")).toContainText("₹13,200.00");
  await page
    .getByRole("button", { name: "Accept & submit application", exact: true })
    .click();
  expect(state.posts).toHaveLength(0);
  await page
    .getByRole("checkbox", { name: /I accept these Core-calculated/ })
    .focus();
  await page.keyboard.press("Space");
  await page
    .getByRole("button", { name: "Accept & submit application", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Check original loan instruction",
      exact: true,
    }),
  ).toBeVisible();
  expect(state.posts).toHaveLength(1);
  await page.reload();
  await harness.open(page);
  await page
    .getByRole("button", { name: "Check saved original status", exact: true })
    .click();
  await expect(page.locator(".loan-detail")).toContainText("Submitted");
  expect(state.posts).toHaveLength(1);
  await expect(
    page.getByRole("button", { name: "Recommend application", exact: true }),
  ).toHaveCount(0);
  await choosePersona(page, "officer");
  await harness.open(page);
  await harness.view(page);
  await harness.decide(page, "recommend");
  await expect(page.locator(".loan-detail")).toContainText("Recommended");
  await choosePersona(page, "approver");
  await harness.open(page);
  await harness.view(page);
  await harness.decide(page, "register");
  await expect(page.locator(".loan-core")).toContainText("#71");
  await harness.decide(page, "approve");
  await expect(page.locator(".loan-detail")).toContainText(
    "Approved · not funded",
  );
  await harness.decide(page, "disburse");
  await expect(
    page.getByRole("heading", {
      name: "Original instruction needs inspection",
    }),
  ).toBeVisible();
  expect(state.financialWrites).toBe(1);
  expect(state.refreshes).toBe(0);
  await page.reload();
  await harness.open(page);
  await page
    .getByRole("button", { name: "Check saved original status", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Inspect original Core outcome", exact: true })
    .click();
  await expect(page.locator(".loan-core")).toContainText("₹13,200.00");
  await expect(page.locator(".loan-core tbody tr")).toHaveCount(12);
  expect(state.financialWrites).toBe(1);
  expect(state.inspections).toBe(1);
  const visual = await page
    .locator(".loan-core thead th")
    .first()
    .evaluate((el) => ({
      foreground: getComputedStyle(el).color,
      background: getComputedStyle(el).backgroundColor,
      headerFont: parseFloat(getComputedStyle(el).fontSize),
      amountFont: parseFloat(
        getComputedStyle(el.closest("table")?.querySelector("td") ?? el)
          .fontSize,
      ),
      rootFont: parseFloat(getComputedStyle(document.documentElement).fontSize),
    }));
  const lum = (color: string) => {
    const rgb = (color.match(/[\d.]+/g) ?? [])
      .slice(0, 3)
      .map(Number)
      .map((n) => {
        const v = n / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const light = lum(visual.foreground),
    background = lum(visual.background);
  const headerContrast =
    (Math.max(light, background) + 0.05) / (Math.min(light, background) + 0.05);
  console.log(
    JSON.stringify({ loan_schedule_visual: { ...visual, headerContrast } }),
  );
  expect(headerContrast).toBeGreaterThanOrEqual(4.5);
  expect(visual.amountFont).toBeGreaterThanOrEqual(visual.rootFont);
  expect(visual.headerFont).toBeGreaterThanOrEqual(visual.rootFont * 0.9);
  await expect
    .poll(() =>
      page.evaluate(() =>
        sessionStorage.getItem("openfinacle:loan-command:synthetic-workspace"),
      ),
    )
    .toBeNull();
  await page.screenshot({
    path: "/tmp/finacle4-loan-active-desktop.png",
    fullPage: true,
  });
  await choosePersona(page, "customer");
  await harness.open(page);
  await harness.view(page);
  await expect(
    page.getByRole("region", { name: "Saved loan statement" }),
  ).toContainText("No statement has been loaded");
  state.statementEnabled = true;
  await page
    .getByRole("button", { name: "Refresh Core observation", exact: true })
    .click();
  await expect(
    page
      .getByRole("table", { name: "Saved Core loan transactions" })
      .locator("tbody tr"),
  ).toHaveCount(1);
  await expect(
    page.getByRole("region", { name: "Saved loan statement" }),
  ).toContainText("Disbursement");
  await expect(
    page.getByRole("link", { name: "Download saved CSV", exact: true }),
  ).toHaveAttribute("href", `/api/loans/statement?id=${state.saved?.loan.id}`);
  expect(state.financialWrites).toBe(1);
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download saved CSV", exact: true })
    .click();
  const downloaded = await downloadEvent;
  expect(downloaded.suggestedFilename()).toBe("openfinacle-loan-71.csv");
  expect(await downloaded.failure()).toBeNull();
  const file = await downloaded.path();
  if (!file) throw new Error("Statement download unavailable");
  const csv = await readFile(file, "utf8");
  expect(csv).toContain('"Disbursement"');
  expect(csv).toContain('"Total repaid","0.00"');
  await page.screenshot({
    path: "/tmp/finacle4-loan-statement-desktop.png",
    fullPage: true,
  });
  await expect(
    page.getByRole("button", { name: "Disburse to savings", exact: true }),
  ).toHaveCount(0);
  state.failRefresh = true;
  await page
    .getByRole("button", { name: "Refresh Core observation", exact: true })
    .click();
  await expect(page.locator(".loan-core")).toContainText(
    "Observation is stale",
  );
  expect(state.financialWrites).toBe(1);
  await expect(
    page.getByRole("region", { name: "Saved loan statement" }),
  ).toContainText("Stale saved statement");
  await expect(
    page
      .getByRole("table", { name: "Saved Core loan transactions" })
      .locator("tbody tr"),
  ).toHaveCount(1);
  await enlargeText(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
  const schedule = page.locator(".loan-core .loan-schedule");
  await schedule.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => schedule.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0);
  const transactions = page.getByRole("region", {
    name: "Loan transactions, scroll horizontally if needed",
    exact: true,
  });
  await transactions.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => transactions.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0);
  await page.screenshot({
    path: "/tmp/finacle4-loan-active-mobile-xl.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "/tmp/finacle4-loan-active-zoom.png",
    fullPage: true,
  });
});

test("an absent original Core receipt never enables resend or local discard after reload", async ({
  page,
}) => {
  const state = await harness.setup(page, {
    initial: "recommended",
    missingRegister: true,
  });
  await page.goto("/demo");
  await harness.open(page);
  await harness.view(page);
  await harness.decide(page, "register");
  await expect(
    page.getByRole("heading", {
      name: "Check original loan instruction",
      exact: true,
    }),
  ).toBeVisible();
  const key = state.posts[0]?.key;
  await page.reload();
  await harness.open(page);
  await page
    .getByRole("button", { name: "Check saved original status", exact: true })
    .click();
  await expect(
    page.locator(".loan-workspace").getByRole("alert"),
  ).toContainText("Absence does not prove");
  await expect(
    page.getByRole("button", { name: "Send same nonfinancial instruction" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Leave local nonfinancial draft" }),
  ).toHaveCount(0);
  expect(state.posts).toHaveLength(1);
  expect(state.financialWrites).toBe(0);
  await expect(
    page.getByRole("region", { name: "Original loan instruction" }),
  ).toContainText(key ?? "missing-key");
});

test("malformed application acknowledgement preserves the original across reload until a complete owned receipt is read", async ({
  page,
}) => {
  const state = await harness.setup(page, { malformedSubmit: true });
  await page.goto("/demo");
  await harness.open(page);
  await harness.begin(page);
  await page
    .getByRole("checkbox", { name: /I accept these Core-calculated/ })
    .check();
  await page
    .getByRole("button", { name: "Accept & submit application", exact: true })
    .click();
  await expect(
    page.locator(".loan-workspace").getByRole("alert"),
  ).toContainText("could not be verified");
  await page.reload();
  await harness.open(page);
  await page
    .getByRole("button", { name: "Check saved original status", exact: true })
    .click();
  await expect(page.locator(".loan-detail")).toContainText("Submitted");
  expect(state.posts).toHaveLength(1);
});

test("unavailable original storage blocks application submission before any POST", async ({
  page,
}) => {
  const state = await harness.setup(page);
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("openfinacle:loan-command:"))
        throw new DOMException(
          "Invented storage failure",
          "QuotaExceededError",
        );
      return set.call(this, key, value);
    };
  });
  await page.goto("/demo");
  await harness.open(page);
  await harness.begin(page);
  await page
    .getByRole("checkbox", { name: /I accept these Core-calculated/ })
    .check();
  await page
    .getByRole("button", { name: "Accept & submit application", exact: true })
    .click();
  await expect(
    page.locator(".loan-workspace").getByRole("alert"),
  ).toContainText("could not be stored");
  expect(state.posts).toHaveLength(0);
  expect(state.financialWrites).toBe(0);
});

test("an in-flight original loan command disables role changes and duplicate confirmation until its saved response arrives", async ({
  page,
}) => {
  let release = () => {};
  const pauseRegister = new Promise<void>((resolve) => {
    release = resolve;
  });
  const state = await harness.setup(page, {
    initial: "recommended",
    pauseRegister,
  });
  try {
    await page.goto("/demo");
    await harness.open(page);
    await harness.view(page);
    await harness.decide(page, "register");
    await expect.poll(() => state.posts.length).toBe(1);
    await expect(
      page.getByRole("combobox", { name: "Demo persona" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", {
        name: "Recording original instruction…",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Leave loan instruction", exact: true }),
    ).toBeDisabled();
    release();
    await expect(page.locator(".loan-core")).toContainText("#71");
    await expect(
      page.getByRole("combobox", { name: "Demo persona" }),
    ).toBeEnabled();
    expect(state.posts).toHaveLength(1);
    expect(state.financialWrites).toBe(0);
  } finally {
    release();
  }
});
