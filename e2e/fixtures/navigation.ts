import { expect, type Page } from "@playwright/test";
import { type View, viewLabels } from "../../app/navigation";

const sourceTargets: Partial<Record<View, readonly [string, string]>> = {
  overview: ["Overview", "My View"],
  accounts: ["Accounts", "Bank Accounts"],
  profile: ["Overview", "Personal Details"],
  transfer: ["Payment & Transfer", "Funds Transfer"],
  services: ["Customer Service", "Service Request"],
  deposits: ["Deposits", "Fixed Deposits"],
  loans: ["Loans", "My Loans"],
};

/** Navigate through the rendered customer hierarchy or the existing staff UI. */
export async function openWorkspace(page: Page, view: View) {
  const source = page.getByRole("navigation", {
    name: "Banking navigation",
    exact: true,
  });
  if (await source.isVisible()) {
    const target = sourceTargets[view];
    if (target) {
      const toggle = source.getByRole("button", {
        name: "Banking menu",
        exact: true,
      });
      if (
        (await toggle.isVisible()) &&
        (await toggle.getAttribute("aria-expanded")) !== "true"
      )
        await toggle.click();
      const parent = source.getByRole("button", {
        name: target[0],
        exact: true,
      });
      await parent.focus();
      if ((await parent.getAttribute("aria-expanded")) !== "true")
        await parent.press("Enter");
      await source
        .getByRole("button", { name: target[1], exact: true })
        .click();
      return;
    }
    await page
      .getByRole("navigation", { name: "Workspace shortcuts", exact: true })
      .getByRole("button", {
        name: view === "cards" ? "Debit cards" : viewLabels[view],
        exact: true,
      })
      .click();
    return;
  }
  const nav = page.getByRole("navigation", {
    name: "Main navigation",
    exact: true,
  });
  await expect(nav).toBeVisible();
  const label =
    view === "accounts"
      ? /^(Customer enquiry|My accounts)(\s|$)/
      : view === "profile"
        ? /^(Customer profile|My profile)(\s|$)/
        : new RegExp(
            `^${viewLabels[view].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`,
          );
  await nav.getByRole("button", { name: label }).click();
}
