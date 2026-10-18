import { expect, test } from "@playwright/test";
import {
  type RecurringDetail,
  type RecurringTerms,
  recurringActions,
  recurringSchedule,
} from "../src/domain/recurring-deposits";
import { openWorkspace } from "./fixtures/navigation";
import { choosePersona } from "./fixtures/persona";
import { savedWorkspace } from "./fixtures/workspace";

test("recurring plan shares review, independent activation and a reload-reconciled installment", async ({
  page,
}) => {
  test.setTimeout(60000);
  const data = savedWorkspace();
  let saved: RecurringDetail | null = null;
  let allocations = 0;
  let financialWrites = 0;
  const keys = new Set<string>();
  const timestamp = "2026-10-17T09:00:00Z";
  const current = (key: string | null = null) =>
    saved
      ? {
          ...saved,
          actions: recurringActions(saved.plan, saved.installments, data.role),
          confirmed_key: key,
        }
      : null;
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const key = request.headers()["idempotency-key"] ?? "";
    if (url.pathname === "/api/session/role") {
      data.role = request.postDataJSON().role;
      return route.fulfill({ json: { role: data.role } });
    }
    if (
      url.pathname === "/api/recurring-deposits" &&
      request.method() === "POST"
    ) {
      const terms = request.postDataJSON() as RecurringTerms;
      keys.add(key);
      saved = {
        plan: {
          id: "22222222-1234-4567-8901-123456789abc",
          bank_id: data.bank.id,
          terms,
          status: "submitted",
          maker: null,
          checker: null,
          activated_at: null,
          maturity_date: null,
          maturity_minor: null,
          allocated_count: 0,
          allocated_minor: 0,
          version: 0,
          created_at: timestamp,
          updated_at: timestamp,
        },
        installments: [],
        history: [
          {
            id: "submit",
            actor: "customer",
            action: "submit",
            note: "Synthetic recurring plan; no savings mandate.",
            status: "submitted",
            period: null,
            version: 0,
            created_at: timestamp,
          },
        ],
        actions: [],
        confirmed_key: key,
      };
      return route.fulfill({ json: current(key) });
    }
    if (url.pathname === "/api/recurring-deposits/action" && saved) {
      const input = request.postDataJSON();
      keys.add(key);
      const status =
        input.action === "recommend"
          ? ("recommended" as const)
          : ("active" as const);
      saved = {
        ...saved,
        plan: {
          ...saved.plan,
          status,
          version: saved.plan.version + 1,
          maker: "officer",
          ...(input.action === "activate"
            ? {
                checker: "approver",
                activated_at: timestamp,
                maturity_date: "2027-04-17",
                maturity_minor: 1221000,
              }
            : {}),
          ...(input.action === "allocate"
            ? { allocated_count: 1, allocated_minor: 200000 }
            : {}),
        },
        installments:
          input.action === "activate"
            ? recurringSchedule(saved.plan.terms, timestamp).map(
                (item, index) => ({
                  ...item,
                  allocated_at: null,
                  state: index === 0 ? "due" : "upcoming",
                }),
              )
            : input.action === "allocate"
              ? saved.installments.map((item, index) =>
                  index === 0
                    ? { ...item, allocated_at: timestamp, state: "allocated" }
                    : item,
                )
              : saved.installments,
        history: [
          ...saved.history,
          {
            id: input.action,
            actor: data.role,
            action: input.action,
            note: input.note,
            status,
            period: input.period ?? null,
            version: saved.plan.version + 1,
            created_at: timestamp,
          },
        ],
      };
      if (input.action === "allocate") {
        allocations++;
        return route.abort("failed");
      }
      return route.fulfill({ json: current(key) });
    }
    if (url.pathname === "/api/recurring-deposits") {
      const reference = url.searchParams.get("key");
      if (reference && !keys.has(reference))
        return route.fulfill({
          status: 404,
          json: { error: "No recorded recurring instruction" },
        });
      return route.fulfill({
        json:
          url.searchParams.has("id") || reference
            ? current(reference)
            : { plans: saved ? [saved.plan] : [] },
      });
    }
    if (url.pathname === "/api/commands" && request.method() === "POST")
      financialWrites++;
    return route.fulfill({
      json:
        url.pathname === "/api/dashboard"
          ? data
          : url.pathname === "/api/deposits"
            ? { deposits: [] }
            : {},
    });
  });
  const open = async () => {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await openWorkspace(page, "deposits");
    await page
      .getByRole("button", { name: "Recurring deposits", exact: true })
      .click();
  };
  const view = () =>
    page.getByRole("button", { name: "View RD-22222222", exact: true }).click();
  await page.goto("/");
  await open();
  await page
    .getByRole("button", { name: "Open a demo recurring deposit" })
    .click();
  await page.getByLabel("Monthly demo allocation (₹)").fill("550");
  await page
    .getByRole("button", { name: "Review recurring application", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "New recurring deposit", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Monthly demo allocation (₹)").fill("2000");
  await page.getByLabel("Term in months", { exact: true }).fill("6");
  await page
    .getByLabel("Plan or goal name (optional)", { exact: true })
    .fill("Example travel goal");
  await page.getByLabel("Add an adult nominee", { exact: true }).check();
  await page.getByLabel("Nominee name", { exact: true }).fill("Example Parent");
  await page
    .getByRole("button", { name: "Review recurring application", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review recurring-deposit application" }),
  ).toBeFocused();
  await expect(page.locator(".deposit-facts")).toContainText("₹12,210.00");
  await page
    .getByRole("button", { name: "Edit recurring application", exact: true })
    .click();
  await expect(page.getByLabel("Monthly demo allocation (₹)")).toHaveValue(
    "2000",
  );
  await expect(page.getByLabel("Nominee name", { exact: true })).toHaveValue(
    "Example Parent",
  );
  await page
    .getByRole("button", { name: "Review recurring application", exact: true })
    .click();
  await page.screenshot({
    path: "/tmp/finacle4-recurring-review-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Submit recurring application", exact: true })
    .click();
  await expect(page.locator(".recurring-detail")).toContainText(
    "Awaiting officer review",
  );
  await choosePersona(page, "officer");
  await open();
  await view();
  await expect(
    page.getByRole("button", { name: "Activate demo plan", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Recommend for approval", exact: true })
    .click();
  await page
    .getByLabel("Instruction reason", { exact: true })
    .fill("Synthetic recurring application reviewed");
  await page
    .getByRole("button", { name: "Review recurring instruction", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Confirm recommend for approval",
      exact: true,
    })
    .click();
  await choosePersona(page, "approver");
  await open();
  await view();
  await page
    .getByRole("button", { name: "Activate demo plan", exact: true })
    .click();
  await page
    .getByLabel("Instruction reason", { exact: true })
    .fill("Independent synthetic plan approval");
  await page
    .getByRole("button", { name: "Review recurring instruction", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm activate demo plan", exact: true })
    .click();
  await expect(page.locator(".recurring-detail")).toContainText(
    "Active recurring plan",
  );
  await choosePersona(page, "customer");
  await open();
  await view();
  await page
    .getByRole("button", { name: "Record demo installment", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review recurring instruction", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Confirm record demo installment",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Check your saved recurring instruction",
    }),
  ).toBeVisible();
  await expect.poll(() => allocations).toBe(1);
  await page.reload();
  await open();
  await page
    .getByRole("button", {
      name: "Check saved recurring instruction",
      exact: true,
    })
    .click();
  await expect(page.locator(".recurring-detail")).toContainText("1 of 6");
  await expect(page.locator(".card-history li")).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "Record demo installment", exact: true }),
  ).toHaveCount(0);
  await page
    .getByText("View 6 scheduled installments", { exact: true })
    .click();
  await expect(page.locator(".recurring-schedule li").first()).toContainText(
    "allocated",
  );
  await expect(page.locator(".recurring-schedule li").nth(1)).toContainText(
    "upcoming",
  );
  await page
    .getByRole("button", { name: "Extra-large text", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/finacle4-recurring-mobile-xl.png",
    fullPage: true,
  });
  expect(allocations).toBe(1);
  expect(financialWrites).toBe(0);
});
