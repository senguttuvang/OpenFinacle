import { expect, test } from "@playwright/test";
import { chooseOption } from "../fixtures/form-select";

const title = "A working banking slice. An inspectable boundary.";

test("detailed report retains filters and scenarios without banking writes", async ({
  page,
}) => {
  const writes: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") writes.push(path);
    if (path === "/api/telemetry-config")
      return route.fulfill({ json: { release: "evidence-fixture" } });
    if (path === "/api/customers")
      return route.fulfill({ json: { customers: [] } });
    return route.fulfill({
      status: 401,
      json: { error: "No session", uncertain: false },
    });
  });
  await page.goto("/assessment");
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "What the selected scope contains" }),
  ).toBeInViewport();
  const matrix = page.getByRole("table", {
    name: /Selected capability comparison/,
  });
  await expect(matrix.locator("tbody tr")).toHaveCount(16);
  // The global banking table style uses tiny muted headers. Assessment rows
  // must retain readable names and contrast on the report's own surfaces.
  await expect(matrix.locator("tbody th").first()).toHaveCSS(
    "font-size",
    "18px",
  );
  await expect(matrix.locator("tbody th").first()).toHaveCSS(
    "color",
    "rgb(23, 43, 77)",
  );
  await expect(matrix.locator("thead th").first()).toHaveCSS(
    "color",
    "rgb(23, 43, 77)",
  );
  await chooseOption(
    page,
    page.getByRole("combobox", { name: "Capability area", exact: true }),
    "Bank controls",
  );
  await expect(matrix.locator("tbody tr")).toHaveCount(4);
  await chooseOption(
    page,
    page.getByRole("combobox", { name: "Implementation status", exact: true }),
    { label: "Proposed" },
  );
  await expect(
    page.getByText("No groups match these filters.", { exact: false }),
  ).toBeVisible();
  await expect(matrix.locator("tbody tr")).toHaveCount(0);
  await chooseOption(
    page,
    page.getByRole("combobox", { name: "Capability area", exact: true }),
    "All areas",
  );
  await expect(matrix.locator("tbody tr")).toHaveCount(3);
  await expect(matrix).toContainText("Customer AI harness / MCP");
  await chooseOption(
    page,
    page.getByRole("combobox", { name: "Implementation status", exact: true }),
    { label: "All statuses" },
  );

  const calculation = page.locator(".story-calculation");
  await expect(calculation).toContainText("250 person-days");
  await expect(calculation).toContainText("2,000 hours");
  await expect(calculation).toContainText("100B tokens");
  await expect(calculation).toContainText("2.00B / dev-week");
  await chooseOption(
    page,
    page.getByRole("combobox", { name: "Developers", exact: true }),
    "10",
  );
  await expect(calculation).toContainText("500 person-days");
  await expect(calculation).toContainText("1.00B / dev-week");
  await expect(page.locator(".evidence-allocation")).toContainText("150 days");
  await chooseOption(
    page,
    page.getByRole("combobox", { name: "Target scope", exact: true }),
    { label: "Build a broad core from scratch" },
  );
  await expect(calculation).toContainText("No credible ten-week commitment");
  await page
    .getByRole("button", { name: "Prepare a payment", exact: true })
    .click();
  await expect(page.locator(".evidence-agent-result")).toContainText(
    "customer confirmation",
  );
  await expect(page.locator(".evidence-agent-result")).toContainText(
    "uncertain outcome blocks further writes",
  );
  await page
    .getByRole("button", { name: "Read an account", exact: true })
    .click();
  await expect(page.locator(".evidence-agent-result")).toContainText(
    "A read grant cannot submit a payment",
  );

  for (const image of await page.locator(".story-gallery img").all()) {
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        image.evaluate(
          (element) =>
            element instanceof HTMLImageElement &&
            element.complete &&
            element.naturalWidth > 0,
        ),
      )
      .toBe(true);
  }
  await expect(page.locator(".story-gallery img")).toHaveCount(5);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("permanent assessment is session-independent and reflows with keyboard access to analytical tables", async ({
  page,
}) => {
  let apiRequests = 0;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.context().addCookies([
    {
      name: "of_session",
      value: "synthetic-assessment-test",
      url: test.info().project.use.baseURL as string,
    },
  ]);
  await page.route("**/api/**", (route) => {
    apiRequests++;
    return route.abort();
  });
  await page.goto("/assessment");
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.locator("#demo-entry a")).not.toBeInViewport();
  await page.screenshot({
    path: "test-results/evidence-desktop.png",
    fullPage: true,
  });
  for (const width of [390, 720, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const size of ["100%", "200%"]) {
      await page.evaluate((fontSize) => {
        document.documentElement.style.fontSize = fontSize;
      }, size);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${width}px / ${size} text must reflow`,
      ).toBe(true);
      const region = page.getByRole("region", {
        name: "Scrollable capability comparison",
      });
      await region.focus();
      await expect(region).toBeFocused();
      await page.keyboard.press("ArrowRight");
      if (width === 390 && size === "200%")
        await page.screenshot({
          path: "test-results/evidence-mobile-200.png",
          fullPage: true,
        });
    }
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "100%";
    document.body.style.zoom = "2";
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".evidence-stacked")).toHaveCSS(
    "animation-name",
    "none",
  );
  expect(apiRequests).toBe(0);
  expect(errors).toEqual([]);
});
