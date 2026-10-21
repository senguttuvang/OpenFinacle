import { expect, test } from "@playwright/test";

test.use({ deviceScaleFactor: 2 });

const entries = [
  ".magazine-header",
  ".magazine-cover",
  "#experience",
  "#demo-entry",
];

for (const path of ["/", "/discover"]) {
  test(`${path} offers four deliberate demo links without selecting a journey`, async ({
    page,
  }) => {
    const writes: string[] = [];
    await page.route("**/api/**", (route) => {
      if (route.request().method() !== "GET")
        writes.push(new URL(route.request().url()).pathname);
      return new URL(route.request().url()).pathname === "/api/customers"
        ? route.fulfill({ json: { customers: [] } })
        : route.fulfill({ status: 401, json: { error: "No session" } });
    });
    for (const entry of entries) {
      await page.goto(path);
      await expect(page.locator('a[href="/demo"]')).toHaveCount(4);
      const link = page
        .locator(entry)
        .getByRole("link", { name: "Try the demo" });
      await expect(link).toHaveAttribute("href", "/demo");
      await link.click();
      await expect(page).toHaveURL(/\/demo$/);
      await expect(
        page.getByRole("heading", { name: "Choose your banking journey" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Explore existing customer",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Open my first account",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Start your banking story/ }),
      ).toBeVisible();
      expect(writes).toEqual([]);
    }
  });
}

for (const size of [
  { name: "desktop", width: 1440, height: 1000, text: 100 },
  { name: "mobile", width: 390, height: 844, text: 100 },
  { name: "narrow-mobile", width: 320, height: 740, text: 100 },
  { name: "large-text", width: 1280, height: 1000, text: 200 },
]) {
  test(`${size.name} keeps demo actions readable, keyboard accessible and in view`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(size);
    const requests: string[] = [];
    await page.route("**/api/**", (route) => {
      requests.push(route.request().method());
      return route.abort();
    });
    await page.goto("/");
    if (size.text !== 100)
      await page.addStyleTag({
        content: `html { font-size: ${size.text}% !important; }`,
      });
    const header = page.locator(".magazine-header a[href='/demo']");
    await expect(header).toBeInViewport();
    // Check before keyboard navigation or clicking can scroll the page.
    if (size.text === 100) {
      await expect(
        page.locator(".magazine-cover a[href='/demo']"),
      ).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    }
    // Reach the header action in the native tab order, without programmatic focus.
    for (let step = 0; step < 10; step++) {
      await page.keyboard.press("Tab");
      if (await header.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(header).toBeFocused();
    await expect(header).toHaveCSS("outline-style", "solid");
    await page.screenshot({ path: testInfo.outputPath("landing.png") });
    await page.goto("/#experience");
    if (size.text !== 100)
      await page.addStyleTag({
        content: `html { font-size: ${size.text}% !important; }`,
      });
    const experience = page.locator("#experience a[href='/demo']");
    await expect(experience).toBeInViewport();
    for (const entry of entries) {
      const link = page.locator(`${entry} a[href='/demo']`);
      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(size.width);
    }
    await page.screenshot({ path: testInfo.outputPath("experience.png") });
    await testInfo.attach(`${size.name} experience`, {
      path: testInfo.outputPath("experience.png"),
      contentType: "image/png",
    });
    expect(requests).toEqual([]);
    await experience.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/demo$/);
  });
}
