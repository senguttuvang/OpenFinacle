import { expect, type Page, test } from "@playwright/test";
import {
  emptyOnboarding,
  type OnboardingDraft,
} from "../src/domain/onboarding";
import { completedOnboarding } from "../tests/fixtures/onboarding";

const operationId = "c566af34-e49e-471e-aa84-97cf0d4f917a";
const record = (): OnboardingDraft => ({
  id: operationId,
  operationId,
  bankId: "independent-applicant",
  version: 0,
  step: 0,
  fields: emptyOnboarding,
  status: "draft",
  applicationStatus: null,
  account: null,
});
async function fixture(page: Page, initial: OnboardingDraft | null = null) {
  let saved = initial;
  let submissions = 0;
  let writes = 0;
  const documents: { name: string; kind: string }[] = [];
  let loseResponse = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/onboarding/start") {
      const input = request.postDataJSON();
      saved ??= {
        ...record(),
        id: input.operationId,
        operationId: input.operationId,
      };
      return route.fulfill({ json: saved });
    }
    if (path === "/api/onboarding")
      return route.fulfill(
        saved ? { json: saved } : { status: 404, json: { error: "No draft" } },
      );
    if (path === "/api/onboarding/draft" && saved) {
      writes++;
      const input = request.postDataJSON();
      expect(input.version).toBe(saved.version);
      saved = {
        ...saved,
        version: saved.version + 1,
        fields: input.fields,
        step: input.step,
      };
      return route.fulfill({ json: saved });
    }
    if (path === "/api/onboarding/submit" && saved) {
      expect(request.postDataJSON().operationId).toBe(saved.operationId);
      submissions++;
      saved = {
        ...saved,
        version: saved.version + 1,
        status: "submitted",
        applicationStatus: "submitted",
      };
      if (loseResponse) return route.abort("failed");
      return route.fulfill({ json: saved });
    }
    if (path === "/api/documents") {
      const content = request.postDataBuffer()?.toString() ?? "";
      const kind = content.includes('filename="Demo-onboarding-identity.txt"')
        ? "identity"
        : "address";
      documents.push({ name: `Demo-onboarding-${kind}.txt`, kind });
      return route.fulfill({ json: { id: kind } });
    }
    if (path === "/api/dashboard")
      return route.fulfill({ json: { documents } });
    return route.fulfill({ json: {} });
  });
  return {
    get saved() {
      return saved;
    },
    get submissions() {
      return submissions;
    },
    get writes() {
      return writes;
    },
    documents,
    loseNextSubmission() {
      loseResponse = true;
    },
    open() {
      if (saved)
        saved = {
          ...saved,
          applicationStatus: "approved",
          account: { id: 91, accountNo: "CORE-SYNTHETIC-91" },
        };
    },
  };
}
const next = (page: Page) =>
  page.getByRole("button", { name: "Save and continue", exact: true }).click();

test("seven-stage application validates, preserves edits and resume, confirms once and receives actual status", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/open-account");
  await page.getByRole("button", { name: "Start my application" }).click();
  await next(page);
  await expect(page.locator(".onboarding-error")).toContainText("highlighted");
  await page.getByLabel(/I confirm this fictional applicant/).check();
  await next(page);
  await page
    .getByLabel("Sample email", { exact: true })
    .fill("ananya@example.test");
  await page.getByLabel("Sample mobile contact").selectOption("DEMO-PHONE-01");
  await page
    .getByRole("button", { name: "Complete simulated contact check" })
    .click();
  await next(page);
  await page
    .getByLabel("Fictional full name", { exact: true })
    .fill("Demo Ananya Rao");
  await page.getByLabel("Sample date of birth").selectOption("1990-01-01");
  await next(page);
  await page
    .getByLabel("Fictional residential address")
    .fill("Demo 14 Sample Avenue");
  await page.getByLabel("City", { exact: true }).selectOption("Chennai");
  await page.getByLabel("Postal code").fill("600020");
  await page.getByLabel("Occupation").selectOption("Salaried");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("Fictional residential address")).toHaveValue(
    "Demo 14 Sample Avenue",
  );
  await next(page);
  await page.getByLabel("Add an adult sample nominee").check();
  await page.getByLabel("Fictional nominee name").fill("Demo Kavya Rao");
  await page
    .getByLabel("Relationship", { exact: true })
    .selectOption("Sibling");
  await next(page);
  await page.getByRole("button", { name: "Use sample identity pack" }).click();
  await expect(
    page.getByText(
      "Sample identity and address records saved for branch review",
    ),
  ).toBeVisible();
  expect(state.documents.map((document) => document.kind)).toEqual([
    "identity",
    "address",
  ]);
  await next(page);
  await page.getByRole("button", { name: "Edit Contact", exact: true }).click();
  await expect(page.getByLabel("Sample email", { exact: true })).toHaveValue(
    "ananya@example.test",
  );
  await next(page);
  await next(page);
  await next(page);
  await next(page);
  await next(page);
  await page.getByLabel(/I accept the demo savings terms/).check();
  await page.getByLabel(/I have reviewed this fictional application/).check();
  await page.getByRole("button", { name: "Review submission" }).click();
  expect(state.submissions).toBe(0);
  await expect(
    page.getByRole("region", { name: "Confirm application submission" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Send this application for review?" }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Confirm and submit application" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Submitted for identity review" }),
  ).toBeVisible();
  expect(state.submissions).toBe(1);
  expect(state.saved?.bankId).toBe("independent-applicant");
  await page.reload();
  await expect(
    page.getByText(state.saved?.operationId ?? "missing", { exact: true }),
  ).toBeVisible();
  state.open();
  await page.getByRole("button", { name: "Check opening status" }).click();
  await expect(
    page.getByRole("heading", { name: "Your savings account is open" }),
  ).toBeVisible();
  await expect(page.getByText("CORE-SYNTHETIC-91")).toBeVisible();
  expect(state.submissions).toBe(1);
  await page.screenshot({
    path: "test-results/onboarding-receipt.png",
    fullPage: true,
  });
});

test("lost submission response forces inspection and never sends replacement instruction", async ({
  page,
}) => {
  const state = await fixture(page, {
    ...record(),
    fields: completedOnboarding,
    step: 6,
  });
  state.loseNextSubmission();
  await page.goto("/open-account");
  await page.getByRole("button", { name: "Review submission" }).click();
  await page
    .getByRole("button", { name: "Confirm and submit application" })
    .click();
  await expect(
    page.getByRole("button", { name: "Inspect saved application" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review submission" }),
  ).toBeDisabled();
  expect(state.submissions).toBe(1);
  await page.getByRole("button", { name: "Inspect saved application" }).click();
  await expect(
    page.getByRole("heading", { name: "Submitted for identity review" }),
  ).toBeVisible();
  expect(state.submissions).toBe(1);
});

test("mobile, keyboard and extra-large text at 200 percent retain a usable single form column", async ({
  page,
}) => {
  await fixture(page, { ...record(), fields: completedOnboarding, step: 2 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/open-account");
  await expect(
    page.getByRole("heading", { name: "Personal details", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Extra-large text/ }).click();
  await page.screenshot({
    path: "test-results/onboarding-mobile.png",
    fullPage: true,
  });
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBe(false);
  await page.getByLabel("Fictional full name", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Sample date of birth")).toBeFocused();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("Sample email", { exact: true })).toHaveValue(
    "ananya@example.test",
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByLabel("Sample email", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/onboarding-desktop-200.png",
    fullPage: true,
  });
});

test("an old session-bound application is not silently replaced; a separate applicant requires explicit choice", async ({
  page,
}) => {
  const attempts: string[] = [];
  await page.addInitScript(() =>
    localStorage.setItem(
      "openfinacle-onboarding-operation",
      "old-session-operation-123456",
    ),
  );
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/onboarding")
      return route.fulfill({ status: 401, json: { error: "No session" } });
    if (path === "/api/onboarding/start") {
      const input = route.request().postDataJSON();
      attempts.push(input.operationId);
      if (input.operationId === "old-session-operation-123456")
        return route.fulfill({
          status: 403,
          json: {
            error: "This original application belongs to a different session.",
          },
        });
      return route.fulfill({
        json: {
          ...record(),
          id: input.operationId,
          operationId: input.operationId,
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/open-account");
  await page.getByRole("button", { name: "Start my application" }).click();
  await expect(
    page.getByRole("button", {
      name: "Start a separate sample application",
      exact: true,
    }),
  ).toBeVisible();
  expect(attempts).toEqual(["old-session-operation-123456"]);
  await page
    .getByRole("button", {
      name: "Start a separate sample application",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Savings account", exact: true }),
  ).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).not.toBe(attempts[0]);
});
