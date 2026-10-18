import { expect, type Page, test } from "@playwright/test";
import type { Role } from "../src/domain/banking";
import type { Dashboard } from "../src/domain/view";
import { choosePersona } from "./fixtures/persona";

const changeRole = async (page: Page, role: Role) => {
  await choosePersona(page, role);
  await expect(
    page.getByRole("status").filter({ hasText: "Switched to" }),
  ).toBeVisible();
};
const snapshot = async (page: Page): Promise<Dashboard> => {
  const response = await page.request.get("/api/dashboard");
  expect(response.status()).toBe(200);
  return response.json() as Promise<Dashboard>;
};

test("customer to payday: documents, approvals, deposit, beneficiary, transfer, salary and statement", async ({
  page,
  browser,
}) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", {
      name: "Banking, seen from both sides.",
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/welcome-desktop.png",
    fullPage: true,
  });
  const [started] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/session" &&
        response.request().method() === "POST",
      { timeout: 120000 },
    ),
    page.getByRole("button", { name: "Start your banking story" }).click(),
  ]);
  expect(started.status(), await started.text()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Good things ahead, Mira." }),
  ).toBeVisible({ timeout: 120000 });
  console.info("Live proof: core-backed workspace ready");
  await page
    .getByRole("button", { name: "Account opening", exact: true })
    .click();
  await page.getByRole("button", { name: "Use sample documents" }).click();
  await expect(
    page.getByText("Two synthetic documents attached."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Submit application", exact: true })
    .click();
  await expect(
    page.getByText(
      "Application submitted. The bank officer can now review it.",
    ),
  ).toBeVisible();
  await changeRole(page, "officer");
  await page
    .getByRole("button", { name: "Account opening", exact: true })
    .click();
  await page.getByRole("button", { name: "Recommend opening" }).click();
  await expect(
    page.getByText("Application sent to the separate approver."),
  ).toBeVisible();
  const forbidden = await page.request.post("/api/application/review", {
    data: { decision: "approve", note: "Attempted self approval" },
  });
  expect(forbidden.status()).toBe(403);
  await changeRole(page, "approver");
  await page
    .getByRole("button", { name: "Account opening", exact: true })
    .click();
  await page.getByRole("button", { name: "Approve & open account" }).click();
  await expect(
    page.getByText("Account opened and activated in the banking core."),
  ).toBeVisible();
  expect((await snapshot(page)).account?.summary?.accountBalance).toBe(0);

  console.info("Live proof: customer account activated");

  await changeRole(page, "officer");
  await page
    .getByRole("button", { name: "Cash & salary", exact: true })
    .click();
  await page.getByLabel("Amount (INR)").fill("10000");
  await page.getByRole("button", { name: "Send for approval" }).click();
  await expect(
    page.getByText("Instruction sent to the separate approver."),
  ).toBeVisible();
  expect((await snapshot(page)).account?.summary?.accountBalance).toBe(0);
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page
    .getByRole("button", { name: "Review pending instruction" })
    .click();
  await expect(page.getByLabel("Demo persona")).toHaveText("Approver");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(
    page.getByText("Instruction posted. Account balances are updated."),
  ).toBeVisible();
  expect((await snapshot(page)).account?.summary?.accountBalance).toBe(10000);
  console.info("Live proof: approved deposit posted");

  await changeRole(page, "customer");
  await page
    .getByRole("button", { name: "Pay & transfer", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add beneficiary", exact: true })
    .click();
  await expect(
    page.getByText("Beneficiary added. Confirm with the demo code."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByText("Beneficiary verified and active."),
  ).toBeVisible();
  await page.getByLabel("Amount (INR)").fill("2500");
  await page.getByRole("button", { name: "Review & send money" }).click();
  await expect(
    page.getByText("Transfer completed. Your statement is up to date."),
  ).toBeVisible();
  const transferView = await snapshot(page);
  expect(transferView.account?.summary?.accountBalance).toBe(7500);
  const transfer = transferView.commands.find((c) => c.kind === "transfer");
  expect(transfer?.status).toBe("posted");
  const originalBody = JSON.parse(transfer?.payload ?? "{}");
  const replay = await page.request.post("/api/commands", {
    headers: { "Idempotency-Key": transfer?.key ?? "missing" },
    data: originalBody,
  });
  expect(replay.status()).toBe(200);
  expect((await snapshot(page)).account?.summary?.accountBalance).toBe(7500);
  console.info("Live proof: transfer and idempotent replay verified");
  const declined = await page.request.post("/api/commands", {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: {
      kind: "transfer",
      amount: 12000,
      beneficiaryId: transferView.beneficiaries[0].id,
      description: "Insufficient funds proof",
    },
  });
  expect(declined.status()).toBe(422);
  expect((await snapshot(page)).account?.summary?.accountBalance).toBe(7500);

  await changeRole(page, "officer");
  const officerView = await snapshot(page);
  expect(officerView.recipient.summary?.accountBalance).toBe(5000);
  await page
    .getByRole("button", { name: "Cash & salary", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Salary credit", exact: true })
    .click();
  await page.getByRole("button", { name: "Send for approval" }).click();
  await expect(
    page.getByText("Instruction sent to the separate approver."),
  ).toBeVisible();
  await changeRole(page, "approver");
  await page.getByRole("button", { name: /Approval inbox/ }).click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(
    page.getByText("Instruction posted. Account balances are updated."),
  ).toBeVisible();
  const paid = await snapshot(page);
  expect(paid.account?.summary?.accountBalance).toBe(92500);
  expect(paid.employer?.summary?.accountBalance).toBe(415000);
  console.info("Live proof: employer-funded salary verified");
  expect(
    paid.audit.some((event) => event.action === "Instruction posted"),
  ).toBe(true);
  await changeRole(page, "customer");
  await page.screenshot({
    path: "test-results/customer-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Statements", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: /₹92,500/ }).first(),
  ).toBeVisible();
  const csv = await page.request.get("/api/statement");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("92500");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.screenshot({
    path: "test-results/customer-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(browserErrors).toEqual([]);
  const first = await snapshot(page);
  const stranger = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  try {
    expect((await stranger.request.get("/api/dashboard")).status()).toBe(401);
    expect(
      (
        await stranger.request.post("/api/session", {
          data: { journey: "existing" },
        })
      ).status(),
    ).toBe(200);
    const isolated = await stranger.request.get("/api/dashboard");
    const second = (await isolated.json()) as Dashboard;
    expect(second.bank.id).not.toBe(first.bank.id);
    expect(second.bank.journey).toBe("existing");
    expect(second.account?.status.active).toBe(true);
    expect(second.recipient.id).not.toBe(first.recipient.id);
    expect(
      (
        await stranger.request.get(`/api/documents/${first.documents[0].id}`)
      ).status(),
    ).toBe(404);
    await stranger.request.post("/api/session/role", {
      data: { role: "approver" },
    });
    expect(
      (
        await stranger.request.post("/api/commands/approve", {
          data: { id: transfer?.id },
        })
      ).status(),
    ).toBe(404);
  } finally {
    await stranger.close();
  }

  const authorise = async (body: Record<string, unknown>) => {
    await page.request.post("/api/session/role", { data: { role: "officer" } });
    const created = await page.request.post("/api/commands", {
      headers: { "Idempotency-Key": crypto.randomUUID() },
      data: body,
    });
    expect(created.status()).toBe(200);
    const command = (await created.json()) as { id: string };
    await page.request.post("/api/session/role", {
      data: { role: "approver" },
    });
    const approved = await page.request.post("/api/commands/approve", {
      data: { id: command.id },
    });
    expect(approved.status(), await approved.text()).toBe(200);
    return command.id;
  };
  await authorise({ kind: "freeze", description: "Verify debit restriction" });
  expect((await snapshot(page)).account?.subStatus?.blockDebit).toBe(true);
  await page.request.post("/api/session/role", { data: { role: "customer" } });
  const blocked = await page.request.post("/api/commands", {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: {
      kind: "transfer",
      amount: 100,
      beneficiaryId: first.beneficiaries[0].id,
    },
  });
  expect(blocked.status()).toBe(422);
  expect((await snapshot(page)).account?.summary?.accountBalance).toBe(92500);
  await authorise({
    kind: "unfreeze",
    description: "Release debit restriction",
  });
  expect((await snapshot(page)).account?.subStatus?.blockDebit).toBe(false);
  const correctionId = await authorise({
    kind: "deposit",
    amount: 1000,
    description: "Cash correction proof",
  });
  const correctionView = await snapshot(page);
  expect(correctionView.account?.summary?.accountBalance).toBe(93500);
  const correction = correctionView.commands.find(
    (command) => command.id === correctionId,
  );
  expect(correction?.core_id).toBeDefined();
  await authorise({
    kind: "reverse",
    originalId: correctionId,
    description: "Reverse the cash correction proof",
  });
  const corrected = await snapshot(page);
  expect(corrected.account?.summary?.accountBalance).toBe(92500);
  expect(
    (corrected.account?.summary?.accountBalance ?? 0) +
      (corrected.recipient.summary?.accountBalance ?? 0) +
      (corrected.employer?.summary?.accountBalance ?? 0),
  ).toBe(512500);
  expect(
    corrected.account?.transactions?.find((t) => t.id === correction?.core_id)
      ?.reversed,
  ).toBe(true);
  await page.reload();
  expect((await snapshot(page)).account?.summary?.accountBalance).toBe(92500);
});
