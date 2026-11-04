import { expect, test } from "@playwright/test";
import { savedWorkspace } from "../fixtures/workspace";

for (const width of [1440, 390])
  test(`statement distinguishes unavailable native running balances from explicit zero at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    const data = savedWorkspace();
    const transaction = {
      date: [2026, 11, 4],
      amount: 1,
      transactionType: { value: "Deposit", deposit: true },
    };
    const transactions = [
      { ...transaction, id: 11 },
      { ...transaction, id: 12, runningBalance: 0 },
      { ...transaction, id: 13, runningBalance: -25.5 },
      { ...transaction, id: 14, runningBalance: 125.25 },
      { ...transaction, id: 15, runningBalance: null },
    ];
    const writes: string[] = [];
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() !== "GET") writes.push(path);
      if (path === "/api/dashboard")
        return route.fulfill({
          json: { ...data, account: { ...data.account, transactions } },
        });
      return route.fulfill({ json: {} });
    });
    await page.goto("/statements");
    const statement = page.locator("section").filter({
      has: page.getByRole("heading", {
        name: "Everyday Savings statement",
        exact: true,
      }),
    });
    const balance = (id: number) =>
      statement
        .locator("tbody tr")
        .filter({
          has: page.getByRole("cell", { name: `#${id}`, exact: true }),
        })
        .locator("td")
        .nth(4);
    await expect(balance(11)).toHaveText("Unavailable");
    await expect(balance(12)).toHaveText("₹0.00");
    await expect(balance(13)).toHaveText("-₹25.50");
    await expect(balance(14)).toHaveText("₹125.25");
    await expect(balance(15)).toHaveText("Unavailable");
    await expect(
      statement.getByRole("columnheader", {
        name: "Native running balance",
        exact: true,
      }),
    ).toBeVisible();

    await expect(
      statement.getByRole("link", { name: "Download CSV", exact: true }),
    ).toHaveAttribute("href", "/api/statement");
    const search = statement.getByRole("textbox", {
      name: "Search transactions",
      exact: true,
    });
    await search.focus();
    await page.keyboard.type("11");
    await expect(statement.locator("tbody tr")).toHaveCount(1);
    await expect(balance(11)).toHaveText("Unavailable");
    expect(writes).toEqual([]);
  });
