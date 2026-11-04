import { expect, test } from "@playwright/test";
import { branchDayFixture } from "../../../src/demo/branch/branch-day-fixture";
import { savedWorkspace } from "../../fixtures/workspace";

for (const width of [1440, 390])
  test(`Customer360 preserves exact foreign precision and withholds invalid INR source at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    const day = branchDayFixture();
    day.reviewFixture = false;
    const r = day.relationships[0];
    const savings = {
      id: r.customer.account_id,
      accountNo: r.customer.account_no,
      status: { id: 300, value: "Active" },
      currency: { code: "INR", decimalPlaces: 2 },
      accountBalance: 12.34,
      availableBalance: 0,
    };
    const body = {
      observedAt: day.observedAt,
      client: {
        id: r.customer.client_id,
        accountNo: "SYNTHETIC-CLIENT",
        displayName: r.customer.display_name,
        status: { id: 300, value: "Active" },
        officeId: 1,
      },
      portfolio: {
        savingsAccounts: [savings],
        loanAccounts: [
          {
            id: 55,
            accountNo: "SYNTHETIC-KWD",
            status: { id: 300, value: "Active" },
            currency: { code: "KWD", decimalPlaces: 3 },
            loanBalance: 1.001,
          },
        ],
      },
      selectedSavings: savings,
      coreDocuments: [],
      charges: [
        {
          id: 1,
          name: "Synthetic monetary fee",
          currency: { code: "INR", decimalPlaces: 2 },
          amount: 12.5,
          amountPaid: 0,
          amountOutstanding: 0,
          percentage: 1.001,
          amountOrPercentage: 1.001,
        },
      ],
      applicationDocuments: [],
      profile: null,
      nominee: null,
      errors: [] as { source: string; message: string }[],
    };
    let response: unknown = body;
    const data = savedWorkspace();
    data.role = "officer";
    const writes: string[] = [];
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() !== "GET") writes.push(path);
      return route.fulfill({
        json:
          path === "/api/dashboard"
            ? data
            : path === "/api/branch"
              ? day
              : path === "/api/branch/relationship"
                ? response
                : {},
      });
    });
    await page.goto("/overview");
    const workspace = page.locator(".branch-day");
    await workspace
      .getByRole("navigation", { name: "Branch day screens" })
      .getByRole("button", { name: "Account", exact: true })
      .click();
    await expect(
      workspace.getByText("1.001 KWD", { exact: true }),
    ).toBeVisible();
    await expect(workspace.getByText("₹12.50", { exact: true })).toBeVisible();
    await expect(workspace.locator(".account-facts strong")).toHaveText(
      "₹0.00",
    );
    if (width === 390) {
      const cell = workspace.getByText("1.001 KWD", { exact: true });
      const before = await cell.evaluate((el) =>
        parseFloat(getComputedStyle(el).fontSize),
      );
      await page.evaluate(() => {
        const root = document.documentElement;
        root.style.fontSize = `${parseFloat(getComputedStyle(root).fontSize) * 2}px`;
      });
      const after = await cell.evaluate((el) =>
        parseFloat(getComputedStyle(el).fontSize),
      );
      expect(after).toBeCloseTo(before * 2, 1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
    }
    const refresh = workspace.getByRole("button", {
      name: "Refresh customer 360",
      exact: true,
    });
    body.charges[0].amount = 1.001;
    await refresh.focus();
    await page.keyboard.press("Enter");
    await expect(workspace.getByRole("alert")).toContainText(
      "Customer enquiry could not be read or verified",
    );
    await expect(workspace.getByText("₹12.50", { exact: true })).toHaveCount(0);
    await expect(workspace.getByText("1.001 KWD", { exact: true })).toHaveCount(
      0,
    );
    await expect(workspace.locator(".account-facts strong")).toHaveText(
      "Unavailable",
    );
    body.charges[0].amount = 12.5;
    response = {
      ...body,
      portfolio: null,
      selectedSavings: null,
      errors: [
        {
          source: "Core portfolio",
          message: "Core portfolio is unavailable or incomplete.",
        },
      ],
    };
    await refresh.click();
    await expect(workspace.getByRole("alert")).toContainText(
      "Core portfolio is unavailable or incomplete",
    );
    await expect(
      workspace.getByText("Native account portfolio unavailable.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(workspace.getByText("₹12.50", { exact: true })).toBeVisible();
    await expect(
      workspace.getByText("SYNTHETIC-CLIENT", { exact: false }),
    ).toBeVisible();
    await expect(workspace.locator(".account-facts strong")).toHaveText(
      "Not returned by core",
    );
    response = body;
    savings.availableBalance = 0.001;
    await refresh.click();
    await expect(workspace.getByRole("alert")).toContainText(
      "Customer enquiry could not be read or verified",
    );
    await expect(workspace.getByText("₹12.50", { exact: true })).toHaveCount(0);
    expect(writes).toEqual([]);
  });
