import { expect, test } from "@playwright/test";
import { choosePersona } from "./fixtures/persona";
import { replacementWorkspace } from "./fixtures/replacements";

test("replacement retires its source, needs delivery, reconciles activation after reload and keeps distinct controls", async ({
  page,
}) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(10000);
  const saved = await replacementWorkspace(page);
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  const open = async () => {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await button("Cards").click({ timeout: 10000 });
    await button("Replacement requests").click();
  };
  const view = () => button("View CR-44444444").click();
  const instruction = async (action: string, note: string) => {
    await button(action).click();
    await page
      .getByLabel("Replacement instruction reason", { exact: true })
      .fill(note);
    await button("Review replacement instruction").click();
    await button(`Confirm ${action.toLowerCase()}`).click();
  };
  await page.goto("/");
  await open();
  await button("Request a demo replacement").click();
  await page
    .getByRole("textbox", {
      name: "Confirmed demo delivery address",
      exact: true,
    })
    .fill("short");
  await button("Review replacement application").click();
  await expect(
    page.getByRole("heading", {
      name: "Request a demo replacement card",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("textbox", {
      name: "Confirmed demo delivery address",
      exact: true,
    })
    .fill("24 Example Crescent\nExample Nagar 600001");
  await button("Review replacement application").click();
  await expect(
    page.getByRole("heading", { name: "Review demo replacement application" }),
  ).toBeFocused();
  await button("Edit replacement application").click();
  await expect(
    page.getByRole("textbox", {
      name: "Confirmed demo delivery address",
      exact: true,
    }),
  ).toHaveValue("24 Example Crescent\nExample Nagar 600001");
  await button("Review replacement application").click();
  await page.screenshot({
    path: "/tmp/finacle4-card-replacement-review-desktop.png",
  });
  await button("Submit replacement application").click();
  await expect(page.locator(".replacement-history li")).toHaveCount(1);
  await choosePersona(page, "officer");
  await open();
  await view();
  await expect(button("Issue demo replacement")).toHaveCount(0);
  await instruction(
    "Recommend replacement",
    "Synthetic source and delivery details reviewed",
  );
  await expect(page.locator(".replacement-history li")).toHaveCount(2);
  await choosePersona(page, "approver");
  await open();
  await view();
  await instruction(
    "Issue demo replacement",
    "Independent synthetic replacement issuance",
  );
  await expect(page.locator(".replacement-history li")).toHaveCount(3);
  expect(saved.cards()).toHaveLength(2);
  expect(saved.cards().find((card) => card.id === saved.sourceId)?.status).toBe(
    "blocked",
  );
  await choosePersona(page, "officer");
  await open();
  await view();
  await button("View replacement card controls").click();
  await expect(
    page.getByRole("heading", {
      name: "Awaiting demo activation",
      exact: true,
    }),
  ).toBeVisible();
  await expect(button("Resume card")).toHaveCount(0);
  await expect(button("Change controls")).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Selected demo card", exact: true })
    .selectOption(saved.sourceId);
  await expect(
    page.getByRole("heading", { name: "Permanently blocked", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".card-history li")).toHaveCount(2);
  await button("Replacement requests").click();
  await view();
  await instruction(
    "Record demo dispatch",
    "Synthetic dispatch recorded; no courier contacted",
  );
  await expect(page.locator(".replacement-history li")).toHaveCount(4);
  await instruction(
    "Record demo delivery",
    "Synthetic delivery recorded; customer activation pending",
  );
  await expect(page.locator(".replacement-history li")).toHaveCount(5);
  await choosePersona(page, "customer");
  await open();
  await view();
  await instruction(
    "Activate delivered demo card",
    "Customer activates only the delivered demo instrument",
  );
  await expect(
    page.getByRole("heading", {
      name: "Check your saved replacement instruction",
    }),
  ).toBeVisible();
  await expect.poll(saved.activationPosts).toBe(1);
  await page.reload();
  await open();
  await button("Check saved replacement instruction").click();
  await expect(page.locator(".replacement-history li")).toHaveCount(6);
  await expect(page.locator(".replacement-record")).toContainText(
    "Demo card activated",
  );
  await expect(button("Activate delivered demo card")).toHaveCount(0);
  expect(saved.activationPosts()).toBe(1);
  await button("View replacement card controls").click();
  await expect(
    page.getByRole("heading", { name: "Active", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Selected demo card", exact: true }),
  ).toHaveValue(`replacement:${saved.requestId}`);
  await button("Temporarily hold").click();
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Synthetic replacement temporarily held");
  await button("Review change").click();
  await button("Confirm card change").click();
  await expect(
    page.getByRole("heading", { name: "Temporarily held", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Selected demo card", exact: true })
    .selectOption(saved.sourceId);
  await expect(
    page.getByRole("heading", { name: "Permanently blocked", exact: true }),
  ).toBeVisible();
  await expect(button("Resume card")).toHaveCount(0);
  await expect(page.locator(".card-history li")).toHaveCount(2);
  await page
    .getByRole("combobox", { name: "Selected demo card", exact: true })
    .selectOption(`replacement:${saved.requestId}`);
  await button("Resume card").click();
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Resume only the distinct synthetic replacement");
  await button("Review change").click();
  await button("Confirm card change").click();
  await expect(
    page.getByRole("heading", { name: "Active", exact: true }),
  ).toBeVisible();
  await button("Change controls").click();
  await page.getByLabel("Online payments", { exact: true }).check();
  await page.getByLabel("Daily limit (₹)").fill("50000");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Enable synthetic online controls after activation");
  await button("Review change").click();
  await button("Confirm card change").click();
  await expect(page.locator(".card-history li")).toHaveCount(5);
  expect(saved.cards().find((card) => card.id === saved.sourceId)?.status).toBe(
    "blocked",
  );
  expect(
    saved.cards().find((card) => card.id === `replacement:${saved.requestId}`)
      ?.settings.online,
  ).toBe(true);
  await button("Replacement requests").click();
  await view();
  await button("Extra-large text").click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator(".replacement-record h3").first().scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "/tmp/finacle4-card-replacement-mobile-xl.png",
  });
  await page.setViewportSize({ width: 640, height: 900 });
  await page.addStyleTag({ content: "html { font-size: 36px !important; }" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(saved.financialWrites()).toBe(0);
});
