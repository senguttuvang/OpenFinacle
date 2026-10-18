import { expect, test } from "@playwright/test";
import type { Dashboard } from "../../src/platform/banking-workspace/domain/view";

for (const journey of ["new", "existing"] as const) {
  test(`${journey}: entry, reload and scenario return preserve data within three seconds`, async ({
    page,
  }) => {
    await page.goto("/");
    const button = page.getByRole("button", {
      name:
        journey === "new"
          ? "Start your banking story"
          : "Explore existing customer",
    });
    await expect(button).toBeEnabled();
    const started = performance.now();
    await button.click();
    const heading = page.getByRole("heading", {
      name:
        journey === "new" ? "Good things ahead, Mira." : "Welcome back, Mira",
    });
    await expect(heading).toBeVisible({ timeout: 3000 });
    const duration = performance.now() - started;
    expect(duration).toBeLessThan(3000);
    const initial = (await (
      await page.request.get("/api/dashboard")
    ).json()) as Dashboard;
    expect(initial.bank.journey).toBe(journey);
    expect(initial.core.cached).toBe(true);
    expect(initial.core.syncedAt).toBeGreaterThan(0);
    const reloaded = performance.now();
    await page.reload();
    await expect(heading).toBeVisible({ timeout: 3000 });
    expect(performance.now() - reloaded).toBeLessThan(3000);
    const after = (await (
      await page.request.get("/api/dashboard")
    ).json()) as Dashboard;
    expect(after.bank.id).toBe(initial.bank.id);
    expect(after.account?.id).toBe(initial.account?.id);
    expect(after.account?.summary?.accountBalance).toBe(
      initial.account?.summary?.accountBalance,
    );
    await page.getByRole("button", { name: "Choose another journey" }).click();
    await expect(button).toBeEnabled();
    const returned = performance.now();
    await button.click();
    await expect(heading).toBeVisible({ timeout: 3000 });
    expect(performance.now() - returned).toBeLessThan(3000);
    const resumed = (await (
      await page.request.get("/api/dashboard")
    ).json()) as Dashboard;
    expect(resumed.bank.id).toBe(initial.bank.id);
    if (initial.account)
      expect(resumed.account?.transactions).toHaveLength(
        initial.account.transactions?.length ?? 0,
      );
    else expect(resumed.account).toBeNull();
    console.info(
      `${journey} entry ${Math.round(duration)}ms; stable bank identity and saved core balances verified`,
    );
  });
}
