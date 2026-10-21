import { expect, test } from "@playwright/test";
import { chooseOption } from "../fixtures/form-select";

test("magazine leads with capabilities, one bounded comparison, real inner stories and late original journeys", async ({
  page,
}) => {
  const writes: string[] = [];
  await page.route("**/api/**", (route) => {
    if (route.request().method() !== "GET")
      writes.push(new URL(route.request().url()).pathname);
    const path = new URL(route.request().url()).pathname;
    return path === "/api/customers"
      ? route.fulfill({ json: { customers: [] } })
      : path === "/api/telemetry-config"
        ? route.fulfill({ json: { release: "fixture" } })
        : route.fulfill({
            status: 401,
            json: { error: "No session", uncertain: false },
          });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Banking, seen from both sides." }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("table")).toHaveCount(1);
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(8);
  await expect(page.locator(".magazine")).not.toContainText(
    /342 tests|verification|validation|proof ledger|evidence checkpoint/i,
  );
  await expect(
    page.getByRole("link", {
      name: "Open the banking workspace",
      exact: true,
    }),
  ).not.toBeInViewport();
  await page.getByRole("button", { name: "Branch team", exact: true }).click();
  await expect(page.locator(".magazine-view-switch img")).toHaveAttribute(
    "src",
    "/product/branch.webp",
  );
  await page.getByRole("button", { name: "Customer", exact: true }).click();
  await expect(page.locator(".magazine-view-switch img")).toHaveAttribute(
    "src",
    "/product/statements.webp",
  );
  for (const href of ["/capabilities", "/roadmap", "/build-story"]) {
    const response = await page.request.get(href);
    expect(response.status()).toBe(200);
  }
  await page.goto("/discover");
  await page.locator("#demo-entry a").click();
  await expect(
    page.getByRole("button", {
      name: "Explore existing customer",
      exact: true,
    }),
  ).toBeInViewport();
  await page
    .getByRole("button", { name: "Explore existing customer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Choose an existing customer",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to journeys", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Start your banking story · Shared branch demo",
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open my first account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/open-account\/?$/);
  expect(writes).toEqual([]);
});

test("historical and six-team comparison updates costs, charts and optional impact without API calls", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/**", (route) => {
    requests++;
    return route.abort();
  });
  await page.goto("/discover#imagine");
  const a = page.getByRole("region", {
    name: "Team A · Human-led",
    exact: true,
  });
  const b = page.getByRole("region", {
    name: "Team B · AI-first",
    exact: true,
  });
  await expect(a).toContainText("₹12,92,308");
  await expect(a).toContainText("US$14");
  await expect(b).toContainText("US$1,800");
  await expect(page.locator(".comparison-six .comparison-chart")).toHaveCount(
    2,
  );
  await expect(
    page
      .locator(".comparison-six .comparison-chart")
      .first()
      .locator(".comparison-bar-row"),
  ).toHaveCount(6);
  await expect(page.locator(".comparison-timeline > div")).toHaveCount(6);
  await expect(page.locator(".comparison-history")).toContainText("US$60M+");
  await expect(
    page.locator(".comparison-results > .comparison-chart"),
  ).toContainText("₹1,310.4 crore");
  await a.getByRole("button", { name: "Mostly interns", exact: true }).click();
  await expect(a).toContainText("3 interns · 1 experienced · 1 expert");
  await expect(a).toContainText("₹11,30,769");
  await b
    .getByRole("button", { name: "Experienced / experts", exact: true })
    .click();
  await expect(b).toContainText("0 interns · 3 experienced · 2 experts");
  await expect(b).toContainText("₹20,76,923");
  await a.getByRole("button", { name: "Mixed talents", exact: true }).click();
  await b.getByRole("button", { name: "Mixed talents", exact: true }).click();
  await chooseOption(
    page,
    b.getByRole("combobox", { name: "AI companion", exact: true }),
    "opus",
  );
  await expect(b).toContainText("US$3,600");
  await b.getByRole("button", { name: "Low", exact: true }).click();
  await expect(b).toContainText("US$2,800");
  await b.getByRole("button", { name: "Medium", exact: true }).click();
  await page.locator("#comparison-weeks").fill("20");
  await expect(b).toContainText("US$7,200");
  await expect(
    page.getByRole("heading", { name: "What could fit in 20 weeks?" }),
  ).toBeVisible();
  await page.locator("#comparison-weeks").fill("10");
  await page
    .getByText("Model Finacle’s lifetime investment", { exact: true })
    .click();
  await page.locator("#history-engineers").fill("800");
  await expect(
    page.locator(".comparison-results > .comparison-chart"),
  ).toContainText("₹2,620.8 crore");
  await page
    .getByText("Pay, working days & hypothetical impact", { exact: true })
    .click();
  await page.locator("#comparison-benefit").fill("500000");
  await page.locator("#comparison-running").fill("100000");
  await expect(page.locator(".comparison-impact")).not.toContainText(
    "Scenario ROI",
  );
  await page.locator("#comparison-fx").fill("85");
  await expect(page.locator(".comparison-impact")).toContainText("₹15,98,308");
  await expect(page.locator(".comparison-impact")).toContainText(
    "Scenario ROI",
  );
  await page.locator("#comparison-fx").fill("1001");
  await expect(page.locator("#comparison-fx-error")).toBeVisible();
  await expect(page.locator(".comparison-impact")).toContainText("₹15,98,308");
  await page.locator("#comparison-running").fill("600000");
  await expect(page.locator(".comparison-impact")).toContainText(
    "No positive payback",
  );
  await chooseOption(
    page,
    page.getByRole("combobox", { name: "The starting line", exact: true }),
    "pilot",
  );
  await a.locator("summary").click();
  await a.locator("#A-experts").fill("0");
  await expect(page.locator(".delivery-a")).toContainText(
    "Expert capacity required",
  );
  await expect(page.locator(".delivery-a")).toContainText("No delivery range");
  await a.getByRole("button", { name: "Mostly interns", exact: true }).click();
  await a.locator("#A-size").fill("1");
  await expect(a).toContainText("1 intern · 0 experienced · 0 experts");
  await expect(a.locator(".comparison-team-total")).toContainText("₹69,231");
  await b.getByRole("button", { name: "USD budget", exact: true }).click();
  await b.locator("#B-budget").fill("0");
  await expect(page.locator(".delivery-b")).toContainText("Add AI usage");
  await b.locator("summary").click();
  await b.locator("#B-ai-share").fill("0");
  await expect(page.locator(".delivery-b")).not.toContainText(
    "No delivery range",
  );
  expect(requests).toBe(0);
});

test("magazine and estimator reflow with enlarged text, keyboard table scrolling and reduced motion", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/discover");
  const contrast = await page.locator("#imagine").evaluate((root) => {
    const rgb = (color: string) => (color.match(/[\d.]+/g) ?? []).map(Number);
    const luminance = (color: number[]) => {
      const c = [0, 1, 2].map((i) => {
        const n = (color[i] ?? 0) / 255;
        return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
      });
      return (c[0] ?? 0) * 0.2126 + (c[1] ?? 0) * 0.7152 + (c[2] ?? 0) * 0.0722;
    };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const pairs = new Map<string, number>();
    let node = walker.nextNode();
    while (node) {
      const element = node.parentElement;
      if (node.textContent?.trim() && element?.getClientRects().length) {
        let ancestor: Element | null = element,
          background = [255, 255, 255];
        while (ancestor) {
          const color = rgb(getComputedStyle(ancestor).backgroundColor);
          if (
            color.length >= 3 &&
            (color.length < 4 || (color[3] ?? 0) === 1)
          ) {
            background = color;
            break;
          }
          ancestor = ancestor.parentElement;
        }
        const foreground = rgb(getComputedStyle(element).color);
        const light = luminance(background),
          dark = luminance(foreground);
        pairs.set(
          `${foreground.join(",")}/${background.join(",")}`,
          (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05),
        );
      }
      node = walker.nextNode();
    }
    return {
      pairs: pairs.size,
      minimum: Math.min(...pairs.values()),
      failures: [...pairs].filter(([, ratio]) => ratio < 4.5),
    };
  });
  console.info(JSON.stringify({ estimatorContrast: contrast }));
  expect(contrast.failures).toEqual([]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".magazine-cover-screen")).toHaveCSS(
    "animation-name",
    "none",
  );
  await page.screenshot({
    path: "test-results/magazine-desktop.png",
    fullPage: true,
  });
  await page
    .locator(".comparison-teams")
    .screenshot({ path: "/tmp/finacle-comparison-teams-desktop.png" });
  await page
    .locator(".comparison-results")
    .screenshot({ path: "/tmp/finacle-comparison-charts-desktop.png" });
  for (const width of [390, 720, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const size of ["100%", "200%"]) {
      await page.evaluate((value) => {
        document.documentElement.style.fontSize = value;
      }, size);
      for (const step of [
        "People cost · INR",
        "Human effort · days",
        "Team size",
      ]) {
        await page.getByRole("button", { name: step, exact: true }).click();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${width}/${size}/${step}`,
        ).toBe(true);
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "100%";
  });
  const table = page.getByRole("region", {
    name: "Scrollable eight-area comparison",
  });
  await table.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => table.evaluate((e) => e.scrollLeft))
    .toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "People cost · INR", exact: true })
    .click();
  await page
    .locator("#imagine")
    .screenshot({ path: "test-results/magazine-estimator-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    document.body.style.zoom = "2";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
