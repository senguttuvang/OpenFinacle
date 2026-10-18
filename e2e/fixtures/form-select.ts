import { expect, type Locator, type Page } from "@playwright/test";

/** Exercise the portalled Radix options, never its hidden native form control. */
export async function chooseOption(
  page: Page,
  trigger: Locator,
  choice: string | { label: string },
) {
  await trigger.click();
  const option =
    typeof choice === "string"
      ? page
          .getByRole("option")
          .and(page.locator(`[data-value=${JSON.stringify(choice)}]`))
      : page.getByRole("option", { name: choice.label, exact: true });
  await option.click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
}
