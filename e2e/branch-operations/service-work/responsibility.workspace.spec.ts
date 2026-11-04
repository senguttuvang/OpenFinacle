import { expect, test } from "@playwright/test";
import { responsibilityFixture } from "./responsibility.fixture";

test("a copied recovery reference from another case scope blocks every assignment instead of redirecting its original", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "openfinacle-case-responsibility:synthetic-adyar:customer-0:responsibility-case",
      JSON.stringify({
        branchId: "synthetic-adyar",
        customerId: "foreign-customer",
        requestId: "responsibility-case",
        key: "copied-original-reference",
        actor: "officer",
        command: {
          version: 0,
          owner: "manager",
          note: "Original assignment belongs to another customer",
        },
      }),
    ),
  );
  const f = await responsibilityFixture(page),
    panel = await f.open();
  await expect(panel.getByRole("alert")).toContainText(
    "Recovery storage cannot be verified",
  );
  await expect(
    panel.getByRole("button", {
      name: "Save service responsibility",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    panel.getByRole("button", {
      name: "Retry original assignment",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(f.state.posts).toHaveLength(0);
});

test("definite conflict releases its rejected original; fresh inspection and an explicit new assignment use a new key", async ({
  page,
}) => {
  const f = await responsibilityFixture(page),
    panel = await f.open();
  f.state.mode = "conflict";
  await panel.getByLabel("Responsible work viewpoint").selectOption("manager");
  await panel
    .getByLabel("Responsibility reason")
    .fill("Synthetic conflict responsibility");
  await panel
    .getByRole("button", { name: "Save service responsibility", exact: true })
    .click();
  await expect(panel).toContainText(
    "Synthetic changed responsibility; refresh",
  );
  await expect(
    panel.getByRole("button", {
      name: "Inspect original assignment",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(f.state.posts).toHaveLength(1);
  await panel
    .getByRole("button", {
      name: "Refresh responsibility history",
      exact: true,
    })
    .click();
  await expect(panel).toContainText(
    "Latest responsibility: Unassigned · version 0",
  );
  await panel.getByLabel("Responsible work viewpoint").selectOption("manager");
  await panel
    .getByLabel("Responsibility reason")
    .fill("New reviewed synthetic responsibility");
  await panel
    .getByRole("button", { name: "Save service responsibility", exact: true })
    .click();
  await expect(panel).toContainText(
    "Original assignment confirmed at version 1",
  );
  expect(f.state.posts).toHaveLength(2);
  expect(f.state.posts[0].key).not.toBe(f.state.posts[1].key);
});

test("bounded history keeps latest responsibility separate and disables changes after200 events", async ({
  page,
}) => {
  const f = await responsibilityFixture(page);
  for (let i = 0; i <= 200; i++)
    f.state.events.push({
      id: `historical-assignment-${i}`,
      branchId: f.day.branchId,
      customerId: f.customer.id,
      requestId: f.record.id,
      key: `historical-assignment-key-${i}`,
      actor: "officer",
      owner: i % 2 ? "manager" : "teller",
      note: "Historical synthetic service responsibility",
      expectedVersion: i,
      version: i + 1,
      createdAt: "2026-11-04T01:00:00.000Z",
    });
  const panel = await f.open();
  await expect(panel).toContainText(
    "Latest responsibility: teller · version 201",
  );
  await expect(panel.getByRole("alert")).toContainText(
    "Only the first 200 assignment events",
  );
  await expect(panel.locator("ol li")).toHaveCount(200);
  await expect(
    panel.getByRole("button", {
      name: "Save service responsibility",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(panel.getByLabel("Responsible work viewpoint")).toBeDisabled();
  expect(f.state.posts).toHaveLength(0);
});

test("static review fixture exposes no saved assignment history or action", async ({
  page,
}) => {
  const f = await responsibilityFixture(page);
  f.state.day.reviewFixture = true;
  await page.goto("/overview");
  await page
    .getByRole("navigation", { name: "Branch day screens" })
    .getByRole("button", { name: "Daily control", exact: true })
    .click();
  await expect(
    page.getByText(
      "STATIC REVIEW FIXTURE — service responsibility history is not connected.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Inspect service responsibility",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(f.state.reads).toBe(0);
  expect(f.state.posts).toHaveLength(0);
});

for (const role of ["officer", "approver"] as const)
  for (const width of [1440, 390])
    test(`service responsibility persists independently of case state across daily control and customer history ${role}/${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      const f = await responsibilityFixture(page, role);
      await page.goto("/overview");
      await page
        .getByRole("navigation", { name: "Branch day screens" })
        .getByRole("button", { name: "Daily control", exact: true })
        .click();
      expect(f.state.reads).toBe(0);
      const panel = page.getByRole("region", {
          name: `Service responsibility ${f.record.id}`,
          exact: true,
        }),
        inspect = panel.getByRole("button", {
          name: "Inspect service responsibility",
          exact: true,
        });
      await inspect.focus();
      await page.keyboard.press("Enter");
      await expect(panel).toContainText(
        "Latest responsibility: Unassigned · version 0",
      );
      await panel
        .getByLabel("Responsible work viewpoint", { exact: true })
        .selectOption("manager");
      await panel
        .getByLabel("Responsibility reason", { exact: true })
        .fill("Synthetic manager follow-up");
      const save = panel.getByRole("button", {
        name: "Save service responsibility",
        exact: true,
      });
      await save.focus();
      await page.keyboard.press("Enter");
      await expect(panel).toContainText(
        "Original assignment confirmed at version 1",
      );
      expect(f.state.posts).toHaveLength(1);
      expect(f.state.posts[0]).toMatchObject({
        customerId: f.customer.id,
        requestId: f.record.id,
        command: { version: 0, owner: "manager" },
      });
      await page.reload();
      await page
        .getByRole("navigation", { name: "Branch day screens" })
        .getByRole("button", { name: "Daily control", exact: true })
        .click();
      await panel
        .getByRole("button", {
          name: "Inspect service responsibility",
          exact: true,
        })
        .click();
      await expect(panel).toContainText(
        "Latest responsibility: manager · version 1",
      );
      await panel
        .getByLabel("Responsible work viewpoint", { exact: true })
        .selectOption("");
      await panel
        .getByLabel("Responsibility reason", { exact: true })
        .fill("Synthetic work explicitly unassigned");
      await save.click();
      await expect(panel).toContainText(
        "Latest responsibility: Unassigned · version 2",
      );
      await expect(panel.locator("ol li")).toHaveCount(2);
      if (width === 390) {
        const heading = panel.getByRole("heading", {
            name: "Service responsibility",
            exact: true,
          }),
          before = await heading.evaluate((el) =>
            parseFloat(getComputedStyle(el).fontSize),
          );
        await page.evaluate(() => {
          document.documentElement.style.fontSize = `${parseFloat(getComputedStyle(document.documentElement).fontSize) * 2}px`;
        });
        expect(
          await heading.evaluate((el) =>
            parseFloat(getComputedStyle(el).fontSize),
          ),
        ).toBeCloseTo(before * 2, 1);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
      }
      await page.getByRole("button", { name: /SR-.*email_change/ }).click();
      const history = page.getByRole("region", {
        name: "Customer service history",
      });
      await history.getByRole("button", { name: /email_change/ }).click();
      await panel
        .getByRole("button", {
          name: "Inspect service responsibility",
          exact: true,
        })
        .click();
      await expect(panel).toContainText(
        "Latest responsibility: Unassigned · version 2",
      );
      expect(f.record.status).toBe("open");
      expect(f.record.version).toBe(0);
      expect(f.state.writes).toEqual([]);
      expect(f.state.posts).toHaveLength(2);
    });

test("saved acknowledgement loss survives reload; original inspection confirms its event separately from newer responsibility without replay", async ({
  page,
}) => {
  const f = await responsibilityFixture(page),
    panel = await f.open();
  f.state.mode = "lost_ack";
  await panel.getByLabel("Responsible work viewpoint").selectOption("teller");
  await panel
    .getByLabel("Responsibility reason")
    .fill("Original synthetic teller responsibility");
  await panel
    .getByRole("button", { name: "Save service responsibility", exact: true })
    .click();
  await expect(panel).toContainText("Synthetic saved acknowledgement lost");
  const original = f.state.events[0];
  f.state.events.push({
    ...original,
    id: "assignment-event-2",
    key: "another-workflow-assignment",
    actor: "approver",
    owner: "accountant",
    expectedVersion: 1,
    version: 2,
    note: "Later independent synthetic responsibility",
  });
  await page.reload();
  const restored = await f.open();
  expect(f.state.posts).toHaveLength(1);
  await expect(restored).toContainText(
    "Latest responsibility: accountant · version 2",
  );
  await expect(
    restored.getByRole("button", {
      name: "Save service responsibility",
      exact: true,
    }),
  ).toBeDisabled();
  await restored
    .getByRole("button", { name: "Inspect original assignment", exact: true })
    .click();
  await expect(restored).toContainText(
    "Original assignment confirmed at version 1. Latest responsibility version 2.",
  );
  expect(f.state.posts).toHaveLength(1);
  await expect(
    restored.getByRole("button", {
      name: "Inspect original assignment",
      exact: true,
    }),
  ).toHaveCount(0);
});

test("missing original after unavailable dispatch retains its reference and explicit retry sends exactly the same key and payload", async ({
  page,
}) => {
  const f = await responsibilityFixture(page),
    panel = await f.open();
  f.state.mode = "lost_before_save";
  await panel.getByLabel("Responsible work viewpoint").selectOption("checker");
  await panel
    .getByLabel("Responsibility reason")
    .fill("Synthetic original checker assignment");
  await panel
    .getByRole("button", { name: "Save service responsibility", exact: true })
    .click();
  await expect(panel).toContainText("Synthetic unavailable acknowledgement");
  await page.reload();
  const restored = await f.open();
  await restored
    .getByRole("button", { name: "Inspect original assignment", exact: true })
    .click();
  await expect(restored).toContainText(
    "Original assignment not recorded at this read",
  );
  expect(f.state.posts).toHaveLength(1);
  await restored
    .getByRole("button", { name: "Retry original assignment", exact: true })
    .click();
  await expect(restored).toContainText(
    "Original assignment confirmed at version 1",
  );
  expect(f.state.posts).toHaveLength(2);
  expect(f.state.posts[1]).toEqual(f.state.posts[0]);
  expect(f.state.events).toHaveLength(1);
});

test("foreign acknowledgement and foreign enquiry withhold responsibility and retain recovery until exact source inspection", async ({
  page,
}) => {
  const f = await responsibilityFixture(page),
    panel = await f.open();
  f.state.mode = "foreign_confirmation";
  await panel.getByLabel("Responsible work viewpoint").selectOption("manager");
  await panel
    .getByLabel("Responsibility reason")
    .fill("Synthetic original manager assignment");
  await panel
    .getByRole("button", { name: "Save service responsibility", exact: true })
    .click();
  await expect(panel).toContainText(
    "Responsibility response could not be verified",
  );
  await expect(
    panel.getByText("Latest responsibility:", { exact: false }),
  ).toHaveCount(0);
  f.state.mode = "foreign_read";
  await panel
    .getByRole("button", {
      name: "Refresh responsibility history",
      exact: true,
    })
    .click();
  await expect(panel).toContainText(
    "Responsibility response could not be verified",
  );
  await expect(
    panel.getByRole("button", {
      name: "Save service responsibility",
      exact: true,
    }),
  ).toHaveCount(0);
  f.state.mode = "normal";
  await panel
    .getByRole("button", { name: "Inspect original assignment", exact: true })
    .click();
  await expect(panel).toContainText(
    "Original assignment confirmed at version 1",
  );
  expect(f.state.posts).toHaveLength(1);
});

test("unavailable recovery storage blocks dispatch before any responsibility write", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("openfinacle-case-responsibility:"))
        throw Error("Synthetic storage unavailable");
      return original.call(this, key, value);
    };
  });
  const f = await responsibilityFixture(page),
    panel = await f.open();
  await panel.getByLabel("Responsible work viewpoint").selectOption("teller");
  await panel
    .getByLabel("Responsibility reason")
    .fill("Synthetic unavailable storage assignment");
  await panel
    .getByRole("button", { name: "Save service responsibility", exact: true })
    .click();
  await expect(panel).toContainText("The assignment was not sent");
  expect(f.state.posts).toHaveLength(0);
  await expect(
    panel.getByRole("button", {
      name: "Save service responsibility",
      exact: true,
    }),
  ).toBeDisabled();
});

test("a different demo role can inspect pending responsibility but cannot retry the original actor's request", async ({
  page,
}) => {
  const f = await responsibilityFixture(page),
    panel = await f.open();
  f.state.mode = "lost_ack";
  await panel.getByLabel("Responsible work viewpoint").selectOption("teller");
  await panel
    .getByLabel("Responsibility reason")
    .fill("Original officer synthetic assignment");
  await panel
    .getByRole("button", { name: "Save service responsibility", exact: true })
    .click();
  await expect(panel).toContainText("Synthetic saved acknowledgement lost");
  f.state.data.role = "approver";
  await page.reload();
  const restored = await f.open();
  await expect(
    restored.getByRole("button", {
      name: "Retry original assignment",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(restored).toContainText(
    "Retry requires the original officer demo role",
  );
  await restored
    .getByRole("button", { name: "Inspect original assignment", exact: true })
    .click();
  await expect(restored).toContainText(
    "Original assignment confirmed at version 1",
  );
  expect(f.state.posts).toHaveLength(1);
});
