import type { Page } from "@playwright/test";

// Exercise enlarged text independently of an application-specific size control.
export const enlargeText = (page: Page) =>
  page.evaluate(() => {
    document.documentElement.style.fontSize = "22px";
    document.documentElement.dataset.reading = "large";
  });
