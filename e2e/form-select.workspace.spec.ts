import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { chooseOption } from "./fixtures/form-select";
import { savedWorkspace } from "./fixtures/workspace";

test.use({ actionTimeout: 10000 });
test.setTimeout(60000);
let script: string;
let styles: string;
test.beforeAll(async ({ browserName }, info) => {
  expect(browserName).toBe("chromium");
  const output = info.outputPath("bundle");
  execFileSync("bun", [
    "build",
    "e2e/fixtures/form-select-harness.tsx",
    "--target=browser",
    "--outdir",
    output,
  ]);
  script = readFileSync(`${output}/form-select-harness.js`, "utf8");
  styles = readFileSync(`${output}/form-select-harness.css`, "utf8");
});
test.beforeEach(async ({ page }) => {
  await page.route("**/__form-select-fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="fixture"></div></body></html>',
    }),
  );
  await page.goto("/__form-select-fixture");
  await page.addStyleTag({ content: styles });
  await page.addScriptTag({ content: script, type: "module" });
});

test("required validation focuses its named trigger, submits its value, and restores focus after busy", async ({
  page,
}) => {
  const trigger = page.getByRole("combobox", {
    name: "Delivery preference",
    exact: true,
  });
  await expect(trigger).toHaveAttribute("aria-describedby", "fixture-help");
  await page.getByRole("button", { name: "Submit fixture" }).click();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert")).toHaveText("Choose an option.");
  await expect(page.getByLabel("Submitted fields")).toBeEmpty();
  await trigger.press("Enter");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("c");
  await expect(
    page.getByRole("option", { name: "Collect at branch", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveText("Collect at branch");
  await expect(trigger).toBeEnabled();
  await expect(trigger).toBeFocused();
  await expect(trigger).not.toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "Submit fixture" }).click();
  await expect(page.getByLabel("Submitted fields")).toHaveText(
    '{"delivery":"branch"}',
  );
  await trigger.click();
  await expect(
    page.getByRole("option", { name: "Unavailable sample delivery" }),
  ).toBeDisabled();
  await page.keyboard.press("End");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveText("Collect at branch");
});

test("multiple required fields focus the first invalid choice in form order", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Require backup choice" }).click();
  await page.getByRole("button", { name: "Submit fixture" }).click();
  const delivery = page.getByRole("combobox", {
    name: "Delivery preference",
    exact: true,
  });
  await expect(delivery).toBeFocused();
  await chooseOption(page, delivery, "branch");
  await expect(delivery).toBeEnabled();
  await page.getByRole("button", { name: "Submit fixture" }).click();
  await expect(
    page.getByRole("combobox", { name: "Backup delivery", exact: true }),
  ).toBeFocused();
  await expect(page.getByLabel("Submitted fields")).toBeEmpty();
});

test("disabled fieldsets close portalled choices and omit values; optional filters clear to All", async ({
  page,
}) => {
  const trigger = page.getByRole("combobox", {
    name: "Delivery preference",
    exact: true,
  });
  await chooseOption(page, trigger, "branch");
  await expect(trigger).toBeEnabled();
  await trigger.click();
  await page.locator("#fixture-choice").evaluate((button) => {
    const fieldset = button.closest("fieldset");
    if (!fieldset) throw new Error("Missing fieldset");
    fieldset.disabled = true;
  });
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(trigger).toBeDisabled();
  await page.getByRole("button", { name: "Submit fixture" }).click();
  await expect(page.getByLabel("Submitted fields")).toHaveText("{}");
  await trigger.evaluate((button) => {
    const fieldset = button.closest("fieldset");
    if (!fieldset) throw new Error("Missing fieldset");
    fieldset.disabled = false;
  });
  await expect(trigger).toBeEnabled();
  await expect(trigger).toHaveText("Collect at branch");
  const filter = page.getByRole("combobox", {
    name: "Account filter",
    exact: true,
  });
  await chooseOption(page, filter, "61");
  await expect(filter).toHaveText("Synthetic account 61");
  await chooseOption(page, filter, "");
  await expect(filter).toHaveText("All accounts");
  await expect(filter).toHaveAttribute("data-value", "");
  await filter.click();
  const all = page.getByRole("option", { name: "All accounts", exact: true });
  await expect(all).toHaveAttribute("aria-selected", "true");
  await expect(all.locator("svg")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await chooseOption(page, trigger, "");
  await expect(trigger).toBeEnabled();
  await page.getByRole("button", { name: "Submit fixture" }).click();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-invalid", "true");
});

for (const variant of ["desktop", "mobile390", "large22", "zoom200"] as const) {
  test(`Persona-style panel reflows and scrolls at ${variant}`, async ({
    page,
  }, info) => {
    if (variant === "mobile390")
      await page.setViewportSize({ width: 390, height: 844 });
    if (variant === "large22")
      await page.evaluate(() => {
        document.documentElement.dataset.reading = "large";
      });
    // At 200% browser zoom a 1440px desktop lays out in a 720 CSS-pixel viewport.
    if (variant === "zoom200")
      await page.setViewportSize({ width: 720, height: 500 });
    const trigger = page.getByRole("combobox", {
      name: "Delivery preference",
      exact: true,
    });
    await chooseOption(page, trigger, "address");
    await expect(trigger).toBeEnabled();
    await trigger.click();
    const panel = page.getByRole("listbox");
    const selected = page.getByRole("option", {
      name: /Deliver to the confirmed/,
    });
    await expect(selected).toHaveAttribute("aria-selected", "true");
    await expect(selected.locator("svg")).toHaveCount(1);
    await expect(panel).toHaveCSS("background-color", "rgb(255, 255, 255)");
    const geometry = await panel.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        bottom: box.bottom,
        viewport: innerWidth,
        height: innerHeight,
        scroll: document.documentElement.scrollWidth,
        font: getComputedStyle(document.documentElement).fontSize,
      };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.height);
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.viewport);
    if (variant === "large22") expect(geometry.font).toBe("22px");
    await page.screenshot({
      path: info.outputPath(`form-select-${variant}.png`),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    const filter = page.getByRole("combobox", {
      name: "Account filter",
      exact: true,
    });
    await filter.press("Enter");
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("End");
    await expect(
      page.getByRole("option", { name: "Synthetic account 61", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(filter).toHaveText("Synthetic account 61");
    await expect(filter).toBeFocused();
  });
}

for (const fontSize of [18, 22, 36]) {
  test(`selected and unselected long recipient names and last4 fit at390/${fontSize}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = `${size}px`;
    }, fontSize);
    const trigger = page.getByRole("combobox", {
      name: "Saved recipient",
      exact: true,
    });
    for (const selected of ["payee-0", "payee-14"]) {
      await chooseOption(page, trigger, selected);
      await trigger.click();
      const options = page.getByRole("option");
      await expect(options).toHaveCount(15);
      const geometry = await options.evaluateAll((rows) =>
        rows.map((row) => {
          const text = row.querySelector("span");
          if (!text) throw new Error("Missing option text");
          const range = document.createRange();
          range.selectNodeContents(text);
          const box = row.getBoundingClientRect();
          return {
            value: row.getAttribute("data-value"),
            selected: row.getAttribute("data-state") === "checked",
            childCount: row.children.length,
            textShrink: getComputedStyle(text).flexShrink,
            client: row.clientWidth,
            scroll: row.scrollWidth,
            textContained: Array.from(range.getClientRects()).every(
              (rect) => rect.left >= box.left && rect.right <= box.right,
            ),
            label: row.textContent,
          };
        }),
      );
      console.log(
        JSON.stringify({
          recipientOptions: geometry.length,
          fontSize,
          selected,
          overflow: geometry.filter(
            (row) => row.scroll > row.client || !row.textContained,
          ),
        }),
      );
      expect(geometry.filter((row) => row.selected)).toHaveLength(1);
      expect(geometry.filter((row) => !row.selected)).toHaveLength(14);
      expect(
        geometry.filter((row) => row.scroll > row.client || !row.textContained),
      ).toEqual([]);
      for (const [index, row] of geometry.entries())
        expect(row.label).toContain(String(4000 + index));
      await page
        .getByRole("option")
        .filter({
          hasText: selected === "payee-0" ? "ending 4000" : "ending 4014",
        })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath(`recipient390-${fontSize}-${selected}.png`),
      });
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      const triggerGeometry = await trigger.evaluate((node) => ({
        client: node.clientWidth,
        scroll: node.scrollWidth,
      }));
      expect(triggerGeometry.scroll).toBeLessThanOrEqual(
        triggerGeometry.client,
      );
    }
  });
}

test("actual banking and planning panels match Demo persona at desktop and mobile large text", async ({
  page,
}, info) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({ json: savedWorkspace() }),
  );
  await page.goto("/");
  await page
    .getByRole("combobox", { name: "Demo persona", exact: true })
    .press("Enter");
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(page.locator(".persona-option[data-highlighted]")).toHaveCSS(
    "background-color",
    "rgb(36, 88, 211)",
  );
  await page.screenshot({
    path: info.outputPath("actual-demo-persona.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await page.goto("/planning");
  const household = page.getByRole("combobox", {
    name: "Household",
    exact: true,
  });
  for (const mode of ["desktop", "mobile390-large22"] as const) {
    if (mode === "mobile390-large22") {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("button", { name: "Extra-large text" }).click();
    }
    await household.press("Enter");
    await expect(
      page.locator(".form-select-option[data-highlighted]"),
    ).toBeVisible();
    await page.keyboard.press("ArrowUp");
    const highlighted = page.locator(".form-select-option[data-highlighted]");
    await expect(highlighted).toHaveCSS("background-color", "rgb(36, 88, 211)");
    await expect(
      page.locator(".form-select-option[data-state=checked]"),
    ).toHaveCSS("background-color", "rgb(232, 239, 255)");
    await expect(
      page.locator(".form-select-option[data-state=checked] svg"),
    ).toHaveCount(1);
    await page.screenshot({
      path: info.outputPath(`actual-planning-${mode}.png`),
      fullPage: false,
    });
    await page.keyboard.press("Escape");
    await expect(household).toBeFocused();
  }
});
