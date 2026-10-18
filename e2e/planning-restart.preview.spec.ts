import { expect, test } from "@playwright/test";
import { chooseOption } from "./fixtures/form-select";

test("server planning snapshots survive an actual Worker restart without reseeding", async ({
  page,
}) => {
  const relationship = process.env.PLANNING_RESTART_RELATIONSHIP ?? "";
  const version = Number(process.env.PLANNING_RESTART_VERSION ?? "");
  expect(
    relationship,
    "Run the persistence phase first, restart the local Worker, and supply its non-secret FINACLE5_RESTART_PROOF relationship.",
  ).toMatch(/^synthetic-preview-[a-z0-9-]{1,60}$/);
  expect(
    Number.isInteger(version) && version > 0,
    "Supply the exact persisted version captured before restart.",
  ).toBe(true);
  expect(
    (
      await page.request.post("/api/planning-preview/session", {
        data: { relationship, role: "customer" },
      })
    ).status(),
  ).toBe(200);
  const response = await page.request.get(
    `/api/planning?household=synthetic-nila&relationship=${relationship}`,
  );
  expect(response.status()).toBe(200);
  const record = (await response.json()) as {
    state: {
      version: number;
      budgets: { Dining: number };
      adviserConsent: boolean;
      scenarios: { name: string }[];
    };
    history: unknown[];
  };
  expect(record.state.version).toBe(version);
  expect(record.state.budgets.Dining).toBe(12300);
  expect(record.state.adviserConsent).toBe(false);
  expect(
    record.state.scenarios.some(
      (s) => s.name === "Server saved education alternative",
    ),
  ).toBe(true);
  expect(record.history).toHaveLength(version + 1);
  await page.addInitScript(() =>
    localStorage.setItem("openfinacle-planning-source", "shared"),
  );
  await page.goto("/planning");
  await expect(
    page.getByRole("heading", { name: "Household net worth" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Set up this synthetic household" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Cash flow", exact: true }).click();
  await chooseOption(
    page,
    page.getByLabel("Category", { exact: true }),
    "Dining",
  );
  await expect(page.getByLabel("Dining monthly budget INR")).toHaveValue("123");
});
