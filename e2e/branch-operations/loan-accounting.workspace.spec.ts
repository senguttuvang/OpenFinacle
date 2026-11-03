import { expect, test } from "@playwright/test";
import { branchDayFixture } from "../../src/demo/branch/branch-day-fixture";
import { savedWorkspace } from "../fixtures/workspace";

for (const width of [1440, 390]) {
  test(`loan product to GL to exact transaction/receipt with scoped pagination at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    const day = branchDayFixture();
    day.reviewFixture = false;
    const r = day.relationships[0];
    r.customer.account_id = 7;
    if (r.account) r.account.id = 7;
    const customer = r.customer,
      currency = { code: "INR", decimalPlaces: 2 },
      data = savedWorkspace();
    data.role = "officer";
    const loan = {
      id: 7,
      clientId: customer.client_id,
      accountNo: "LOAN7",
      loanProductId: 3,
      loanProductName: "Native loan product",
      currency,
      status: { id: 300, value: "Active" },
      principal: 1000,
      summary: {
        currency,
        principalOutstanding: 900,
        interestOutstanding: 20,
        feeChargesOutstanding: 0,
        penaltyChargesOutstanding: 0,
        totalOutstanding: 920,
        totalOverdue: 0,
      },
      transactions: [
        {
          id: 81,
          type: { id: 1, value: "Disbursement" },
          currency,
          date: [2026, 11, 4],
          amount: 1000,
          manuallyReversed: false,
        },
        {
          id: 82,
          type: { id: 2, value: "Repayment" },
          currency,
          date: [2026, 11, 5],
          amount: 100,
          manuallyReversed: false,
        },
      ],
    };
    const receipt = (
      kind: "disbursement" | "repayment",
      transactionId: number,
    ) => ({
      kind,
      recordId: `saved-${kind}`,
      operationId: `operation-${kind}`,
      transactionId,
      actor: "approver",
      observedAt: day.observedAt,
      historyComplete: true,
      history: [
        {
          id: `history-${kind}`,
          actor: "approver",
          action: kind === "repayment" ? "pay" : "disburse",
          kind: "outcome",
          note: `Synthetic ${kind} acknowledgement`,
          version: 3,
          createdAt: "2026-11-04",
        },
      ],
    });
    const journal = (id: number, transaction: number, gl: number) => ({
      id,
      officeId: 1,
      officeName: "Core office",
      glAccountId: gl,
      glAccountName: gl === 2 ? "Loan portfolio" : "Funding source",
      glAccountCode: gl === 2 ? "1201" : "1001",
      transactionId: "Opaque-provider-group",
      transactionDate: [2026, 11, 4],
      entryType: { id: 1, value: "DEBIT" },
      amount: 1000,
      currency,
      entityId: 7,
      entityType: { id: 1, value: "LOAN" },
      transactionDetails: { transactionId: transaction },
    });
    let accountingReads = 0;
    const offsets: string[] = [],
      writes: string[] = [];
    await page.route("**/api/**", (route) => {
      const req = route.request(),
        url = new URL(req.url());
      if (req.method() !== "GET") writes.push(url.pathname);
      if (url.pathname === "/api/branch/advances")
        return route.fulfill({
          json: {
            branchId: day.branchId,
            applicationDate: day.businessDate,
            startedAt: day.observedAt,
            observedAt: day.observedAt,
            complete: true,
            coverage: {
              loadedCustomers: 2,
              totalCustomers: 2,
              clientLimit: 200,
              loanLimitPerClient: 50,
              rowLimit: 500,
              limited: false,
              reportedLoans: 1,
            },
            rows: [
              {
                customerId: customer.id,
                customerName: customer.display_name,
                loan,
              },
            ],
            errors: [],
          },
        });
      if (url.pathname === "/api/branch/loan")
        return route.fulfill({
          json: {
            customerId: customer.id,
            branchId: day.branchId,
            observedAt: day.observedAt,
            loan,
          },
        });
      if (url.pathname === "/api/branch/relationship")
        return route.fulfill({
          json: {
            observedAt: day.observedAt,
            client: {
              id: customer.client_id,
              accountNo: "CLIENT",
              displayName: customer.display_name,
              status: { id: 300, value: "Active" },
              officeId: 1,
            },
            portfolio: {
              savingsAccounts: [
                {
                  id: 7,
                  accountNo: customer.account_no,
                  status: { id: 300, value: "Active" },
                  currency,
                },
              ],
              loanAccounts: [
                {
                  id: 7,
                  accountNo: "LOAN7",
                  status: { id: 300, value: "Active" },
                  currency,
                },
              ],
            },
            selectedSavings: {
              id: 7,
              accountNo: customer.account_no,
              status: { id: 300, value: "Active" },
              currency,
            },
            coreDocuments: [],
            charges: [],
            applicationDocuments: [],
            profile: null,
            nominee: null,
            errors: [],
          },
        });
      if (url.pathname === "/api/branch/loan-accounting") {
        accountingReads++;
        expect(url.searchParams.get("customerId")).toBe(customer.id);
        expect(url.searchParams.get("id")).toBe("7");
        offsets.push(url.searchParams.get("offset") ?? "");
        if (accountingReads > 2)
          return route.fulfill({
            status: 503,
            json: { error: "Read unavailable" },
          });
        const offset = Number(url.searchParams.get("offset"));
        return route.fulfill({
          json: {
            customerId: customer.id,
            branchId: day.branchId,
            loanId: 7,
            observedAt: day.observedAt,
            loan,
            chart: [
              { id: 1, name: "Funding source", glCode: "1001" },
              { id: 2, name: "Loan portfolio", glCode: "1201" },
            ],
            product: {
              id: 3,
              name: "Native loan product",
              accountingRule: { id: 2, value: "CASH BASED" },
              accountingMappings: {
                loanPortfolioAccount: { id: 2, name: "Loan portfolio" },
              },
            },
            coverage: {
              offset,
              limit: 200,
              sourceRows: offset ? 2 : 200,
              excludedRows: 0,
              hasMore: offset === 0,
            },
            journals: {
              totalFilteredRecords: 202,
              pageItems: offset
                ? [journal(1201, 82, 1), journal(1202, 82, 2)]
                : Array.from({ length: 200 }, (_, i) =>
                    journal(901 + i, 81, i % 2 ? 1 : 2),
                  ),
            },
            posting: {
              applicationId: "saved-disbursement",
              receipts: [receipt("disbursement", 81), receipt("repayment", 82)],
              errors: [],
            },
            errors: [],
          },
        });
      }
      return route.fulfill({
        json:
          url.pathname === "/api/dashboard"
            ? data
            : url.pathname === "/api/branch"
              ? day
              : {},
      });
    });
    await page.goto("/overview");
    await page
      .getByRole("button", { name: "Read branch loan exposure", exact: true })
      .click();
    await page
      .getByRole("region", { name: "Registered client loan exposure" })
      .getByRole("button", { name: "Inspect Core loan 7", exact: true })
      .click();
    await expect(
      page.getByText("Registered servicing account", { exact: true }),
    ).toHaveCount(1);
    await page
      .getByRole("button", {
        name: "Trace loan product → journals → GL",
        exact: true,
      })
      .click();
    const accounting = page.getByRole("region", {
      name: "Owned loan accounting explorer",
    });
    await expect(
      accounting.getByRole("heading", {
        name: "Core loan product GL mapping",
        exact: true,
      }),
    ).toBeVisible();
    await accounting
      .getByRole("button", {
        name: "loanPortfolioAccount → Loan portfolio",
        exact: true,
      })
      .click();
    await expect(
      accounting.getByLabel("Loan chart / control account"),
    ).toHaveValue("2");
    await accounting
      .getByRole("button", { name: "Inspect Core transaction 81", exact: true })
      .first()
      .click();
    await expect(
      accounting.getByRole("heading", {
        name: "Saved disbursement receipt",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      accounting.getByText("Synthetic disbursement acknowledgement", {
        exact: true,
      }),
    ).toBeVisible();
    await accounting
      .getByRole("button", { name: "Next loan journal page", exact: true })
      .click();
    await accounting
      .getByRole("button", { name: "Inspect Core transaction 82", exact: true })
      .first()
      .click();
    await expect(
      accounting.getByRole("heading", {
        name: "Saved repayment receipt",
        exact: true,
      }),
    ).toBeVisible();
    expect(offsets).toEqual(["0", "200"]);
    await page.locator(".branch-day").evaluate((el) => {
      (el as HTMLElement).style.fontSize = "200%";
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    const scroll = accounting.getByRole("region", {
      name: "Owned loan journal table",
    });
    await scroll.focus();
    await expect(scroll).toBeFocused();
    await accounting
      .getByRole("button", {
        name: "Refresh loan accounting evidence",
        exact: true,
      })
      .click();
    await expect(accounting.getByRole("alert")).toContainText(
      "unavailable or invalid",
    );
    await expect(
      accounting.getByRole("heading", {
        name: "Saved repayment receipt",
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Registered savings journals", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Accounting explorer", exact: true }),
    ).toBeVisible();
    expect(writes).toEqual([]);
  });
}
