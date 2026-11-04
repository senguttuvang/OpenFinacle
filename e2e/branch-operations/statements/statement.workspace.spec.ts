import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { setupBranchStatement } from "./statement.harness";

for (const width of [1440, 390])
  test(`owned savings enquiry and complete-range CSV keep header scope and clear stale pages at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    const f = await setupBranchStatement(page),
      r = f.region,
      table = r.getByRole("region", {
        name: "Owned savings transaction table",
      });
    expect(f.queries).toHaveLength(0);
    await r
      .getByRole("button", { name: "Read savings transactions", exact: true })
      .click();
    await expect(table.locator("tbody tr")).toHaveCount(200);
    const first = table
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: "10000", exact: true }) });
    await expect(first.locator("td").nth(5)).toHaveText("₹0.00");
    const negative = table
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: "9999", exact: true }) });
    await expect(negative.locator("td").nth(5)).toHaveText("-₹25.50");
    const unknown = table
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: "9998", exact: true }) });
    await expect(unknown.locator("td").nth(5)).toHaveText("Unavailable");
    await expect(unknown.locator("td").nth(6)).toHaveText("Unavailable");
    if (width === 390) {
      await page.locator(".branch-day").evaluate((el) => {
        (el as HTMLElement).style.fontSize = "200%";
      });
      await table.scrollIntoViewIfNeeded();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await table.focus();
      await page.keyboard.press("ArrowRight");
      await expect
        .poll(() => table.evaluate((el) => el.scrollLeft))
        .toBeGreaterThan(0);
    }
    f.state.holdPage = true;
    await r
      .getByRole("button", { name: "Next savings page", exact: true })
      .click();
    await expect.poll(() => f.state.releasePage !== null).toBe(true);
    await expect(table).toHaveCount(0);
    await expect(
      r.getByRole("button", {
        name: "Export all matching savings transactions as CSV",
        exact: true,
      }),
    ).toHaveCount(0);
    f.state.releasePage?.();
    await expect(table.locator("tbody tr")).toHaveCount(1);
    expect(f.queries.at(-1)?.get("page")).toBe("1");
    await r
      .getByRole("button", { name: "First savings page", exact: true })
      .click();
    await expect(table.locator("tbody tr")).toHaveCount(200);
    const downloaded = page.waitForEvent("download");
    await r
      .getByRole("button", {
        name: "Export all matching savings transactions as CSV",
        exact: true,
      })
      .click();
    const file = await downloaded,
      path = await file.path();
    if (!path) throw new Error("CSV download path missing");
    const csv = await readFile(path, "utf8");
    expect(csv.split("\r\n")).toHaveLength(203);
    expect(csv).toContain(
      '"enquiry","Fineract savings transaction search","synthetic-adyar","SYN-1","2","2","SYN0001"',
    );
    expect(csv).not.toContain('"DEMO-001"');
    expect(f.queries.at(-1)?.get("mode")).toBe("export");
    await expect(r.getByRole("status")).toContainText(
      "Exported 201 of 201 native matches",
    );
    const beforeEdit = f.queries.length;
    await r
      .getByLabel("Native value date from", { exact: true })
      .fill("2001-01-01");
    await r
      .getByLabel("Native value date to", { exact: true })
      .fill("2001-01-01");
    await expect(table).toHaveCount(0);
    await expect(
      r.getByRole("button", {
        name: "Export all matching savings transactions as CSV",
        exact: true,
      }),
    ).toHaveCount(0);
    expect(f.queries).toHaveLength(beforeEdit);
    await r
      .getByRole("button", { name: "Read savings transactions", exact: true })
      .click();
    await expect(table.locator("tbody tr")).toHaveCount(0);
    await expect(
      r.getByText(
        "No native transactions returned on this page; matching native total 0.",
        { exact: false },
      ),
    ).toBeVisible();
    const emptyDownload = page.waitForEvent("download");
    await r
      .getByRole("button", {
        name: "Export all matching savings transactions as CSV",
        exact: true,
      })
      .click();
    const emptyFile = await emptyDownload,
      emptyPath = await emptyFile.path();
    if (!emptyPath) throw new Error("Empty enquiry CSV path missing");
    expect((await readFile(emptyPath, "utf8")).split("\r\n")).toHaveLength(2);
    f.state.bad = true;
    await r
      .getByRole("button", { name: "Read savings transactions", exact: true })
      .click();
    await expect(r.getByRole("alert")).toContainText(
      "unavailable, invalid or outside",
    );
    await expect(table).toHaveCount(0);
    await expect(
      r.getByRole("button", {
        name: "Export all matching savings transactions as CSV",
        exact: true,
      }),
    ).toHaveCount(0);
    expect(f.queries.every((q) => q.get("customerId") === f.target.id)).toBe(
      true,
    );
    expect(f.writes).toEqual([]);
  });

test("a late savings export cannot download after date scope changes", async ({
  page,
}) => {
  const f = await setupBranchStatement(page),
    r = f.region,
    downloads: string[] = [];
  page.on("download", (file) => downloads.push(file.suggestedFilename()));
  await r
    .getByRole("button", { name: "Read savings transactions", exact: true })
    .click();
  await expect(
    r
      .getByRole("region", { name: "Owned savings transaction table" })
      .locator("tbody tr"),
  ).toHaveCount(200);
  f.state.holdExport = true;
  await r
    .getByRole("button", {
      name: "Export all matching savings transactions as CSV",
      exact: true,
    })
    .click();
  await expect.poll(() => f.state.releaseExport !== null).toBe(true);
  await r
    .getByLabel("Native value date from", { exact: true })
    .fill("2001-01-01");
  const response = page.waitForResponse(
    (v) =>
      new URL(v.url()).pathname === "/api/branch/savings-statement" &&
      new URL(v.url()).searchParams.get("mode") === "export",
  );
  f.state.releaseExport?.();
  await response;
  await page.waitForLoadState("networkidle");
  expect(downloads).toEqual([]);
  await expect(r.getByRole("status")).toHaveCount(0);
  await expect(
    r.getByRole("button", {
      name: "Export all matching savings transactions as CSV",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(f.writes).toEqual([]);
});
