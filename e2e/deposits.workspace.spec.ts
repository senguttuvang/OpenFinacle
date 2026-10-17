import { expect, test } from "@playwright/test";
import type { DepositDetail, DepositTerms } from "../src/domain/deposits";
import { choosePersona } from "./fixtures/persona";
import { savedWorkspace } from "./fixtures/workspace";

test("fixed deposit preserves review/edit, reconciles lost submission and activates across staff roles/reload", async ({
  page,
}) => {
  const data = savedWorkspace();
  let saved: DepositDetail | null = null;
  let key = "";
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/session/role") {
      data.role = request.postDataJSON().role;
      return route.fulfill({ json: { role: data.role } });
    }
    if (url.pathname === "/api/deposits" && request.method() === "POST") {
      const terms = request.postDataJSON() as DepositTerms;
      key = request.headers()["idempotency-key"];
      saved = {
        deposit: {
          id: "11111111-1234-4567-8901-123456789abc",
          bank_id: data.bank.id,
          terms,
          status: "submitted",
          maker: null,
          checker: null,
          activated_at: null,
          maturity_date: null,
          maturity_minor: null,
          version: 0,
          created_at: "2026-10-17T09:00:00Z",
          updated_at: "2026-10-17T09:00:00Z",
        },
        history: [
          {
            id: "submit",
            actor: "customer",
            action: "submit",
            note: "Demo allocation; no savings debit.",
            status: "submitted",
            version: 0,
            created_at: "2026-10-17T09:00:00Z",
          },
        ],
        actions: [],
        confirmed_key: key,
      };
      return route.abort("failed");
    }
    if (url.pathname === "/api/deposits/action" && saved) {
      const input = request.postDataJSON();
      const status = input.action === "recommend" ? "recommended" : "active";
      saved = {
        ...saved,
        deposit: {
          ...saved.deposit,
          status,
          version: saved.deposit.version + 1,
          maker: "officer",
          ...(status === "active"
            ? {
                checker: "approver",
                activated_at: "2026-10-17T09:30:00Z",
                maturity_date: "2027-10-17",
                maturity_minor: 2120000,
              }
            : {}),
        },
        history: [
          ...saved.history,
          {
            id: input.action,
            actor: data.role,
            action: input.action,
            note: input.note,
            status,
            version: saved.deposit.version + 1,
            created_at: "2026-10-17T09:30:00Z",
          },
        ],
        confirmed_key: request.headers()["idempotency-key"],
      };
      return route.fulfill({ json: saved });
    }
    if (url.pathname === "/api/deposits") {
      if (url.searchParams.has("id") || url.searchParams.has("key")) {
        const actions =
          saved?.deposit.status === "submitted" && data.role === "officer"
            ? ["recommend", "reject"]
            : saved?.deposit.status === "recommended" &&
                data.role === "approver"
              ? ["activate", "reject"]
              : [];
        return route.fulfill({
          json: {
            ...saved,
            actions,
            confirmed_key: url.searchParams.get("key") ?? null,
          },
        });
      }
      return route.fulfill({
        json: { deposits: saved ? [saved.deposit] : [] },
      });
    }
    return route.fulfill({
      json: url.pathname === "/api/dashboard" ? data : {},
    });
  });
  const open = () =>
    page.getByRole("button", { name: "Deposits", exact: true }).click();
  await page.goto("/");
  await open();
  await page.getByRole("button", { name: "Open a demo fixed deposit" }).click();
  await page.getByLabel("Demo allocation (₹)").fill("500");
  await page
    .getByRole("button", { name: "Review application", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "New fixed deposit", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Demo allocation (₹)").fill("20000");
  await page.getByLabel("Add an adult nominee").check();
  await page.getByLabel("Nominee name", { exact: true }).fill("Example Parent");
  await page
    .getByRole("button", { name: "Review application", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review fixed-deposit application" }),
  ).toBeFocused();
  await expect(page.locator(".deposit-facts")).toContainText("₹21,200.00");
  await page
    .getByRole("button", { name: "Edit application", exact: true })
    .click();
  await expect(page.getByLabel("Demo allocation (₹)")).toHaveValue("20000");
  await expect(page.getByLabel("Nominee name", { exact: true })).toHaveValue(
    "Example Parent",
  );
  await page
    .getByRole("button", { name: "Review application", exact: true })
    .click();
  await page.screenshot({
    path: "/tmp/finacle4-deposit-review-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Submit demo application" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your saved deposit instruction" }),
  ).toBeVisible();
  await page.reload();
  await open();
  await expect(
    page.getByRole("heading", { name: "Check your saved deposit instruction" }),
  ).toBeVisible();
  expect(key.length).toBeGreaterThan(8);
  await page
    .getByRole("button", { name: "Check saved instruction", exact: true })
    .click();
  await expect(page.locator(".deposit-detail")).toContainText(
    "Awaiting officer review",
  );
  await expect(
    page.getByRole("button", { name: "Open a demo fixed deposit" }),
  ).toBeEnabled();
  await choosePersona(page, "officer");
  await open();
  await page
    .getByRole("button", { name: "View FD-11111111", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Activate demo holding", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Recommend for approval", exact: true })
    .click();
  await page
    .getByLabel("Decision reason")
    .fill("Synthetic application reviewed");
  await page
    .getByRole("button", { name: "Review instruction", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Confirm recommend for approval",
      exact: true,
    })
    .click();
  await choosePersona(page, "approver");
  await open();
  await page
    .getByRole("button", { name: "View FD-11111111", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Activate demo holding", exact: true })
    .click();
  await page
    .getByLabel("Decision reason")
    .fill("Independent synthetic approval");
  await page
    .getByRole("button", { name: "Review instruction", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm activate demo holding", exact: true })
    .click();
  await expect(page.locator(".deposit-detail")).toContainText("Active holding");
  await expect(page.locator(".card-history li")).toHaveCount(3);
  await choosePersona(page, "customer");
  await page.reload();
  await open();
  await page
    .getByRole("button", { name: "View FD-11111111", exact: true })
    .click();
  await expect(page.locator(".deposit-detail")).toContainText("2027-10-17");
  await expect(page.locator(".deposit-detail")).toContainText(
    "Your savings account is unchanged",
  );
  await page
    .getByRole("button", { name: "Extra-large text", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".deposit-facts")).toHaveCSS(
    "grid-template-columns",
    /^\d+(\.\d+)?px$/,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/finacle4-deposit-mobile-xl.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 640, height: 900 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/finacle4-deposit-200-text.png",
    fullPage: true,
  });
});
test("unverified deposit response stays locked; only confirmed missing key enables safe discard", async ({
  page,
}) => {
  const data = savedWorkspace();
  let malformed = true;
  let sent = 0;
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/deposits" && request.method() === "POST") {
      sent++;
      return route.fulfill({ json: { unverified: true } });
    }
    if (url.pathname === "/api/deposits" && url.searchParams.has("key"))
      return malformed
        ? route.fulfill({ json: {} })
        : route.fulfill({
            status: 404,
            json: { error: "No recorded instruction" },
          });
    return route.fulfill({
      json:
        url.pathname === "/api/dashboard"
          ? data
          : url.pathname === "/api/deposits"
            ? { deposits: [] }
            : {},
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Deposits", exact: true }).click();
  await page.getByRole("button", { name: "Open a demo fixed deposit" }).click();
  await page
    .getByRole("button", { name: "Review application", exact: true })
    .click();
  await page.getByRole("button", { name: "Submit demo application" }).click();
  await expect(
    page.locator(".deposit-workspace").getByRole("alert"),
  ).toContainText("could not be verified");
  await page
    .getByRole("button", { name: "Check saved instruction", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry original instruction" }),
  ).toHaveCount(0);
  malformed = false;
  await page
    .getByRole("button", { name: "Check saved instruction", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry original instruction" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Discard unrecorded instruction" })
    .click();
  await expect(
    page.getByRole("button", { name: "Open a demo fixed deposit" }),
  ).toBeEnabled();
  expect(sent).toBe(1);
});
