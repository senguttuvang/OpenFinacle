import { expect, type Page, test } from "@playwright/test";

const household = "synthetic-nila";
const endpoint = (relationship: string) =>
  `/api/planning?household=${household}&relationship=${relationship}`;
const session = async (page: Page, relationship: string, role = "customer") => {
  const response = await page.request.post("/api/planning-preview/session", {
    data: { relationship, role },
  });
  expect(response.status()).toBe(200);
};
const open = async (page: Page) => {
  const relationship = `synthetic-preview-${crypto.randomUUID()}`;
  await session(page, relationship);
  await page.addInitScript(() =>
    localStorage.setItem("openfinacle-planning-source", "shared"),
  );
  await page.goto("/planning");
  await page
    .getByRole("button", { name: "Set up this synthetic household" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Household net worth" }),
  ).toBeVisible();
  return relationship;
};
const dining = async (page: Page) => {
  await page.getByRole("button", { name: "Cash flow", exact: true }).click();
  await page.getByLabel("Category", { exact: true }).selectOption("Dining");
};
test("real local D1 saves budgets and scenarios, permits only consented read-only review, and revokes access", async ({
  page,
}, testInfo) => {
  const relationship = await open(page);
  await dining(page);
  await page.getByLabel("Dining monthly budget INR").fill("123");
  await page.getByRole("button", { name: "Save budget", exact: true }).click();
  await expect(
    page.getByText("Saved on the planning server", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await dining(page);
  await expect(page.getByLabel("Dining monthly budget INR")).toHaveValue("123");
  await page.getByRole("button", { name: "Scenario lab", exact: true }).click();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await page
    .getByLabel("Scenario name", { exact: true })
    .fill("Server saved education alternative");
  await page
    .getByLabel("Education goal in today's rupees", { exact: false })
    .fill("2000000");
  await page.getByLabel("Plan through age", { exact: false }).fill("100");
  await page
    .getByRole("button", { name: "Save scenario v1", exact: true })
    .click();
  await expect(page.getByLabel("Saved scenario")).toContainText(
    "Server saved education alternative",
  );
  await expect(
    page.getByText("Baseline horizon ended", { exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Scenario lab", exact: true }).click();
  await expect(page.getByLabel("Saved scenario")).toContainText(
    "Server saved education alternative",
  );
  await session(page, relationship, "officer");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Household net worth" }),
  ).toHaveCount(0);
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "has not consented",
  );
  await session(page, relationship);
  await page.reload();
  await page
    .getByRole("button", { name: "Grant read-only planning review" })
    .click();
  await expect(
    page.getByRole("button", { name: "Revoke planning review consent" }),
  ).toBeVisible();
  await session(page, relationship, "officer");
  await page.reload();
  await expect(
    page.getByText("Consented planning review · read only", { exact: false }),
  ).toBeVisible();
  await dining(page);
  await expect(page.getByLabel("Dining monthly budget INR")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Save budget", exact: true }),
  ).toBeDisabled();
  const saved = await page.request.get(endpoint(relationship));
  const snapshot = (await saved.json()) as { state: unknown };
  expect(
    (
      await page.request.post(endpoint(relationship), {
        data: snapshot.state,
        headers: { "Idempotency-Key": crypto.randomUUID() },
      })
    ).status(),
  ).toBe(403);
  await session(page, relationship);
  await page.reload();
  await page
    .getByRole("button", { name: "Revoke planning review consent" })
    .click();
  await expect(
    page.getByRole("button", { name: "Grant read-only planning review" }),
  ).toBeVisible();
  await session(page, relationship, "officer");
  await page.reload();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "has not consented",
  );
  await session(page, relationship, "approver");
  await page.reload();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "does not grant planning access",
  );
  await session(page, relationship);
  await page.reload();
  const restartProof = (await (
    await page.request.get(endpoint(relationship))
  ).json()) as { state: { version: number } };
  console.log(
    `FINACLE5_RESTART_PROOF ${relationship} ${restartProof.state.version}`,
  );
  await expect(
    page.getByRole("heading", { name: "Household net worth" }),
  ).toBeVisible();
  const clippedLabels = await page
    .locator(".wp-chart svg")
    .first()
    .evaluate((svg) =>
      Array.from(svg.querySelectorAll("text"))
        .filter((text) => {
          const box = text.getBBox();
          return box.x < 0 || box.x + box.width > 700;
        })
        .map((text) => text.textContent),
    );
  expect(clippedLabels).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("planning-server-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Extra-large text", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("planning-server-mobile.png"),
    fullPage: false,
  });
});
test("lost committed response survives reload and inspects the same command without a second POST", async ({
  page,
}) => {
  const relationship = await open(page);
  const writes: string[] = [];
  let lose = true;
  await page.route("**/api/planning?**", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    writes.push(route.request().headers()["idempotency-key"] ?? "missing");
    if (!lose) return route.continue();
    lose = false;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    return route.abort("failed");
  });
  await dining(page);
  await page.getByLabel("Dining monthly budget INR").fill("321");
  await page.getByRole("button", { name: "Save budget", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Inspect the retained planning command",
    }),
  ).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Original command retained",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Inspect the retained planning command",
    }),
  ).toBeVisible();
  await session(page, relationship, "officer");
  await page.reload();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "has not consented",
  );
  await expect(
    page.getByRole("heading", {
      name: "Inspect the retained planning command",
    }),
  ).toHaveCount(0);
  await session(page, relationship);
  await page.reload();
  await page
    .getByRole("button", { name: "Inspect retained command", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Inspect the retained planning command",
    }),
  ).toHaveCount(0);
  await dining(page);
  await expect(page.getByLabel("Dining monthly budget INR")).toHaveValue("321");
  await expect(page.getByLabel("Dining monthly budget INR")).toBeEnabled();
  expect(writes).toHaveLength(1);
  const result = (await (
    await page.request.get(endpoint(relationship))
  ).json()) as { state: { version: number }; history: unknown[] };
  expect(result.state.version).toBe(1);
  expect(result.history).toHaveLength(2);
});
test("definitively unrecorded save retries original key and inputs once", async ({
  page,
}) => {
  const relationship = await open(page);
  const writes: string[] = [];
  let lose = true;
  await page.route("**/api/planning?**", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    writes.push(route.request().headers()["idempotency-key"] ?? "missing");
    if (!lose) return route.continue();
    lose = false;
    return route.abort("failed");
  });
  await dining(page);
  await page.getByLabel("Dining monthly budget INR").fill("456");
  await page.getByRole("button", { name: "Save budget", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Inspect the retained planning command",
    }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Inspect retained command", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Retry original command", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Inspect the retained planning command",
    }),
  ).toHaveCount(0);
  expect(writes).toHaveLength(2);
  expect(writes[0]).toBe(writes[1]);
  const result = (await (
    await page.request.get(endpoint(relationship))
  ).json()) as {
    state: { budgets: { Dining: number }; version: number };
    history: unknown[];
  };
  expect(result.state.budgets.Dining).toBe(45600);
  expect(result.state.version).toBe(1);
  expect(result.history).toHaveLength(2);
});
test("another relationship cannot see saved household plans or use an old context", async ({
  page,
}) => {
  const relationship = await open(page);
  const other = `synthetic-preview-${crypto.randomUUID()}`;
  await session(page, other);
  expect((await page.request.get(endpoint(relationship))).status()).toBe(409);
  expect((await page.request.get(endpoint(other))).status()).toBe(404);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Set up this synthetic household" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Household net worth" }),
  ).toHaveCount(0);
});
test("storage failure prevents sending a planning edit", async ({ page }) => {
  const relationship = await open(page);
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith("openfinacle-planning-command-v1:"))
        throw new Error("Synthetic injected quota failure");
      return set.call(this, key, value);
    };
  });
  await page.reload();
  const writes: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/planning"
    )
      writes.push(request.url());
  });
  await dining(page);
  await page.getByLabel("Dining monthly budget INR").fill("789");
  await page.getByRole("button", { name: "Save budget", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "storage is unavailable",
  );
  expect(writes).toEqual([]);
  const result = (await (
    await page.request.get(endpoint(relationship))
  ).json()) as { state: { version: number } };
  expect(result.state.version).toBe(0);
});

test("stale concurrent save cannot overwrite newer budgets and an inspected missing command can be discarded", async ({
  page,
}) => {
  const relationship = await open(page);
  await dining(page);
  const current = (await (
    await page.request.get(endpoint(relationship))
  ).json()) as { state: { budgets: Record<string, number> } };
  const external = await page.request.post(endpoint(relationship), {
    data: {
      ...current.state,
      budgets: { ...current.state.budgets, Dining: 90000 },
    },
    headers: { "Idempotency-Key": crypto.randomUUID() },
  });
  expect(external.status()).toBe(200);
  await page.getByLabel("Dining monthly budget INR").fill("999");
  await page.getByRole("button", { name: "Save budget", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "changed",
  );
  await page
    .getByRole("button", { name: "Inspect retained command", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Discard unrecorded command", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Inspect the retained planning command",
    }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Dining monthly budget INR")).toHaveValue("900");
  const result = (await (
    await page.request.get(endpoint(relationship))
  ).json()) as { state: { version: number }; history: unknown[] };
  expect(result.state.version).toBe(1);
  expect(result.history).toHaveLength(2);
});

test("unverified success retains original inputs until its actual server command is inspected", async ({
  page,
}) => {
  await open(page);
  const writes: string[] = [];
  await page.route("**/api/planning?**", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    writes.push(route.request().headers()["idempotency-key"] ?? "missing");
    const response = await route.fetch();
    const result = (await response.json()) as {
      state: Record<string, unknown>;
    };
    return route.fulfill({
      response,
      json: {
        ...result,
        state: { ...result.state, household: "synthetic-kaveri" },
      },
    });
  });
  await dining(page);
  await page.getByLabel("Dining monthly budget INR").fill("654");
  await page.getByRole("button", { name: "Save budget", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Original command retained",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Inspect retained command", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Inspect the retained planning command",
    }),
  ).toHaveCount(0);
  await dining(page);
  await expect(page.getByLabel("Dining monthly budget INR")).toHaveValue("654");
  expect(writes).toHaveLength(1);
});

test("budget copies and deletion persist without restoring synthetic defaults", async ({
  page,
}) => {
  const relationship = await open(page);
  const before = (await (
    await page.request.get(endpoint(relationship))
  ).json()) as { state: { budgets: Record<string, number> } };
  await dining(page);
  await page.getByText("Copy or delete this budget", { exact: true }).click();
  await page
    .getByLabel("Dining copy budget from", { exact: true })
    .selectOption("Groceries");
  await page
    .getByRole("button", { name: "Copy budget to Dining", exact: true })
    .click();
  await expect(page.getByLabel("Dining monthly budget INR")).toHaveValue(
    String(before.state.budgets.Groceries / 100),
  );
  await page.reload();
  await dining(page);
  await page.getByText("Copy or delete this budget", { exact: true }).click();
  await page
    .getByRole("button", { name: "Delete Dining budget", exact: true })
    .click();
  await expect(page.getByLabel("Dining monthly budget INR")).toHaveValue("");
  await page.reload();
  await dining(page);
  await expect(page.getByLabel("Dining monthly budget INR")).toHaveValue("");
  const after = (await (
    await page.request.get(endpoint(relationship))
  ).json()) as {
    state: { budgets: Record<string, number>; version: number };
    history: unknown[];
  };
  expect(after.state.budgets.Dining).toBeUndefined();
  expect(after.state.version).toBe(2);
  expect(after.history).toHaveLength(3);
});
