import { expect, test } from "@playwright/test";
import { chooseOption } from "../fixtures/form-select";
import { openWorkspace } from "../fixtures/navigation";
import { createHarness } from "./customer-banking.harness";

const harness = createHarness();
test("empty future customer adds a known account by holder name, reviews it and removes saved payee without enumerating the directory", async ({
  page,
}) => {
  const fixture = await harness.installCustomers(page, { emptyPayees: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore existing customer" }).click();
  await page.getByRole("button", { name: /Mira Krishnan.*SYN-001/ }).click();
  await openWorkspace(page, "transfer");
  await expect(
    page.getByRole("combobox", { name: "Recipient", exact: true }),
  ).toBeDisabled();
  await page.getByText("Manage saved payees (0)", { exact: true }).click();
  await expect(
    page.getByText("No saved payees yet.", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("Account holder name", { exact: true })
    .fill("Wrong holder");
  await page
    .locator(".customer-payees")
    .getByLabel("Account number", { exact: true })
    .fill("SYN-0200");
  await page.getByRole("button", { name: "Review payee", exact: true }).click();
  await expect(
    page.locator(".customer-payees").getByRole("alert"),
  ).toContainText("Check the account number and holder name");
  await page
    .getByLabel("Account holder name", { exact: true })
    .fill("Aadhya Iyer");
  await page.getByRole("button", { name: "Review payee", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Check payee details" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Check payee details" }),
  ).toBeFocused();
  await expect(
    page.getByRole("combobox", { name: "Recipient", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Confirm saved payee", exact: true })
    .click();
  await openWorkspace(page, "overview");
  await expect(
    page.getByRole("region", { name: "Saved payee summary" }),
  ).toContainText("Aadhya Iyer");
  expect(fixture.financialRefreshes()).toBe(0);
  await openWorkspace(page, "transfer");
  await page.getByText("Manage saved payees (1)", { exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Recipient", exact: true }),
  ).toBeEnabled();
  await page.getByRole("combobox", { name: "Recipient", exact: true }).focus();
  await page
    .getByRole("combobox", { name: "Recipient", exact: true })
    .press("ArrowDown");
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("listbox").getByRole("option")).toHaveText(
    "Aadhya Iyer · ending 0200",
  );
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("combobox", { name: "Recipient", exact: true }),
  ).toContainText("Aadhya Iyer");
  await page
    .getByRole("button", { name: "Remove Aadhya Iyer", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Recipient", exact: true }),
  ).toBeDisabled();
  expect(fixture.posts()).toBe(0);
  await openWorkspace(page, "overview");
  await expect(
    page.getByRole("region", { name: "Saved payee summary" }),
  ).toContainText("No saved payees yet");
  expect(fixture.financialRefreshes()).toBe(0);
});

test("definitive stale payee rejection clears only proven terminal original and permits a fresh reviewed instruction", async ({
  page,
}) => {
  const fixture = await harness.installCustomers(page, { stalePayee: true });
  await harness.prepareTransfer(page);
  await page.getByRole("button", { name: "Confirm transfer once" }).click();
  await expect(
    page.getByText("The saved payee changed. Review the transfer again.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(fixture.posts()).toBe(0);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem(
        "openfinacle:customer-transfer:synthetic-workspace",
      ),
    ),
  ).toBeNull();
  await page.getByRole("button", { name: "Inspect original transfer" }).click();
  expect(fixture.posts()).toBe(0);
  await page.getByRole("button", { name: "Start another transfer" }).click();
  await page.getByRole("combobox", { name: "Recipient", exact: true }).click();
  await page.getByRole("option", { name: "Aadhya Iyer · ending 0200" }).click();
  await page.getByLabel("Amount in INR").fill("1.23");
  await page
    .getByRole("button", { name: "Review transfer", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm transfer once" }).click();
  await expect(
    page.getByRole("heading", { name: "Transfer completed" }),
  ).toBeVisible();
  expect(fixture.posts()).toBe(1);
});

for (const width of [390, 720])
  test(`saved payee dropdown reflows at ${width}px and 200percent text with fifteen choices`, async ({
    page,
  }) => {
    await harness.installCustomers(page, { payeeCount: 15 });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await page
      .getByRole("button", { name: "Explore existing customer" })
      .click();
    await page.getByRole("button", { name: /Mira Krishnan.*SYN-001/ }).click();
    await openWorkspace(page, "transfer");
    for (const selected of [null, "sample-aadhya", "registered-14"]) {
      const trigger = page.getByRole("combobox", {
        name: "Recipient",
        exact: true,
      });
      if (selected) await chooseOption(page, trigger, selected);
      await trigger.press("ArrowDown");
      await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(
        15,
      );
      await expect(
        page.locator('.form-select-option[data-state="checked"]'),
      ).toHaveCount(selected ? 1 : 0);
      expect(
        await page
          .getByRole("listbox")
          .getByRole("option")
          .evaluateAll((items) =>
            items
              .filter((item) => {
                const text = item.querySelector("span");
                if (!text) return true;
                const range = document.createRange();
                range.selectNodeContents(text);
                const box = item.getBoundingClientRect();
                return (
                  item.scrollWidth > item.clientWidth + 1 ||
                  Array.from(range.getClientRects()).some(
                    (rect) => rect.left < box.left || rect.right > box.right,
                  )
                );
              })
              .map((item) => ({
                name: item.textContent,
                width: item.clientWidth,
                scrollWidth: item.scrollWidth,
              })),
          ),
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBe(true);
      await expect(page.locator("#registered-recipient")).toHaveAttribute(
        "data-state",
        "open",
      );
      await page.screenshot({
        path: `test-results/saved-payees-${width}-200percent-${selected ?? "unselected"}.png`,
        fullPage: false,
      });
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("combobox", { name: "Recipient", exact: true }),
      ).toBeFocused();
    }
    await page.getByText("Manage saved payees (15)", { exact: true }).click();
    const list = page.getByRole("list", { name: "Saved payees", exact: true });
    await expect(list.getByRole("listitem")).toHaveCount(15);
    await expect(list.getByRole("button", { name: /^Remove / })).toHaveCount(
      15,
    );
    expect(
      await list
        .getByRole("listitem")
        .evaluateAll((items) =>
          items.every((item) => item.scrollWidth <= item.clientWidth + 1),
        ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await list.getByRole("listitem").first().scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/saved-payee-manager-${width}-200percent.png`,
      fullPage: false,
    });
  });

for (const empty of [false, true])
  test(`registered overview uses ${empty ? "empty add-payee CTA" : "actual saved payee summary"} without a legacy placeholder`, async ({
    page,
  }) => {
    await harness.installCustomers(page, { emptyPayees: empty });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Explore existing customer" })
      .click();
    await page.getByRole("button", { name: /Mira Krishnan.*SYN-001/ }).click();
    const summary = page.getByRole("region", { name: "Saved payee summary" });
    await expect(summary).toBeVisible();
    await expect(summary).not.toContainText("Arjun");
    if (empty) {
      await expect(
        summary.getByText("No saved payees yet", { exact: true }),
      ).toBeVisible();
      await expect(
        summary.getByRole("button", { name: "Add a payee", exact: true }),
      ).toBeVisible();
    } else {
      await expect(summary).toContainText("Aadhya Iyer");
      await expect(summary).toContainText(
        "Account ending 0200 · 1 saved payee",
      );
    }
  });
