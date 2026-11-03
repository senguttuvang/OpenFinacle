import { expect, test } from "@playwright/test";
import { branchDayFixture } from "../../src/demo/branch/branch-day-fixture";
import { savedWorkspace } from "../fixtures/workspace";

for (const width of [1440, 390]) {
  test(`processing enquiry is lazy, read-only and explicit about close at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    const data = savedWorkspace();
    data.role = "officer";
    const day = branchDayFixture();
    day.reviewFixture = false;
    let reads = 0;
    const writes: string[] = [];
    await page.route("**/api/**", (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      if (req.method() !== "GET") writes.push(path);
      if (path === "/api/branch/processing") {
        reads++;
        return route.fulfill({
          json:
            reads > 1
              ? { branchId: "foreign" }
              : {
                  branchId: day.branchId,
                  observedAt: day.observedAt,
                  scheduler: { active: true },
                  businessDates: [],
                  errors: [],
                  jobs: [
                    {
                      jobId: 2,
                      displayName: "Savings processing",
                      active: true,
                      currentlyRunning: false,
                      nextRunTime: "Core time",
                      lastRunHistory: {
                        status: "success",
                        jobRunStartTime: "Core start",
                      },
                    },
                  ],
                },
        });
      }
      return route.fulfill({
        json:
          path === "/api/dashboard" ? data : path === "/api/branch" ? day : {},
      });
    });
    await page.goto("/overview");
    await expect(
      page.getByRole("heading", { name: "Deposits by product" }),
    ).toBeVisible();
    expect(reads).toBe(0);
    await page
      .getByRole("button", { name: "Daily control", exact: true })
      .click();
    const enquiry = page.getByRole("region", {
      name: "Core processing enquiry",
    });
    await expect(
      enquiry.getByText("1 returned jobs", { exact: false }),
    ).toBeVisible();
    await expect(
      enquiry.getByText("No business-date rows returned", { exact: false }),
    ).toBeVisible();
    await expect(
      enquiry.getByRole("cell", { name: /^Savings processing/ }),
    ).toBeVisible();
    await expect(
      page.getByText("Close readiness · blocked", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await enquiry
      .getByRole("button", { name: "Refresh processing evidence" })
      .click();
    await expect(enquiry.getByRole("alert")).toContainText(
      "unavailable or invalid",
    );
    await expect(
      enquiry.getByRole("cell", { name: /^Savings processing/ }),
    ).toHaveCount(0);
    expect(reads).toBe(2);
    expect(writes).toEqual([]);
  });
}
