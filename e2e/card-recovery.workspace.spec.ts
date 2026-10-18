import { expect, type Page, test } from "@playwright/test";
import type { Card } from "../src/domain/cards";
import { chooseOption } from "./fixtures/form-select";
import { choosePersona } from "./fixtures/persona";
import { savedWorkspace } from "./fixtures/workspace";

const fixture = async (
  page: Page,
  options: {
    unopened?: boolean;
    failedList?: boolean;
    failedCards?: boolean;
    foreignCards?: boolean;
  } = {},
) => {
  page.setDefaultTimeout(10000);
  const data = savedWorkspace();
  if (options.unopened) data.account = null;
  const source: Card = {
    id: "demo-debit:synthetic-workspace",
    bank_id: data.bank.id,
    suffix: "4242",
    status: "active",
    version: 0,
    updated_at: "2026-10-17T09:00:00Z",
    settings: {
      atm: true,
      pos: true,
      online: false,
      contactless: false,
      international: false,
      daily_limit: 25000,
    },
  };
  const posts: { path: string; key: string; input: unknown }[] = [];
  const state = { missing: false };
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/session/role") {
      data.role = request.postDataJSON().role;
      return route.fulfill({ json: { role: data.role } });
    }
    if (request.method() === "POST") {
      posts.push({
        path: url.pathname,
        key: request.headers()["idempotency-key"] ?? "",
        input: request.postDataJSON(),
      });
      return route.fulfill({ json: { replacement: { id: "unverified" } } });
    }
    if (url.pathname === "/api/card-replacements") {
      if (url.searchParams.has("key"))
        return route.fulfill(
          state.missing
            ? {
                status: 404,
                json: { error: "No recorded replacement instruction" },
              }
            : { json: { replacement: { id: "unverified" } } },
        );
      return route.fulfill(
        options.failedList
          ? {
              status: 503,
              json: { error: "Replacement list temporarily unavailable" },
            }
          : { json: { replacements: [] } },
      );
    }
    if (url.pathname === "/api/cards") {
      if (url.searchParams.has("key"))
        return route.fulfill({
          status: 404,
          json: { error: "No recorded card command" },
        });
      if (options.failedCards)
        return route.fulfill({
          status: 503,
          json: { error: "Card list temporarily unavailable" },
        });
      if (url.searchParams.has("id"))
        return route.fulfill({
          json: { card: source, history: [], actions: [], confirmed_key: null },
        });
      return route.fulfill({
        json: {
          cards: options.unopened
            ? []
            : [
                {
                  ...source,
                  bank_id: options.foreignCards
                    ? "another-relationship"
                    : source.bank_id,
                },
              ],
        },
      });
    }
    return route.fulfill({
      json: url.pathname === "/api/dashboard" ? data : {},
    });
  });
  return { data, source, posts, state };
};
const open = async (page: Page, navigate = true) => {
  if (navigate) await page.goto("/");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.getByRole("button", { name: "Cards", exact: true }).click();
  await page
    .getByRole("button", { name: "Replacement requests", exact: true })
    .click();
};
const review = async (page: Page) => {
  await page
    .getByRole("button", { name: "Request a demo replacement", exact: true })
    .click();
  await page
    .getByRole("textbox", {
      name: "Confirmed demo delivery address",
      exact: true,
    })
    .fill("24 Example Crescent, Example Nagar 600001");
  await page
    .getByRole("button", {
      name: "Review replacement application",
      exact: true,
    })
    .click();
};

test("replacement storage failure prevents POST and preserves the reviewed address", async ({
  page,
}) => {
  const saved = await fixture(page);
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("openfinacle:replacement-command:"))
        throw new Error("Injected storage failure");
      return original.call(this, key, value);
    };
  });
  await open(page);
  await review(page);
  await page
    .getByRole("button", {
      name: "Submit replacement application",
      exact: true,
    })
    .click();
  await expect(
    page.locator(".replacement-workspace").getByRole("alert"),
  ).toContainText("could not be stored or read");
  await expect(page.locator(".replacement-form .detail-grid")).toContainText(
    "24 Example Crescent",
  );
  expect(saved.posts).toHaveLength(0);
});

test("malformed replacement responses remain locked across reload; only a missing key permits original retry and discard", async ({
  page,
}) => {
  const saved = await fixture(page);
  await open(page);
  await review(page);
  await page
    .getByRole("button", {
      name: "Submit replacement application",
      exact: true,
    })
    .click();
  const inspect = page.getByRole("button", {
    name: "Check saved replacement instruction",
    exact: true,
  });
  await expect(inspect).toBeVisible();
  await expect.poll(() => saved.posts.length).toBe(1);
  await page.reload();
  await open(page, false);
  await inspect.click();
  await expect(
    page.locator(".replacement-workspace").getByRole("alert"),
  ).toContainText("could not be verified");
  await expect(
    page.getByRole("button", {
      name: "Retry original replacement instruction",
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Request a demo replacement",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Extra-large text", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await inspect.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/finacle4-card-recovery-mobile-xl.png" });
  saved.state.missing = true;
  await inspect.click();
  await page
    .getByRole("button", { name: "Retry original replacement instruction" })
    .click();
  await expect.poll(() => saved.posts.length).toBe(2);
  expect(saved.posts[1]).toEqual(saved.posts[0]);
  await expect(
    page.getByRole("button", {
      name: "Discard unrecorded replacement instruction",
    }),
  ).toHaveCount(0);
  await inspect.click();
  await page
    .getByRole("button", { name: "Discard unrecorded replacement instruction" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Check your saved replacement instruction",
    }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      (bankId) =>
        sessionStorage.getItem(`openfinacle:replacement-command:${bankId}`),
      saved.data.bank.id,
    ),
  ).toBeNull();
});

test("a replacement pending key survives a failed list and another role cannot retry it", async ({
  page,
}) => {
  const saved = await fixture(page, { failedList: true });
  saved.state.missing = true;
  await page.addInitScript(
    ({ bankId, sourceId }) => {
      sessionStorage.setItem(
        `openfinacle:replacement-command:${bankId}`,
        JSON.stringify({
          key: "pending-replacement-example",
          role: "customer",
          instruction: {
            kind: "submit",
            input: {
              source_card_id: sourceId,
              source_version: 0,
              reason: "damaged",
              address: "24 Example Crescent, Example Nagar 600001",
            },
          },
        }),
      );
    },
    { bankId: saved.data.bank.id, sourceId: saved.source.id },
  );
  await open(page);
  await expect(
    page.locator(".replacement-workspace").getByRole("alert"),
  ).toContainText("Replacement list temporarily unavailable");
  await page
    .getByRole("button", {
      name: "Check saved replacement instruction",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Retry original replacement instruction",
    }),
  ).toBeEnabled();
  await choosePersona(page, "officer");
  await open(page, false);
  await page
    .getByRole("button", {
      name: "Check saved replacement instruction",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Retry original replacement instruction",
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Check your saved replacement instruction",
    }),
  ).toBeVisible();
  expect(saved.posts).toHaveLength(0);
});

test("lost source guidance opens its controls without submitting or automatically blocking", async ({
  page,
}) => {
  const saved = await fixture(page);
  await open(page);
  await page
    .getByRole("button", { name: "Request a demo replacement", exact: true })
    .click();
  await chooseOption(
    page,
    page.getByRole("combobox", { name: "Replacement reason", exact: true }),
    "lost",
  );
  await page
    .getByRole("textbox", {
      name: "Confirmed demo delivery address",
      exact: true,
    })
    .fill("24 Example Crescent, Example Nagar 600001");
  await expect(
    page.getByRole("button", {
      name: "Review replacement application",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Open source card controls", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Active", exact: true }),
  ).toBeVisible();
  expect(saved.posts).toHaveLength(0);
});

test("unopened relationships get account opening instead of replacement origination", async ({
  page,
}) => {
  const saved = await fixture(page, { unopened: true });
  await open(page);
  await expect(
    page.getByRole("heading", {
      name: "Open an account before requesting a replacement",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Request a demo replacement",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .locator(".replacement-workspace")
    .getByRole("button", { name: "Account opening", exact: true })
    .click();
  await expect(page.locator(".replacement-workspace")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /account/i }).first(),
  ).toBeVisible();
  expect(saved.posts).toHaveLength(0);
});

test("card controls restore a pending command before a failed card list read", async ({
  page,
}) => {
  const saved = await fixture(page, { failedCards: true });
  await page.addInitScript(
    ({ bankId, sourceId }) =>
      sessionStorage.setItem(
        `openfinacle:card-command:${bankId}`,
        JSON.stringify({
          key: "pending-card-example",
          role: "customer",
          input: {
            id: sourceId,
            version: 0,
            action: "hold",
            note: "Synthetic pending hold",
          },
        }),
      ),
    { bankId: saved.data.bank.id, sourceId: saved.source.id },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Cards", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Check your saved instruction",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Check saved command", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Retry original instruction",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Change controls", exact: true }),
  ).toHaveCount(0);
  expect(saved.posts).toHaveLength(0);
});

test("foreign card lists fail closed before displaying controls", async ({
  page,
}) => {
  const saved = await fixture(page, { foreignCards: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Cards", exact: true }).click();
  await expect(
    page.locator(".card-workspace").getByRole("alert"),
  ).toContainText("different relationship");
  await expect(
    page.getByRole("button", { name: "Change controls", exact: true }),
  ).toHaveCount(0);
  expect(saved.posts).toHaveLength(0);
});
