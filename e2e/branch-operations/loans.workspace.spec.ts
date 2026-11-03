import { expect, test } from "@playwright/test";
import { branchDayFixture } from "../../src/demo/branch/branch-day-fixture";
import { savedWorkspace } from "../fixtures/workspace";

for (const width of [1440, 390]) {
  test(`native loan exposure drills into owned schedules and clears failed evidence at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    const day = branchDayFixture();
    day.reviewFixture = false;
    const customer = day.relationships[0].customer;
    day.relationships[0].audit = [
      {
        id: "synthetic-long-audit",
        bank_id: customer.bank_id,
        actor: "officer",
        action: "service.awaiting_approval",
        detail: "Synthetic audit entry with a saved workflow identifier",
        created_at: "2026-11-04 03:50:00",
      },
    ];
    const currency = { code: "INR", decimalPlaces: 2 };
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
        principalOutstanding: 1000,
        interestOutstanding: 20,
        feeChargesOutstanding: 0,
        penaltyChargesOutstanding: 0,
        totalOutstanding: 1020,
        totalOverdue: 0,
      },
    };
    const exposure = {
      branchId: day.branchId,
      applicationDate: day.businessDate,
      startedAt: day.observedAt,
      observedAt: day.observedAt,
      complete: true,
      coverage: {
        totalCustomers: 2,
        loadedCustomers: 2,
        clientLimit: 200,
        loanLimitPerClient: 50,
        rowLimit: 500,
        limited: false,
        reportedLoans: 1,
      },
      rows: [
        { customerId: customer.id, customerName: customer.display_name, loan },
      ],
      errors: [],
    };
    const detail = {
      customerId: customer.id,
      branchId: day.branchId,
      observedAt: day.observedAt,
      loan: {
        ...loan,
        repaymentSchedule: {
          currency,
          periods: [
            { sourceLine: 1, dueDate: [2026, 11, 4], principalDisbursed: 1000 },
            {
              sourceLine: 2,
              period: 1,
              dueDate: [2026, 12, 4],
              principalDue: 100,
              interestDue: 20,
              totalDueForPeriod: 120,
              totalPaidForPeriod: 0,
              totalOutstandingForPeriod: 120,
            },
          ],
        },
        transactions: [
          {
            id: 17,
            type: { id: 1, value: "Disbursement" },
            date: [2026, 11, 4],
            amount: 1000,
            currency,
            manuallyReversed: false,
          },
        ],
      },
    };
    const data = savedWorkspace();
    data.role = "officer";
    let exposureReads = 0,
      detailReads = 0;
    const writes: string[] = [];
    await page.route("**/api/**", (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname;
      if (req.method() !== "GET") writes.push(path);
      if (path === "/api/branch/advances") {
        exposureReads++;
        return route.fulfill({
          json:
            exposureReads === 1
              ? exposure
              : exposureReads === 2
                ? {
                    ...exposure,
                    complete: false,
                    coverage: { ...exposure.coverage, limited: true },
                  }
                : { bad: "source" },
        });
      }
      if (path === "/api/branch/loan") {
        detailReads++;
        expect(new URL(req.url()).searchParams.get("customerId")).toBe(
          customer.id,
        );
        return route.fulfill(
          detailReads === 1
            ? { json: detail }
            : { status: 503, json: { error: "Loan read unavailable" } },
        );
      }
      return route.fulfill({
        json:
          path === "/api/dashboard" ? data : path === "/api/branch" ? day : {},
      });
    });
    await page.goto("/overview");
    await expect(
      page.getByRole("heading", { name: "Deposits by product", exact: true }),
    ).toBeVisible();
    expect(exposureReads).toBe(0);
    await page
      .getByRole("button", { name: "Read branch loan exposure", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Core outstanding by loan product",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Inspect Core loan 7", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    const enquiry = page.getByRole("region", {
      name: "Owned Core loan enquiry",
    });
    await expect(
      enquiry.getByRole("heading", {
        name: "Core repayment schedule",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      enquiry.getByText("2026-12-04", { exact: true }),
    ).toBeVisible();
    await expect(
      enquiry.getByText("Disbursement", { exact: true }),
    ).toBeVisible();
    await expect(enquiry.getByRole("button")).toHaveCount(1);
    await page.locator(".branch-day").evaluate((el) => {
      (el as HTMLElement).style.fontSize = "200%";
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    const scheduleScroller = enquiry.getByRole("region", {
      name: "Core loan repayment schedule table",
    });
    await scheduleScroller.focus();
    await expect(scheduleScroller).toBeFocused();
    if (width === 390) {
      await page.keyboard.press("ArrowRight");
      await expect
        .poll(() => scheduleScroller.evaluate((el) => el.scrollLeft))
        .toBeGreaterThan(0);
    }
    await enquiry
      .getByRole("button", { name: "Refresh Core loan enquiry", exact: true })
      .click();
    await expect(enquiry.getByRole("alert")).toBeVisible();
    await expect(
      enquiry.getByText("Disbursement", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("navigation", { name: "Branch day screens" })
      .getByRole("button", { name: "Overview", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Read branch loan exposure", exact: true })
      .click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Loan product totals withheld" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Core outstanding by loan product",
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByRole("button", {
        name: "Refresh branch loan exposure",
        exact: true,
      })
      .click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Loan evidence is unavailable or invalid" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Inspect Core loan 7", exact: true }),
    ).toHaveCount(0);
    expect(writes).toEqual([]);
  });
}
