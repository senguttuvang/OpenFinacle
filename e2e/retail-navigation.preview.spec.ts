import { chromium, expect, test } from "@playwright/test";
import source from "../specs/010-icici-navigation/source-inventory.json" with {
  type: "json",
};
import { enlargeText } from "./fixtures/text-scale";

test("all nine source families and 44 destinations work without bank traffic", async ({
  page,
}, testInfo) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))
      external.push(request.url());
  });
  await page.goto("/navigation-preview");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  for (const family of source.families) {
    const trigger = nav.getByRole("button", {
      name: family.label,
      exact: true,
    });
    await trigger.hover();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    for (const child of family.children)
      await expect(
        nav.getByRole("button", { name: child.label, exact: true }).or(
          nav.getByRole("button", {
            name: `${child.label} Not available in demo`,
            exact: true,
          }),
        ),
      ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`${family.id}-desktop.png`),
    });
    for (const child of family.children) {
      // Open with keyboard/click as well as hover: repeating the same family must work.
      await trigger.focus();
      if ((await trigger.getAttribute("aria-expanded")) !== "true")
        await trigger.press("Enter");
      const leaf = page
        .locator(`[id="${await trigger.getAttribute("aria-controls")}"]`)
        .locator(".retail-menu-leaf")
        .filter({
          has: page.locator("span", {
            hasText: new RegExp(
              `^${child.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            ),
          }),
        });
      await leaf.click();
      await expect(
        page
          .getByRole("main")
          .getByRole("heading", { name: child.label, exact: true }),
      ).toBeVisible();
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
    }
  }
  expect(external).toEqual([]);
});

test("keyboard arrows, Escape, Tab, outside click and pointer leave dismiss safely", async ({
  page,
}) => {
  await page.goto("/navigation-preview");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  const accounts = nav.getByRole("button", { name: "Accounts", exact: true });
  await accounts.focus();
  await page.keyboard.press("ArrowDown");
  const payments = nav.getByRole("button", {
    name: "Payment & Transfer",
    exact: true,
  });
  await expect(payments).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(
    nav.getByRole("link", { name: "Funds Transfer", exact: true }),
  ).toBeFocused();
  await page.mouse.move(1200, 900);
  await expect(payments).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("End");
  await expect(
    nav.getByRole("link", {
      name: "Wire Transfer Not available in demo",
      exact: true,
    }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    nav.getByRole("link", { name: "Funds Transfer", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(payments).toBeFocused();
  await expect(payments).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(payments).toBeFocused();
  await expect(payments).toHaveAttribute("aria-expanded", "false");
  await payments.hover();
  await payments.click();
  await expect(payments).toHaveAttribute("aria-expanded", "true");
  await page
    .getByRole("heading", { name: "Banking navigation preview" })
    .click();
  await expect(payments).toHaveAttribute("aria-expanded", "false");
  await accounts.hover();
  await page.mouse.move(1200, 900);
  await expect(accounts).toHaveAttribute("aria-expanded", "false");
  const last = nav.getByRole("button", {
    name: "Customer Service",
    exact: true,
  });
  await last.focus();
  await last.press("Enter");
  await page.keyboard.press("Tab"); // close button
  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  await expect(last).toHaveAttribute("aria-expanded", "false");
  await page.getByLabel("Banking request in progress").check();
  await expect(accounts).toBeDisabled();
});

test("stationary pointer cannot replace a keyboard-opened family after layout changes", async ({
  page,
}, testInfo) => {
  const events: string[] = [];
  page.on("console", (message) => {
    if (message.text().startsWith("navigation-input:"))
      events.push(message.text());
  });
  await page.goto("/navigation-preview");
  const nav = page.getByRole("navigation", {
    name: "Main navigation",
    exact: true,
  });
  await nav.evaluate((element) => {
    for (const kind of ["pointerenter", "pointermove", "keydown"])
      element.addEventListener(
        kind,
        (event) => {
          const target = event.target;
          const family =
            target instanceof Element
              ? target
                  .closest(".retail-menu-family")
                  ?.getAttribute("data-family")
              : null;
          if (
            family !== null &&
            family !== undefined &&
            (kind !== "pointerenter" ||
              (target instanceof Element &&
                target.matches(".retail-menu-family")))
          )
            console.info(
              `navigation-input:${event.type}:${family}:${event instanceof PointerEvent ? `${event.clientX},${event.clientY}` : event instanceof KeyboardEvent ? event.key : ""}`,
            );
        },
        true,
      );
  });
  const service = nav.getByRole("button", {
    name: "Customer Service",
    exact: true,
  });
  const loans = nav.getByRole("button", { name: "Loans", exact: true });
  const firstLoan = nav.getByRole("button", { name: "My Loans", exact: true });
  try {
    await service.hover();
    const box = await service.boundingBox();
    if (!box) throw Error("Visible customer service trigger required");
    const cursor = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await loans.focus();
    await loans.press("Enter");
    await expect(loans).toBeFocused();
    await expect(firstLoan).toBeVisible();
    await nav.evaluate((element) => {
      element.style.transform = "translateX(1800px)";
    });
    await page.mouse.move(cursor.x, cursor.y);
    // Let the browser update hit testing and the authored leave timer, without
    // generating another mouse move over the newly positioned rail.
    await page.waitForTimeout(250);
    await nav.evaluate((element) => {
      element.style.transform = "";
    });
    await page.mouse.move(cursor.x, cursor.y);
    await page.waitForTimeout(250);
    expect(
      events.filter((event) =>
        event.startsWith("navigation-input:pointerenter:8:"),
      ).length,
    ).toBeGreaterThanOrEqual(2);
    await expect(loans).toHaveAttribute("aria-expanded", "true");
    await expect(loans).toBeFocused();
    await expect(firstLoan).toBeVisible();
    await expect(service).toHaveAttribute("aria-expanded", "false");
    // Role/customer transitions create a new rail while the pointer stays put.
    await page
      .getByRole("button", { name: "Restart menu preview", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await loans.focus();
    await loans.press("Enter");
    await page.mouse.move(cursor.x, cursor.y);
    await page.waitForTimeout(250);
    await expect(loans).toHaveAttribute("aria-expanded", "true");
    await expect(loans).toBeFocused();
    await expect(firstLoan).toBeVisible();
    await expect(service).toHaveAttribute("aria-expanded", "false");
    await page.mouse.move(1200, 900);
    await service.hover();
    await expect(service).toHaveAttribute("aria-expanded", "true");
  } finally {
    await testInfo.attach("native-input-events", {
      body: events.join("\n"),
      contentType: "text/plain",
    });
  }
});

for (const size of ["mobile", "extra-large", "zoom-reflow"] as const) {
  test(`${size}: every branch reflows and remains reachable`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(
      size === "mobile"
        ? { width: 390, height: 844 }
        : size === "zoom-reflow"
          ? { width: 720, height: 500 }
          : { width: 1440, height: 1000 },
    );
    await page.goto("/navigation-preview");
    if (size === "extra-large") await enlargeText(page);
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    const toggle = nav.getByRole("button", { name: "Banking menu" });
    if (size !== "extra-large") await toggle.click();
    for (const family of source.families) {
      const trigger = nav.getByRole("button", {
        name: family.label,
        exact: true,
      });
      await trigger.click();
      const panel = page.locator(
        `[id="${await trigger.getAttribute("aria-controls")}"]`,
      );
      await expect(panel).toBeVisible();
      const leaves = panel.locator(".retail-menu-leaf");
      await expect(leaves).toHaveCount(family.children.length);
      for (const leaf of await leaves.all()) {
        await leaf.scrollIntoViewIfNeeded();
        const box = await leaf.boundingBox();
        const viewport = page.viewportSize();
        if (!box || !viewport)
          throw Error("Visible leaf and viewport required");
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(
          await leaf.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
        ).toBe(true);
      }
      await page.screenshot({
        path: testInfo.outputPath(`${family.id}-${size}.png`),
      });
      await panel
        .getByRole("button", { name: `Close ${family.label}`, exact: true })
        .click();
      await expect(trigger).toBeFocused();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (size === "extra-large")
      expect(
        await nav
          .getByRole("button", { name: "Accounts", exact: true })
          .evaluate((element) => getComputedStyle(element).fontSize),
      ).toBe("22px");
  });
}

test("touch opens and selects every family at390px", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    if (!baseURL) throw new Error("Navigation preview baseURL is required.");
    await page.goto(new URL("/navigation-preview", baseURL).href);
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    for (const family of source.families) {
      await nav.getByRole("button", { name: "Banking menu" }).tap();
      await nav.getByRole("button", { name: family.label, exact: true }).tap();
      const leaves = nav.locator(
        ".retail-menu-panel:not([hidden]) .retail-menu-leaf",
      );
      await expect(leaves).toHaveCount(family.children.length);
      await leaves.last().tap();
      await expect(
        page.getByRole("main").getByRole("heading", {
          name: family.children.at(-1)?.label,
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        nav.getByRole("button", { name: "Banking menu" }),
      ).toHaveAttribute("aria-expanded", "false");
    }
  } finally {
    await context.close();
  }
});

test("native Chromium200% browser zoom keeps all branches within the window", async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe("chromium");
  // Full headless Chromium is needed for its settings API; this is a fresh
  // throwaway test profile, entirely separate from the authenticated bank.
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    viewport: null,
    deviceScaleFactor: undefined,
    args: ["--window-size=1440,1000"],
  });
  try {
    const settings = await context.newPage();
    await settings.goto("chrome://settings/appearance");
    await settings.evaluate("chrome.settingsPrivate.setDefaultZoom(2)");
    const page = await context.newPage();
    const baseURL = testInfo.project.use.baseURL;
    if (!baseURL) throw new Error("Navigation preview baseURL is required.");
    await page.goto(new URL("/navigation-preview", baseURL).href);
    expect(
      await page.evaluate(() => ({
        ratio: outerWidth / innerWidth,
        dpr: devicePixelRatio,
      })),
    ).toEqual({ ratio: 2, dpr: 2 });
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await nav.getByRole("button", { name: "Banking menu" }).click();
    for (const family of source.families) {
      const trigger = nav.getByRole("button", {
        name: family.label,
        exact: true,
      });
      await trigger.click();
      const panel = nav.locator(".retail-menu-panel:not([hidden])");
      await expect(panel.locator(".retail-menu-leaf")).toHaveCount(
        family.children.length,
      );
      for (const leaf of await panel.locator(".retail-menu-leaf").all()) {
        await leaf.scrollIntoViewIfNeeded();
        expect(
          await leaf.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return (
              rect.x >= 0 &&
              rect.right <= innerWidth &&
              element.scrollWidth <= element.clientWidth
            );
          }),
        ).toBe(true);
      }
      await page.screenshot({
        path: testInfo.outputPath(`${family.id}-native200zoom.png`),
      });
      await panel
        .getByRole("button", { name: `Close ${family.label}`, exact: true })
        .click();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await context.close();
  }
});
