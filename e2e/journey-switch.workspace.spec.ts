import { expect, test } from "@playwright/test";
import { enlargeText } from "./fixtures/text-scale";
import { savedWorkspace } from "./fixtures/workspace";

for (const extraLarge of [false, true]) {
  test(`desktop journey switch remains reachable with ${extraLarge ? "extra-large" : "comfortable"} text`, async ({
    page,
  }) => {
    const data = savedWorkspace();
    let ended = 0;
    let financialWrites = 0;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route("**/api/**", (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/session/end") {
        ended++;
        return route.fulfill({ json: { ended: true } });
      }
      if (
        request.method() === "POST" &&
        !["/api/session", "/api/session/role"].includes(path)
      )
        financialWrites++;
      return route.fulfill({ json: path === "/api/dashboard" ? data : {} });
    });
    await page.goto("/");
    if (extraLarge) await enlargeText(page);
    const switcher = page.getByRole("button", {
      name: "Choose another journey",
      exact: false,
    });
    await switcher.click({ timeout: 5000 });
    await expect(
      page.getByRole("button", {
        name: "Start your banking story",
        exact: false,
      }),
    ).toBeVisible();
    expect(ended).toBe(1);
    expect(financialWrites).toBe(0);
  });
}
