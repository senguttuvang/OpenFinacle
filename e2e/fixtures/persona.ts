import type { Page } from "@playwright/test";
import type { Role } from "../../src/platform/banking-workspace/domain/banking";

export async function choosePersona(page: Page, role: Role) {
  const label = {
    customer: "Customer",
    officer: "Bank officer",
    approver: "Approver",
  }[role];
  await page.getByRole("combobox", { name: "Demo persona" }).click();
  await page.getByRole("option", { name: label, exact: true }).click();
}
