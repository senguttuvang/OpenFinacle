import { expect, test } from "@playwright/test";
import { branchDayFixture } from "../../src/demo/branch/branch-day-fixture";
import { savedWorkspace } from "../fixtures/workspace";

for (const width of [1440, 390])
  test(`registered branch GL enquiry keeps owned drill-down and clears failed pages at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    const day = branchDayFixture();
    day.reviewFixture = false;
    const data = savedWorkspace();
    data.role = "officer";
    const first = day.relationships[0],
      second = day.relationships[1];
    first.commands[0].status = "posted";
    first.commands[0].approver = "approver";
    first.commands[0].core_id = 901;
    const journal = (
      id: number,
      entity: number,
      family: "Savings" | "Loan",
    ) => ({
      id,
      officeId: 1,
      officeName: "Native office",
      glAccountId: 2,
      glAccountName: "Cash",
      glAccountCode: "OF1001",
      transactionId: `native-group-${id}`,
      transactionDate: [2026, 11, 4],
      entryType: { id: 1, value: "CREDIT" },
      amount: 1.25,
      currency: { code: "INR", decimalPlaces: 2 },
      entityId: entity,
      entityType: { id: family === "Savings" ? 2 : 1, value: family },
      transactionDetails: { transactionId: 901 },
      manualEntry: false,
      runningBalanceComputed: id === 800 ? false : id === 799 ? true : null,
      officeRunningBalance: 777777.99,
      organizationRunningBalance: 888888.88,
    });
    const rows = [
      {
        customerId: first.customer.id,
        customerName: first.customer.display_name,
        family: "Savings",
        accountId: first.customer.account_id,
        originalCommandId: first.commands[0].id,
        journal: journal(800, first.customer.account_id, "Savings"),
      },
      {
        customerId: second.customer.id,
        customerName: second.customer.display_name,
        family: "Savings",
        accountId: second.customer.account_id,
        originalCommandId: null,
        journal: journal(799, second.customer.account_id, "Savings"),
      },
      {
        customerId: first.customer.id,
        customerName: first.customer.display_name,
        family: "Loan",
        accountId: 7,
        originalCommandId: null,
        journal: journal(798, 7, "Loan"),
      },
    ];
    const coverage = {
      offset: 0,
      limit: 200,
      sourceRows: 200,
      excludedRows: 197,
      hasMore: true,
      totalProviderRows: 201,
      registeredCustomers: 2,
      loadedCustomers: 2,
      eligibleAccounts: 2,
      registryLimited: false,
      workflowLimited: false,
      loanOwnershipLimit: 50,
      loanOwnershipLimited: false,
      loanOwnershipFailures: 0,
    };
    const base = {
      branchId: day.branchId,
      anchorCustomerId: first.customer.id,
      applicationDate: day.businessDate,
      startedAt: day.observedAt,
      observedAt: day.observedAt,
      registryStartedAt: day.observedAt,
      office: { id: 1, name: "Native office" },
      gl: { id: 2, name: "Cash", glCode: "OF1001" },
      rows,
      coverage,
      errors: [
        "Unregistered or unverifiable ownership rows excluded; partial registered scope.",
      ],
    };
    const writes: string[] = [],
      offsets: string[] = [],
      loanScopes: string[] = [];
    let reads = 0;
    await page.route("**/api/**", (route) => {
      const req = route.request(),
        url = new URL(req.url());
      if (req.method() !== "GET") writes.push(url.pathname);
      if (url.pathname === "/api/dashboard")
        return route.fulfill({ json: data });
      if (url.pathname === "/api/branch") return route.fulfill({ json: day });
      if (url.pathname === "/api/branch/accounting")
        return route.fulfill({
          json: {
            coverage: {
              offset: 0,
              limit: 200,
              sourceRows: 0,
              excludedRows: 0,
              hasMore: false,
            },
            observedAt: day.observedAt,
            chart: [{ id: 2, name: "Cash", glCode: "OF1001" }],
            product: {
              id: 1,
              name: "Savings",
              accountingRule: { id: 2, value: "Cash based" },
              accountingMappings: {
                savingsReferenceAccount: { id: 2, name: "Cash" },
              },
            },
            journals: { totalFilteredRecords: 0, pageItems: [] },
            errors: [],
          },
        });
      if (url.pathname === "/api/branch/gl-journals") {
        reads++;
        offsets.push(url.searchParams.get("offset") ?? "");
        expect(url.searchParams.get("customerId")).toBe(first.customer.id);
        expect(url.searchParams.get("id")).toBe("2");
        if (reads === 4)
          return route.fulfill({
            status: 503,
            json: { error: "Unavailable native source" },
          });
        if (reads === 5)
          return route.fulfill({
            json: { ...base, branchId: "foreign-branch" },
          });
        return route.fulfill({
          json:
            url.searchParams.get("offset") === "200"
              ? {
                  ...base,
                  rows: [
                    {
                      ...rows[1],
                      journal: journal(
                        600,
                        second.customer.account_id,
                        "Savings",
                      ),
                    },
                  ],
                  coverage: {
                    ...coverage,
                    offset: 200,
                    sourceRows: 1,
                    excludedRows: 0,
                    hasMore: false,
                  },
                }
              : base,
        });
      }
      if (url.pathname === "/api/branch/loan") {
        loanScopes.push(
          `${url.searchParams.get("customerId")}/${url.searchParams.get("id")}`,
        );
        return route.fulfill({
          json: {
            branchId: day.branchId,
            customerId: first.customer.id,
            observedAt: day.observedAt,
            loan: {
              id: 7,
              clientId: first.customer.client_id,
              accountNo: "LOAN7",
              loanProductId: 3,
              loanProductName: "Native loan",
              currency: { code: "INR", decimalPlaces: 2 },
              status: { id: 300, value: "Active" },
              principal: 100,
              repaymentSchedule: {
                currency: { code: "INR", decimalPlaces: 2 },
                periods: [],
              },
              transactions: [],
            },
          },
        });
      }
      return route.fulfill({ json: {} });
    });
    await page.goto("/overview");
    const profile = page.getByRole("button", { name: /^Profile menu for / });
    await expect(profile).toBeVisible();
    const initialHeader = await profile.getAttribute("aria-label");
    const nav = page.getByRole("navigation", { name: "Branch day screens" });
    const enter = async () => {
      await nav
        .getByRole("button", { name: "Accounting", exact: true })
        .click();
      await page
        .getByRole("combobox", { name: "Chart / control account", exact: true })
        .selectOption("2");
      await page
        .getByRole("button", {
          name: "Enquire GL across registered branch relationships",
          exact: true,
        })
        .click();
    };
    await enter();
    const enquiry = page.getByRole("region", {
      name: "Registered branch GL journal enquiry",
    });
    const table = enquiry.getByRole("region", {
      name: "Registered relationship GL journal table",
    });
    await expect(table.locator("tbody tr")).toHaveCount(3);
    for (const label of ["Not computed", "Computed", "Not returned"])
      await expect(
        table.getByText(`Native running-balance flag: ${label}`, {
          exact: true,
        }),
      ).toBeVisible();
    await expect(enquiry).toContainText(
      "Stored running-balance amounts are withheld",
    );
    await expect(enquiry).not.toContainText("7,77,777.99");
    await expect(enquiry).not.toContainText("8,88,888.88");
    await expect(enquiry).toContainText(
      "197 unregistered/manual/unidentified/unverifiable rows excluded",
    );
    await expect(enquiry).toContainText("not a full Core office ledger");
    await enquiry
      .getByRole("searchbox", { name: "Find loaded GL journal", exact: true })
      .fill("Northstar");
    await expect(table.locator("tbody tr")).toHaveCount(1);
    await expect(enquiry).toContainText("200 provider rows");
    await enquiry
      .getByRole("button", { name: "Clear GL journal search", exact: true })
      .click();
    await expect(table.locator("tbody tr")).toHaveCount(3);
    const flag = table.getByText("Native running-balance flag: Not computed", {
      exact: true,
    });
    const beforeFont = await flag.evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    await page.evaluate(() => {
      const root = document.documentElement;
      root.style.fontSize =
        String(parseFloat(getComputedStyle(root).fontSize) * 2) + "px";
    });
    const afterFont = await flag.evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    expect(afterFont).toBeCloseTo(beforeFont * 2, 1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await table.focus();
    await expect(table).toBeFocused();
    if (width === 390) {
      await page.keyboard.press("ArrowRight");
      await expect
        .poll(() => table.evaluate((el) => el.scrollLeft))
        .toBeGreaterThan(0);
    }
    await table
      .getByRole("button", {
        name: `Original cash instruction ${first.commands[0].id}`,
        exact: true,
      })
      .click();
    await expect(
      page.getByText("Counter cash instruction", { exact: true }).first(),
    ).toBeVisible();
    await enter();
    await expect(table.locator("tbody tr")).toHaveCount(3);
    await enquiry
      .getByRole("button", { name: "Next registered GL page", exact: true })
      .click();
    await expect(table.locator("tbody tr")).toHaveCount(1);
    await expect(table).toContainText("600");
    await enquiry
      .getByRole("button", { name: "Previous registered GL page", exact: true })
      .click();
    await expect(
      enquiry
        .getByRole("alert")
        .filter({ hasText: "GL journal evidence is unavailable or invalid" }),
    ).toBeVisible();
    await expect(enquiry.getByRole("table")).toHaveCount(0);
    await enquiry
      .getByRole("button", {
        name: "Refresh registered GL journals",
        exact: true,
      })
      .click();
    await expect(
      enquiry
        .getByRole("alert")
        .filter({ hasText: "GL journal evidence is unavailable or invalid" }),
    ).toBeVisible();
    await expect(enquiry.getByRole("table")).toHaveCount(0);
    await enquiry
      .getByRole("button", {
        name: "Refresh registered GL journals",
        exact: true,
      })
      .click();
    await expect(table.locator("tbody tr")).toHaveCount(3);
    await expect(
      enquiry.getByText("Unavailable as current cash-position proof.", {
        exact: false,
      }),
    ).toBeVisible();
    await table
      .getByRole("button", {
        name: `${first.customer.display_name} · Loan 7`,
        exact: true,
      })
      .click();
    await expect(
      page
        .getByRole("region", { name: "Owned Core loan enquiry" })
        .getByRole("heading", {
          name: "Core loan 7 · read-only account enquiry",
          exact: true,
        }),
    ).toBeVisible();
    expect(loanScopes).toEqual([`${first.customer.id}/7`]);
    expect(offsets).toEqual(["0", "0", "200", "0", "0", "0"]);
    expect(writes).toEqual([]);
    await expect(profile).toHaveAttribute("aria-label", initialHeader ?? "");
  });
