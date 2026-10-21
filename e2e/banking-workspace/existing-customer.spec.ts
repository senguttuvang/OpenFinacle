import { expect, test } from "@playwright/test";
import type { Dashboard } from "../../src/platform/banking-workspace/domain/view";
import { choosePersona } from "../fixtures/persona";

test("existing customer: populated core account, transfer, service request and journey switch", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const state = async (): Promise<Dashboard> => {
    const response = await page.request.get("/api/dashboard");
    expect(response.status()).toBe(200);
    return response.json() as Promise<Dashboard>;
  };
  await page.goto("/demo");
  await expect(
    page.getByRole("button", { name: "Explore existing customer" }),
  ).toBeVisible();
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/session" &&
        response.request().method() === "POST",
      { timeout: 180000 },
    ),
    page.getByRole("button", { name: "Explore existing customer" }).click(),
  ]);
  expect(response.status(), await response.text()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Welcome back, Mira" }),
  ).toBeVisible({ timeout: 120000 });
  const initial = await state();
  expect(initial.bank.journey).toBe("existing");
  expect(initial.application).toBeNull();
  expect(initial.account?.status.active).toBe(true);
  expect(initial.account?.summary?.accountBalance).toBe(121300);
  expect(initial.account?.transactions).toHaveLength(4);
  expect(initial.beneficiaries[0].status).toBe("active");
  await page.screenshot({
    path: "test-results/existing-customer-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Hide balances" }).click();
  await expect(page.getByTestId("balance")).toHaveText("₹ ••••••");
  await page.getByRole("button", { name: "Show balances" }).click();
  await expect(page.getByTestId("balance")).toHaveText("₹1,21,300.00");

  const resumed = await page.request.post("/api/session", {
    data: { journey: "existing" },
  });
  expect(resumed.status()).toBe(200);
  expect(await resumed.json()).toMatchObject({
    bankId: initial.bank.id,
    resumed: true,
  });
  await page.reload();
  const afterReload = await state();
  expect(afterReload.account?.id).toBe(initial.account?.id);
  expect(afterReload.account?.summary?.accountBalance).toBe(121300);
  expect(afterReload.account?.transactions).toHaveLength(4);

  await page.getByRole("button", { name: "My accounts", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Everyday Savings", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "My profile", exact: true }).click();
  await expect(page.getByText("mira@example.test")).toBeVisible();
  await page
    .getByRole("button", { name: "Pay & transfer", exact: true })
    .click();
  await page.getByLabel("Amount (INR)").fill("500");
  await page.getByRole("button", { name: "Review & send money" }).click();
  await expect(
    page.getByText("Transfer completed. Your statement is up to date."),
  ).toBeVisible();
  expect((await state()).account?.summary?.accountBalance).toBe(120800);
  await page.getByRole("button", { name: "Statements", exact: true }).click();
  const csv = await page.request.get("/api/statement");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("120800");
  await page
    .getByRole("button", { name: "Request a debit card", exact: true })
    .click();
  await expect(page.getByLabel("I'd like to")).toHaveValue("debit_card");
  await page
    .getByRole("button", { name: "Submit request", exact: true })
    .click();
  await expect(page.getByText("Service request recorded.")).toBeVisible();
  await choosePersona(page, "officer");
  await expect(
    page.getByRole("status").filter({ hasText: "Switched to" }),
  ).toBeVisible();
  const staff = await state();
  expect(staff.recipient.summary?.accountBalance).toBe(5500);
  expect(staff.employer?.summary?.accountBalance).toBe(415000);
  expect(
    (staff.account?.summary?.accountBalance ?? 0) +
      (staff.recipient.summary?.accountBalance ?? 0) +
      (staff.employer?.summary?.accountBalance ?? 0),
  ).toBe(541300);
  await page
    .getByRole("button", { name: "Service requests", exact: true })
    .click();
  await page.getByRole("button", { name: "Record demo fulfilment" }).click();
  await expect(page.getByText("Demo fulfilment recorded.")).toBeVisible();
  await choosePersona(page, "customer");
  await expect(
    page.getByRole("status").filter({ hasText: "Switched to" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "My savings portfolio" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/existing-customer-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Pay & transfer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Make a payment" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await page.getByRole("button", { name: "Choose another journey" }).click();
  await expect(
    page.getByRole("button", { name: "Start your banking story" }),
  ).toBeVisible();
  expect((await page.request.get("/api/dashboard")).status()).toBe(401);
});
