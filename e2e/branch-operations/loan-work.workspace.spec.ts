import { expect, test } from "@playwright/test";
import { branchDayFixture } from "../../src/demo/branch/branch-day-fixture";
import { savedWorkspace } from "../fixtures/workspace";

for (const width of [1440, 390]) {
  test(`daily native loan work composes evidence filters and opens exact owned enquiry at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    const day = branchDayFixture();
    day.reviewFixture = false;
    const first = day.relationships[0].customer,
      second = day.relationships[1].customer;
    const currency = { code: "INR", decimalPlaces: 2 };
    const makeLoan = (
      id: number,
      clientId: number,
      product: number,
      state: number,
      overdue: number | null,
    ) => ({
      id,
      clientId,
      accountNo: `NATIVE-${id}`,
      loanProductId: product,
      loanProductName: product === 3 ? "Working capital" : "Enterprise loan",
      currency,
      status: { id: state, value: state === 300 ? "Active" : "Withdrawn" },
      principal: 1000,
      summary:
        overdue === null
          ? null
          : {
              currency,
              principalOutstanding: 1000,
              interestOutstanding: 20,
              feeChargesOutstanding: 0,
              penaltyChargesOutstanding: 0,
              totalOutstanding: 1020,
              totalOverdue: overdue,
            },
    });
    const loan = makeLoan(7, first.client_id, 3, 300, 25);
    const exposure = {
      branchId: day.branchId,
      applicationDate: day.businessDate,
      startedAt: day.observedAt,
      observedAt: day.observedAt,
      complete: false,
      coverage: {
        totalCustomers: 3,
        loadedCustomers: 3,
        clientLimit: 200,
        loanLimitPerClient: 50,
        rowLimit: 500,
        limited: false,
        reportedLoans: 4,
      },
      rows: [
        { customerId: first.id, customerName: first.display_name, loan },
        {
          customerId: first.id,
          customerName: first.display_name,
          loan: makeLoan(8, first.client_id, 3, 400, 0),
        },
        {
          customerId: second.id,
          customerName: second.display_name,
          loan: makeLoan(9, second.client_id, 4, 300, null),
        },
        {
          customerId: second.id,
          customerName: second.display_name,
          loan: makeLoan(10, second.client_id, 4, 300, 5),
        },
      ],
      errors: [
        {
          customerId: second.id,
          message: "One native loan summary unavailable.",
        },
      ],
    };
    const data = savedWorkspace();
    data.role = "officer";
    let reads = 0;
    const writes: string[] = [],
      scopes: string[] = [];
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (route.request().method() !== "GET") writes.push(url.pathname);
      let payload: unknown = {};
      if (url.pathname === "/api/dashboard") payload = data;
      else if (url.pathname === "/api/branch") payload = day;
      else if (url.pathname === "/api/branch/advances") {
        reads++;
        expect(url.searchParams.get("customerId")).toBe(first.id);
        if (reads === 2) {
          await route.fulfill({
            status: 503,
            json: { error: "Native read unavailable" },
          });
          return;
        }
        payload =
          reads === 4
            ? {
                ...exposure,
                complete: true,
                errors: [],
                coverage: { ...exposure.coverage, reportedLoans: 3 },
                rows: exposure.rows.filter((r) => r.loan.summary !== null),
              }
            : exposure;
      } else if (url.pathname === "/api/branch/loan") {
        scopes.push(
          `${url.searchParams.get("customerId")}/${url.searchParams.get("id")}`,
        );
        payload = {
          customerId: first.id,
          branchId: day.branchId,
          observedAt: day.observedAt,
          loan: {
            ...loan,
            repaymentSchedule: { currency, periods: [] },
            transactions: [],
          },
        };
      }
      await route.fulfill({ json: payload });
    });
    await page.goto("/overview");
    const profile = page.getByRole("button", { name: /^Profile menu for / });
    await expect(profile).toBeVisible();
    const headerLabel = await profile.getAttribute("aria-label");
    const nav = page.getByRole("navigation", { name: "Branch day screens" });
    await nav
      .getByRole("button", { name: "Daily control", exact: true })
      .click();
    const work = page.getByRole("region", {
      name: "Daily loan exception worklist",
    });
    await expect(
      work.getByRole("button", {
        name: "Read daily loan worklist",
        exact: true,
      }),
    ).toBeVisible();
    expect(reads).toBe(0);
    await work
      .getByRole("button", { name: "Read daily loan worklist", exact: true })
      .click();
    await expect(
      work.getByText("Loan worklist coverage is incomplete.", { exact: false }),
    ).toBeVisible();
    const table = work.getByRole("region", {
      name: "Registered client Core loan table",
    });
    await expect(table.locator("tbody tr")).toHaveCount(2);
    await expect(
      work.getByRole("combobox", { name: "Loan evidence filter", exact: true }),
    ).toHaveValue("overdue");
    await work
      .getByRole("combobox", { name: "Loan product filter", exact: true })
      .selectOption("3");
    await expect(
      table.getByRole("button", { name: "Inspect Core loan 7", exact: true }),
    ).toBeVisible();
    await expect(table.locator("tbody tr")).toHaveCount(1);
    await work
      .getByRole("combobox", { name: "Core loan state filter", exact: true })
      .selectOption("400");
    await expect(table.locator("tbody tr")).toHaveCount(0);
    await expect(
      work.getByText("An empty filtered worklist does not prove", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Close readiness · blocked", { exact: true }),
    ).toBeVisible();
    await work
      .getByRole("button", { name: "Reset loan filters", exact: true })
      .click();
    await expect(table.locator("tbody tr")).toHaveCount(2);
    await work
      .getByRole("searchbox", { name: "Find loan work", exact: true })
      .fill(" native-7 ");
    await expect(table.locator("tbody tr")).toHaveCount(1);
    await work
      .getByRole("searchbox", { name: "Find loan work", exact: true })
      .fill("");
    await work
      .getByRole("combobox", { name: "Loan evidence filter", exact: true })
      .selectOption("missing");
    await expect(
      table.getByRole("button", { name: "Inspect Core loan 9", exact: true }),
    ).toBeVisible();
    await expect(table).toContainText("Summary not returned");
    await expect(table).toContainText("Unavailable");
    await work
      .getByRole("combobox", { name: "Loan evidence filter", exact: true })
      .selectOption("zero");
    await expect(
      table.getByRole("button", { name: "Inspect Core loan 8", exact: true }),
    ).toBeVisible();
    await expect(table).not.toContainText("Unavailable");
    await work
      .getByRole("combobox", { name: "Loan evidence filter", exact: true })
      .selectOption("all");
    await expect(table.locator("tbody tr")).toHaveCount(4);
    await page.locator(".branch-day").evaluate((el) => {
      (el as HTMLElement).style.fontSize = "200%";
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await table.focus();
    await expect(table).toBeFocused();
    await work
      .getByRole("button", { name: "Refresh daily loan worklist", exact: true })
      .click();
    await expect(
      work
        .getByRole("alert")
        .filter({ hasText: "Loan evidence is unavailable or invalid" }),
    ).toBeVisible();
    await expect(work.getByRole("table")).toHaveCount(0);
    await work
      .getByRole("button", { name: "Refresh daily loan worklist", exact: true })
      .click();
    await expect(table.locator("tbody tr")).toHaveCount(2);
    await table
      .getByRole("button", { name: "Inspect Core loan 7", exact: true })
      .click();
    const enquiry = page.getByRole("region", {
      name: "Owned Core loan enquiry",
    });
    await expect(
      enquiry.getByRole("heading", {
        name: "Core loan 7 · read-only account enquiry",
        exact: true,
      }),
    ).toBeVisible();
    await nav.getByRole("button", { name: "Overview", exact: true }).click();
    const overview = page.getByRole("region", {
      name: "Registered client loan exposure",
    });
    await overview
      .getByRole("button", { name: "Read branch loan exposure", exact: true })
      .click();
    const productTable = overview.getByRole("region", {
      name: "Loan product outstanding table",
    });
    await expect(productTable.locator("tbody tr")).toHaveCount(2);
    const originalTotals = await productTable.innerText();
    await overview
      .getByRole("combobox", { name: "Loan product filter", exact: true })
      .selectOption("4");
    await expect(
      overview
        .getByRole("region", { name: "Registered client Core loan table" })
        .locator("tbody tr"),
    ).toHaveCount(1);
    await expect(
      overview.getByRole("button", {
        name: "Inspect Core loan 10",
        exact: true,
      }),
    ).toBeVisible();
    expect(await productTable.innerText()).toBe(originalTotals);
    await overview
      .getByRole("searchbox", { name: "Find loan work", exact: true })
      .fill("does-not-exist");
    await expect(
      overview
        .getByRole("region", { name: "Registered client Core loan table" })
        .locator("tbody tr"),
    ).toHaveCount(0);
    expect(await productTable.innerText()).toBe(originalTotals);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    expect(scopes).toEqual([`${first.id}/7`]);
    expect(writes).toEqual([]);
    await expect(profile).toHaveAttribute("aria-label", headerLabel ?? "");
  });
}
