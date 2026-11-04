import { expect, test } from "@playwright/test";
import { branchDayFixture } from "../../../src/demo/branch/branch-day-fixture";
import {
  type CashCountDetail,
  type CashCountEvent,
  cashDenominations,
} from "../../../src/platform/branch-operations/domain/cash-counts";
import { savedWorkspace } from "../../fixtures/workspace";

for (const width of [1440, 390])
  test(`cash declarations retain original reference across lost reply and reload at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    const data = savedWorkspace();
    data.role = "officer";
    const day = branchDayFixture();
    day.reviewFixture = false;
    let saved: CashCountDetail | null = null;
    const writes: unknown[] = [];
    await page.route("**/api/**", (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        path = url.pathname;
      if (path === "/api/dashboard") return route.fulfill({ json: data });
      if (path === "/api/branch") return route.fulfill({ json: day });
      if (path === "/api/telemetry-config") return route.fulfill({ json: {} });
      if (path === "/api/branch/cash-counts") {
        if (request.method() === "POST") {
          const body = request.postDataJSON();
          writes.push(body);
          const event: CashCountEvent = {
            id: "event-1",
            branchId: day.branchId,
            countId: "count-1",
            key: body.key,
            actor: "officer",
            action: "declare",
            version: 1,
            status: "submitted",
            snapshot: {
              ...body.command,
              source: "synthetic_declaration",
              currency: "INR",
              totalMinor: 400000,
            },
            note: body.command.note,
            createdAt: "2026-11-04T01:30:00.000Z",
          };
          saved = {
            branchId: day.branchId,
            record: event,
            history: [event],
            historyComplete: true,
            actions: ["withdraw"],
            confirmedEvent: event,
          };
          return route.fulfill({
            status: 503,
            json: { error: "Acknowledgement lost", uncertain: true },
          });
        }
        if (url.searchParams.has("key")) return route.fulfill({ json: saved });
        return route.fulfill({
          json: {
            branchId: day.branchId,
            observedAt: day.observedAt,
            limit: 100,
            limited: false,
            records: saved ? [saved.record] : [],
          },
        });
      }
      return route.fulfill({
        status: 404,
        json: { error: "Outside fixture", uncertain: false },
      });
    });
    const open = async () => {
      await page.goto("/overview");
      await page
        .getByRole("navigation", { name: "Branch day screens" })
        .getByRole("button", { name: "Daily control", exact: true })
        .click();
    };
    await open();
    const register = page.getByRole("region", {
      name: "Synthetic cash-count register",
    });
    await register
      .getByRole("button", { name: "New count declaration", exact: true })
      .click();
    await register
      .getByRole("textbox", { name: "Count box label", exact: true })
      .fill("Synthetic test teller");
    await register
      .getByRole("textbox", { name: "Declaration note", exact: true })
      .fill("Declared demo count");
    const quantities = register.getByRole("spinbutton");
    await quantities.first().fill("8");
    await expect(
      register.getByText("Incomplete", { exact: true }),
    ).toBeVisible();
    await expect(
      register.getByRole("button", {
        name: "Submit count declaration",
        exact: true,
      }),
    ).toBeDisabled();
    await register
      .getByRole("button", {
        name: "Mark remaining blanks as zero",
        exact: true,
      })
      .click();
    await quantities.first().focus();
    await page.keyboard.press("ArrowUp");
    await expect(quantities.first()).toHaveValue("9");
    await page.keyboard.press("ArrowDown");
    await page.locator(".branch-day").evaluate((el) => {
      (el as HTMLElement).style.fontSize = "200%";
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await register
      .getByRole("button", { name: "Submit count declaration", exact: true })
      .click();
    await expect(
      register.getByRole("complementary", { name: "Original count recovery" }),
    ).toBeVisible();
    expect(writes).toHaveLength(1);
    await open();
    await expect(
      register.getByRole("complementary", { name: "Original count recovery" }),
    ).toBeVisible();
    expect(writes).toHaveLength(1);
    await register
      .getByRole("button", {
        name: "Inspect original count reference",
        exact: true,
      })
      .click();
    await expect(
      register.getByRole("complementary", { name: "Original count recovery" }),
    ).toHaveCount(0);
    await expect(register.getByRole("status")).toContainText(
      "Confirmed original declare at version 1",
    );
    await expect(
      register.getByRole("article", { name: "Saved count detail" }),
    ).toContainText("submitted");
    await register
      .getByText("Saved declaration history", { exact: false })
      .click();
    await expect(
      register.getByText("Version 1 · declare · submitted", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          Object.keys(sessionStorage).filter((k) =>
            k.startsWith("openfinacle-count:"),
          ).length,
      ),
    ).toBe(0);
    expect(writes).toHaveLength(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    expect(cashDenominations).toHaveLength(10);
  });

test("restored request retries only its original key and malformed acknowledgement remains pending", async ({
  page,
}) => {
  const data = savedWorkspace();
  data.role = "officer";
  const day = branchDayFixture();
  day.reviewFixture = false;
  const original = {
    key: "restored-original",
    kind: "declare",
    command: {
      boxType: "vault",
      label: "Restored synthetic vault",
      countDate: "2026-01-01",
      quantities: cashDenominations.map((denominationMinor) => ({
        denominationMinor,
        quantity: 0,
      })),
      note: "Original",
    },
  };
  await page.addInitScript(
    ({ branch, original }) =>
      sessionStorage.setItem(
        `openfinacle-count:${branch}:officer`,
        JSON.stringify(original),
      ),
    { branch: day.branchId, original },
  );
  const posts: unknown[] = [];
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/dashboard") return route.fulfill({ json: data });
    if (url.pathname === "/api/branch") return route.fulfill({ json: day });
    if (url.pathname === "/api/telemetry-config")
      return route.fulfill({ json: {} });
    if (route.request().method() === "POST") {
      posts.push(route.request().postDataJSON());
      if (posts.length > 1)
        return route.fulfill({
          status: 409,
          json: { error: "Explicit stale version rejection", uncertain: false },
        });
      return route.fulfill({
        json: { branchId: day.branchId, confirmedEvent: { key: original.key } },
      });
    }
    return route.fulfill({
      status: 404,
      json: { error: "Not recorded at this read", uncertain: false },
    });
  });
  await page.goto("/overview");
  await page
    .getByRole("navigation", { name: "Branch day screens" })
    .getByRole("button", { name: "Daily control", exact: true })
    .click();
  const register = page.getByRole("region", {
    name: "Synthetic cash-count register",
  });
  await expect(register.getByRole("complementary")).toBeVisible();
  expect(posts).toEqual([]);
  await register
    .getByRole("button", {
      name: "Inspect original count reference",
      exact: true,
    })
    .click();
  await expect(register.getByRole("status")).toContainText(
    "Not recorded at this read",
  );
  await register
    .getByRole("button", { name: "Retry original count request", exact: true })
    .click();
  await expect(register.getByRole("status")).toContainText(
    "could not be verified",
  );
  expect(posts).toEqual([
    {
      customerId: day.relationships[0].customer.id,
      key: original.key,
      command: original.command,
    },
  ]);
  await expect(register.getByRole("complementary")).toBeVisible();
  await register
    .getByRole("button", { name: "Retry original count request", exact: true })
    .click();
  await expect(register.getByRole("status")).toContainText(
    "Explicit stale version rejection",
  );
  await expect(register.getByRole("complementary")).toHaveCount(0);
  expect(posts[1]).toEqual(posts[0]);
});
