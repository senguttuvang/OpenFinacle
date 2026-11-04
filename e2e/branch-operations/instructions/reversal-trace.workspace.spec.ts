import { expect, test } from "@playwright/test";
import { branchDayFixture } from "../../../src/demo/branch/branch-day-fixture";
import { savedWorkspace } from "../../fixtures/workspace";

const setup = () => {
  const day = branchDayFixture();
  day.reviewFixture = false;
  day.businessDate = "2026-11-04";
  const r = day.relationships[0],
    original = r.commands[0];
  original.id = "11111111-1111-4111-8111-111111111111";
  original.status = "posted";
  original.approver = "approver";
  original.amount_minor = 12525;
  original.core_id = 387;
  original.payload = JSON.stringify({ kind: "deposit", amount: 125.25 });
  const a = r.account;
  if (!a?.summary) throw Error("Fixture native account");
  a.summary.accountBalance = 0;
  a.transactions = [
    {
      id: 387,
      accountId: a.id,
      accountNo: a.accountNo,
      currency: { code: "INR", decimalPlaces: 2 },
      date: [2026, 11, 4],
      amount: 125.25,
      entryType: "CREDIT",
      reversed: true,
      transactionType: { value: "Deposit", deposit: true, withdrawal: false },
    },
  ];
  const reversal = {
    ...original,
    id: "22222222-2222-4222-8222-222222222222",
    key: "synthetic-reversal-key",
    kind: "reverse" as const,
    amount_minor: 0,
    core_id: a.id,
    payload: JSON.stringify({ kind: "reverse", originalId: original.id }),
  };
  r.commands.push(reversal);
  return { day, r, original, reversal, native: a.transactions[0] };
};
for (const width of [1440, 390])
  for (const role of ["officer", "approver"] as const)
    test(`owned reversal provenance replaces zero sentinel and duplicate request at ${width}px for ${role}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 950 });
      const f = setup(),
        data = savedWorkspace();
      data.role = role;
      const writes: string[] = [];
      await page.route("**/api/**", (route) => {
        const p = new URL(route.request().url()).pathname;
        if (route.request().method() !== "GET") {
          writes.push(p);
          return route.fulfill({
            status: 400,
            json: { error: "No write expected" },
          });
        }
        return route.fulfill({
          json:
            p === "/api/dashboard" ? data : p === "/api/branch" ? f.day : {},
        });
      });
      await page.goto("/overview");
      const root = page.locator(".branch-day");
      await root
        .getByRole("navigation", { name: "Branch day screens" })
        .getByRole("button", { name: "Transactions & approvals", exact: true })
        .click();
      await root
        .getByRole("combobox", {
          name: "Instruction state filter",
          exact: true,
        })
        .selectOption("all");
      await root
        .getByLabel("Search instructions, customer or Core reference")
        .fill(f.original.id);
      await root
        .getByRole("button", {
          name: new RegExp(`deposit · posted · ${f.original.id}`),
        })
        .click();
      const originalHeading = root.getByRole("heading", {
        name: `${f.r.customer.display_name} · ${f.original.id}`,
        exact: true,
      });
      await expect(originalHeading).toBeFocused();
      await expect(
        root.getByRole("button", {
          name: "Request controlled reversal",
          exact: true,
        }),
      ).toBeDisabled();
      const history = root.getByRole("region", {
        name: "Original cash instruction and reversal history",
      });
      await expect(history).toContainText("Native original transaction 387");
      await expect(history).toContainText("₹125.25");
      await expect(history).toContainText("Reversed");
      const openReverse = history.getByRole("button", {
        name: `Open cash reversal ${f.reversal.id}`,
        exact: true,
      });
      await openReverse.focus();
      await page.keyboard.press("Enter");
      const reverseHeading = root.getByRole("heading", {
        name: `${f.r.customer.display_name} · ${f.reversal.id}`,
        exact: true,
      });
      await expect(reverseHeading).toBeFocused();
      await expect(
        root.getByRole("status").filter({ hasText: "outside these filters" }),
      ).toBeVisible();
      const article = root.locator("article").filter({
        has: page.getByRole("heading", {
          name: `${f.r.customer.display_name} · ${f.reversal.id}`,
          exact: true,
        }),
      });
      const amount = article
        .locator("dt")
        .filter({ hasText: /^Instruction amount$/ });
      expect(
        await amount.evaluate((el) => el.nextElementSibling?.textContent),
      ).toContain("No separate monetary amount");
      expect(
        await amount.evaluate((el) => el.nextElementSibling?.textContent),
      ).not.toContain("₹0.00");
      await expect(
        article.getByText("Core response reference", { exact: true }),
      ).toBeVisible();
      await expect(article).toContainText(
        "not assumed to be a new transaction ID",
      );
      await expect(
        article.getByText("officer / approver", { exact: true }),
      ).toBeVisible();
      if (width === 390) {
        const before = await reverseHeading.evaluate((el) =>
          parseFloat(getComputedStyle(el).fontSize),
        );
        await page.evaluate(() => {
          const root = document.documentElement;
          root.style.fontSize = `${parseFloat(getComputedStyle(root).fontSize) * 2}px`;
        });
        const after = await reverseHeading.evaluate((el) =>
          parseFloat(getComputedStyle(el).fontSize),
        );
        expect(after).toBeCloseTo(before * 2, 1);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
      }
      const back = history.getByRole("button", {
        name: `Open original cash instruction ${f.original.id}`,
        exact: true,
      });
      await back.focus();
      await page.keyboard.press("Enter");
      await expect(originalHeading).toBeFocused();
      expect(writes).toEqual([]);
    });
test("eligible request preserves the original deterministic key across an explicit retry and never automatically repeats", async ({
  page,
}) => {
  const f = setup();
  f.r.commands = [f.original];
  f.native.reversed = false;
  const data = savedWorkspace();
  data.role = "officer";
  const requests: { key: string | null; body: unknown }[] = [];
  await page.route("**/api/**", (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/branch/instruction") {
      requests.push({
        key: route.request().headers()["idempotency-key"] ?? null,
        body: route.request().postDataJSON(),
      });
      return route.fulfill({
        status: 503,
        json: {
          error:
            "Synthetic response unavailable; inspect the original request.",
        },
      });
    }
    return route.fulfill({
      json: p === "/api/dashboard" ? data : p === "/api/branch" ? f.day : {},
    });
  });
  await page.goto("/overview");
  const root = page.locator(".branch-day");
  await root
    .getByRole("navigation", { name: "Branch day screens" })
    .getByRole("button", { name: "Transactions & approvals", exact: true })
    .click();
  await root
    .getByRole("combobox", { name: "Instruction state filter", exact: true })
    .selectOption("all");
  await root
    .getByLabel("Search instructions, customer or Core reference")
    .fill(f.original.id);
  await root
    .getByRole("button", {
      name: new RegExp(`deposit · posted · ${f.original.id}`),
    })
    .click();
  const button = root.getByRole("button", {
    name: "Request controlled reversal",
    exact: true,
  });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(root.getByRole("alert")).toContainText(
    "Synthetic response unavailable",
  );
  expect(requests).toHaveLength(1);
  await button.click();
  await expect(root.getByRole("alert")).toContainText(
    "Synthetic response unavailable",
  );
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  expect(requests[0].key).toBe(`branch-reverse-${f.original.id}`);
});
test("a foreign original payload cannot become linked financial evidence or cross-customer navigation", async ({
  page,
}) => {
  const f = setup();
  f.reversal.payload = JSON.stringify({
    kind: "reverse",
    originalId: f.day.relationships[1].commands[0].id,
  });
  const data = savedWorkspace();
  data.role = "officer";
  await page.route("**/api/**", (route) => {
    const p = new URL(route.request().url()).pathname;
    return route.fulfill({
      json: p === "/api/dashboard" ? data : p === "/api/branch" ? f.day : {},
    });
  });
  await page.goto("/overview");
  const root = page.locator(".branch-day");
  await root
    .getByRole("navigation", { name: "Branch day screens" })
    .getByRole("button", { name: "Transactions & approvals", exact: true })
    .click();
  await root
    .getByRole("combobox", { name: "Instruction state filter", exact: true })
    .selectOption("all");
  await root
    .getByLabel("Search instructions, customer or Core reference")
    .fill(f.reversal.id);
  await root
    .getByRole("button", {
      name: new RegExp(`reverse · posted · ${f.reversal.id}`),
    })
    .click();
  const history = root.getByRole("region", {
    name: "Original cash instruction and reversal history",
  });
  await expect(history).toContainText(
    "original posted cash instruction is unavailable or unverified",
  );
  await expect(history).toContainText(
    "Native original transaction amount/state unavailable",
  );
  await expect(history.getByRole("button")).toHaveCount(0);
  await expect(history).not.toContainText("₹125.25");
});

test("ambiguous reversal identifiers cannot become duplicate links or enable another request", async ({
  page,
}) => {
  const f = setup();
  f.r.commands.push({ ...f.reversal });
  const data = savedWorkspace();
  data.role = "officer";
  await page.route("**/api/**", (route) => {
    const p = new URL(route.request().url()).pathname;
    return route.fulfill({
      json: p === "/api/dashboard" ? data : p === "/api/branch" ? f.day : {},
    });
  });
  await page.goto("/overview");
  const root = page.locator(".branch-day");
  await root
    .getByRole("navigation", { name: "Branch day screens" })
    .getByRole("button", { name: "Transactions & approvals", exact: true })
    .click();
  await root
    .getByRole("combobox", { name: "Instruction state filter", exact: true })
    .selectOption("all");
  await root
    .getByLabel("Search instructions, customer or Core reference")
    .fill(f.original.id);
  await root
    .getByRole("button", {
      name: new RegExp(`deposit · posted · ${f.original.id}`),
    })
    .click();
  const history = root.getByRole("region", {
    name: "Original cash instruction and reversal history",
  });
  await expect(history).toContainText(
    "Reversal history is incomplete or invalid",
  );
  await expect(history.getByRole("button")).toHaveCount(0);
  await expect(
    root.getByRole("button", {
      name: "Request controlled reversal",
      exact: true,
    }),
  ).toBeDisabled();
});

test("static review fixtures cannot claim live native reversal provenance or request a Core effect", async ({
  page,
}) => {
  const f = setup();
  f.day.reviewFixture = true;
  f.r.commands = [f.original];
  f.native.reversed = false;
  const data = savedWorkspace();
  data.role = "officer";
  await page.route("**/api/**", (route) => {
    const p = new URL(route.request().url()).pathname;
    return route.fulfill({
      json: p === "/api/dashboard" ? data : p === "/api/branch" ? f.day : {},
    });
  });
  await page.goto("/overview");
  const root = page.locator(".branch-day");
  await root
    .getByRole("navigation", { name: "Branch day screens" })
    .getByRole("button", { name: "Transactions & approvals", exact: true })
    .click();
  await root
    .getByRole("combobox", { name: "Instruction state filter", exact: true })
    .selectOption("all");
  await root
    .getByLabel("Search instructions, customer or Core reference")
    .fill(f.original.id);
  await root
    .getByRole("button", {
      name: new RegExp(`deposit · posted · ${f.original.id}`),
    })
    .click();
  const history = root.getByRole("region", {
    name: "Original cash instruction and reversal history",
  });
  await expect(history).toContainText("STATIC REVIEW FIXTURE");
  await expect(history).not.toContainText("Native original transaction 387");
  await expect(
    root.getByRole("button", {
      name: "Request controlled reversal",
      exact: true,
    }),
  ).toBeDisabled();
});
