import { expect, test } from "@playwright/test";

const ids = ["editorial", "ledger", "workbench", "timeline", "decision"];
const artifacts = process.env.ESTIMATOR_ARTIFACTS;

test.beforeEach(async ({ page }) => {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin !== "http://127.0.0.1:8810" ||
      url.pathname.startsWith("/api")
    )
      throw new Error(`Unexpected request: ${url.origin}${url.pathname}`);
    await route.continue();
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/build-estimator-variants");
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "nextjs-portal {display:none}" });
});

test("five complete variants show the common core scope and separate subscription/payroll budgets", async ({
  page,
}) => {
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.locator(".ci-review-section")).toHaveCount(5);
  await expect(page.locator(".ci-evidence")).toContainText("50%");
  for (const id of ids) {
    const section = page.locator(`#${id}`);
    await expect(section).toContainText("US$30M");
    await expect(section).toContainText("₹11,53,846");
    await expect(section).toContainText("US$2,400");
    await expect(section).toContainText("14–30 weeks");
    await expect(section.getByRole("slider")).toHaveCount(4);
    await expect(section.locator("input[type=range]")).toHaveCount(6);
    if (artifacts) await section.screenshot({ path: `${artifacts}/${id}.png` });
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("every five-month preset uses five billed months and preserves independent scenarios", async ({
  page,
}) => {
  for (const id of ids) {
    const section = page.locator(`#${id}`);
    await section
      .getByRole("button", { name: "5 months", exact: true })
      .click();
    await expect(section).toContainText("US$4,000");
    await expect(section).toContainText("₹25,00,000");
    await expect(
      section.getByRole("button", { name: "5 months", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  const first = page.locator("#editorial");
  await first.getByRole("button", { name: "10 weeks", exact: true }).click();
  await expect(first).toContainText("US$2,400");
  await expect(page.locator("#ledger")).toContainText("US$4,000");
});

test("keyboard sliders update real calculations and the review choice works", async ({
  page,
}) => {
  const section = page.locator("#workbench");
  const people = section.getByRole("slider", { name: /Full-time people/ });
  await people.focus();
  await page.keyboard.press("ArrowRight");
  await expect(people).toHaveValue("6");
  await expect(section).toContainText("₹13,84,615");
  await expect(section).toContainText("300");
  const codex = section.getByRole("slider", { name: /Codex accounts/ });
  await codex.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(section).toContainText("US$1,800");
  await section.getByText("Pay & optional API budget", { exact: true }).click();
  const api = section.getByRole("slider", { name: /Extra API/ });
  await api.focus();
  await page.keyboard.press("ArrowRight");
  await expect(section).toContainText("US$2,031");
  await section
    .getByRole("button", { name: "Choose this direction", exact: true })
    .click();
  await expect(page.locator(".ci-page-footer")).toContainText("Workbench");
  await expect(
    section.getByRole("button", { name: "Selected for discussion" }),
  ).toHaveAttribute("aria-pressed", "true");
});

for (const mode of ["mobile", "text200"] as const) {
  test(`${mode}: all five layouts reflow without clipped output or console errors`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mode === "mobile"
        ? { width: 390, height: 844 }
        : { width: 720, height: 450 },
    );
    if (mode === "text200")
      await page.addStyleTag({ content: "html:root {font-size:225%}" });
    for (const id of ids) {
      const section = page.locator(`#${id}`);
      await expect(section).toContainText("₹11,53,846");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        id,
      ).toBe(true);
      const clipped = await section
        .locator(
          "h3,h4,.ci-budget strong,.ci-workbench-total strong,.ci-decision-price strong",
        )
        .evaluateAll((elements) =>
          elements
            .filter((el) => el.scrollWidth > el.clientWidth + 1)
            .map((el) => el.textContent),
        );
      expect(clipped, id).toEqual([]);
      if (artifacts)
        await section.screenshot({ path: `${artifacts}/${id}-${mode}.png` });
    }
    expect(errors).toEqual([]);
  });
}
