import { expect, type Page, test } from "@playwright/test";
import { openWorkspace } from "../fixtures/navigation";
import { savedWorkspace } from "../fixtures/workspace";

const open = async (page: Page) => {
  await page.goto("/demo");
  await openWorkspace(page, "deposits");
  await page
    .getByRole("link", { name: "Recurring deposits", exact: true })
    .click();
};
const review = async (page: Page, amount = "2000", months = "6") => {
  await page
    .getByRole("button", { name: "Open a demo recurring deposit" })
    .click();
  await page.getByLabel("Monthly demo allocation (₹)").fill(amount);
  await page.getByLabel("Term in months", { exact: true }).fill(months);
  await page
    .getByRole("button", { name: "Review recurring application", exact: true })
    .click();
};
const saved = (bankId: string) => {
  sessionStorage.setItem(
    `openfinacle:recurring-command:${bankId}`,
    JSON.stringify({
      key: "pending-recurring-example",
      role: "customer",
      instruction: {
        kind: "submit",
        input: {
          product: "demo-recurring",
          amount: 2000,
          months: 6,
          day: 5,
          label: "",
          nominee: null,
        },
      },
    }),
  );
};

test("recurring storage failure blocks sending and preserves reviewed terms", async ({
  page,
}) => {
  const data = savedWorkspace();
  let posts = 0;
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("openfinacle:recurring-command:"))
        throw new Error("Injected storage failure");
      return original.call(this, key, value);
    };
  });
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST") posts++;
    return route.fulfill({
      json:
        path === "/api/dashboard"
          ? data
          : path === "/api/recurring-deposits"
            ? { plans: [] }
            : {},
    });
  });
  await open(page);
  await review(page);
  await page
    .getByRole("button", { name: "Submit recurring application", exact: true })
    .click();
  await expect(
    page.locator(".recurring-workspace").getByRole("alert"),
  ).toContainText("could not be stored or read");
  await expect(page.locator(".deposit-facts")).toContainText("₹12,210.00");
  expect(posts).toBe(0);
});

test("malformed recurring responses stay locked until a definitive missing-key inspection", async ({
  page,
}) => {
  const data = savedWorkspace();
  let posts = 0;
  let missing = false;
  const posted: unknown[] = [];
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/recurring-deposits") {
      if (request.method() === "POST") {
        posts++;
        posted.push({
          key: request.headers()["idempotency-key"],
          input: request.postDataJSON(),
        });
        return route.fulfill({ json: { plan: { id: "unverified" } } });
      }
      if (url.searchParams.has("key"))
        return route.fulfill(
          missing
            ? {
                status: 404,
                json: { error: "No recorded recurring instruction" },
              }
            : { json: { plan: { id: "unverified" } } },
        );
      return route.fulfill({ json: { plans: [] } });
    }
    return route.fulfill({
      json: url.pathname === "/api/dashboard" ? data : {},
    });
  });
  await open(page);
  await review(page);
  await page
    .getByRole("button", { name: "Submit recurring application", exact: true })
    .click();
  const inspect = page.getByRole("button", {
    name: "Check saved recurring instruction",
    exact: true,
  });
  await expect(inspect).toBeVisible();
  await page.reload();
  await openWorkspace(page, "deposits");
  await page
    .getByRole("link", { name: "Recurring deposits", exact: true })
    .click();
  await inspect.click();
  await expect(
    page.locator(".recurring-workspace").getByRole("alert"),
  ).toContainText("could not be verified");
  await expect(
    page.getByRole("button", { name: "Retry original recurring instruction" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open a demo recurring deposit" }),
  ).toBeDisabled();
  expect(posts).toBe(1);
  missing = true;
  await inspect.click();
  await page
    .getByRole("button", { name: "Retry original recurring instruction" })
    .click();
  await expect.poll(() => posts).toBe(2);
  expect(posted[1]).toEqual(posted[0]);
  await expect(
    page.getByRole("button", {
      name: "Discard unrecorded recurring instruction",
    }),
  ).toHaveCount(0);
  await inspect.click();
  await page
    .getByRole("button", { name: "Discard unrecorded recurring instruction" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Check your saved recurring instruction",
    }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      (bankId) =>
        sessionStorage.getItem(`openfinacle:recurring-command:${bankId}`),
      data.bank.id,
    ),
  ).toBeNull();
});

test("recurring pending reference remains inspectable through a failed list read", async ({
  page,
}) => {
  const data = savedWorkspace();
  let inspections = 0;
  await page.addInitScript(saved, data.bank.id);
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/recurring-deposits") {
      if (url.searchParams.has("key")) {
        inspections++;
        return route.fulfill({
          status: 404,
          json: { error: "No recorded recurring instruction" },
        });
      }
      return route.fulfill({
        status: 503,
        json: { error: "Recurring list temporarily unavailable" },
      });
    }
    return route.fulfill({
      json: url.pathname === "/api/dashboard" ? data : {},
    });
  });
  await open(page);
  await expect(
    page.locator(".recurring-workspace").getByRole("alert"),
  ).toContainText("Recurring list temporarily unavailable");
  await page
    .getByRole("button", {
      name: "Check saved recurring instruction",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry original recurring instruction" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Open a demo recurring deposit" }),
  ).toBeDisabled();
  expect(inspections).toBe(1);
});

test("unopened relationships route to account opening before recurring origination", async ({
  page,
}) => {
  const data = { ...savedWorkspace(), account: null };
  let posts = 0;
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST") posts++;
    return route.fulfill({
      json:
        path === "/api/dashboard"
          ? data
          : path === "/api/recurring-deposits"
            ? { plans: [] }
            : {},
    });
  });
  await open(page);
  await expect(
    page.getByRole("heading", {
      name: "Open an account before starting a recurring plan",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open a demo recurring deposit" }),
  ).toHaveCount(0);
  await page
    .locator(".recurring-workspace")
    .getByRole("button", { name: "Account opening", exact: true })
    .click();
  await expect(page.locator(".recurring-workspace")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /account/i }).first(),
  ).toBeVisible();
  expect(posts).toBe(0);
});

test("maximum recurring projection reflows at 200 percent text without splitting the amount", async ({
  page,
}) => {
  const data = savedWorkspace();
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json:
        path === "/api/dashboard"
          ? data
          : path === "/api/recurring-deposits"
            ? { plans: [] }
            : {},
    });
  });
  await page.setViewportSize({ width: 640, height: 900 });
  await open(page);
  await review(page, "100000", "120");
  await page.addStyleTag({ content: "html { font-size: 36px !important; }" });
  const facts = page.locator(".deposit-facts");
  await expect(facts).toContainText("₹1,56,30,000.00");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await facts.locator("dd").evaluateAll((elements) =>
      elements
        .filter((element) => element.textContent?.startsWith("₹"))
        .every((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return range.getClientRects().length <= 1;
        }),
    ),
  ).toBe(true);
  await facts.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/finacle4-recurring-max-200-text.png" });
});
