import { expect, test } from "@playwright/test";
import { adviceText, type DepositAdvice } from "../src/domain/deposit-advice";
import { choosePersona } from "./fixtures/persona";
import { savedWorkspace } from "./fixtures/workspace";

for (const kind of ["fixed", "recurring"] as const) {
  test(`${kind} advice verifies ownership, retries errors and downloads literal activation facts across roles`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    const data = savedWorkspace();
    const id = "33333333-1234-4567-8901-123456789abc";
    const reference = `${kind === "fixed" ? "FD" : "RD"}-33333333`;
    const timestamp = "2026-10-17T09:00:00Z";
    let mode: "failed" | "foreign" | "ready" = "failed";
    let writes = 0;
    let failDownload: "expired" | "changed" | null = "expired";
    const advice: DepositAdvice = {
      kind,
      product_id: id,
      bank_id: data.bank.id,
      reference,
      label:
        kind === "fixed"
          ? "Fixed deposit"
          : "<script>Example travel goal</script>",
      amount: 2000,
      months: 6,
      annual_rate: 6,
      planned_minor: kind === "fixed" ? 200000 : 1200000,
      maturity_minor: kind === "fixed" ? 206000 : 1221000,
      activated_at: timestamp,
      maturity_date: "2027-04-17",
      activation_version: 2,
      maker: "officer",
      checker: "approver",
      nominee: "No nominee selected",
      maturity_instruction:
        "Demo instruction only; no automatic maturity payout.",
    };
    const terms =
      kind === "fixed"
        ? {
            product: "demo-cumulative",
            amount: 2000,
            months: 6,
            maturity: "return_all",
            nominee: null,
          }
        : {
            product: "demo-recurring",
            amount: 2000,
            months: 6,
            day: 15,
            label: advice.label,
            nominee: null,
          };
    const holding = {
      id,
      bank_id: data.bank.id,
      terms,
      status: "active",
      maker: "officer",
      checker: "approver",
      activated_at: timestamp,
      maturity_date: "2027-04-17",
      maturity_minor: advice.maturity_minor,
      allocated_count: 1,
      allocated_minor: 200000,
      version: kind === "fixed" ? 2 : 3,
      created_at: timestamp,
      updated_at: timestamp,
    };
    await page.context().route("**/api/**", (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === "/api/session/role") {
        data.role = request.postDataJSON().role;
        return route.fulfill({ json: { role: data.role } });
      }
      if (request.method() === "POST") writes++;
      if (url.pathname === "/api/deposit-advice") {
        if (mode === "failed")
          return route.fulfill({
            status: 503,
            json: { error: "Advice temporarily unavailable" },
          });
        if (mode === "foreign")
          return route.fulfill({
            json: { ...advice, bank_id: "another-relationship" },
          });
        if (
          url.searchParams.get("download") === "1" &&
          failDownload === "expired"
        )
          return route.fulfill({
            status: 401,
            json: { error: "Synthetic expired session" },
          });
        if (url.searchParams.get("download") === "1")
          return route.fulfill({
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Content-Disposition": `attachment; filename="openfinacle-demo-${reference}.txt"`,
            },
            body:
              adviceText(advice) +
              (failDownload === "changed" ? "Changed advice" : ""),
          });
        return route.fulfill({ json: advice });
      }
      if (url.pathname === "/api/deposits")
        return route.fulfill({
          json:
            kind !== "fixed"
              ? { deposits: [] }
              : url.searchParams.has("id")
                ? {
                    deposit: holding,
                    history: [],
                    actions: [],
                    confirmed_key: null,
                  }
                : { deposits: [holding] },
        });
      if (url.pathname === "/api/recurring-deposits")
        return route.fulfill({
          json: url.searchParams.has("id")
            ? {
                plan: holding,
                history: [],
                actions: [],
                installments: [],
                confirmed_key: null,
              }
            : { plans: [holding] },
        });
      return route.fulfill({
        json: url.pathname === "/api/dashboard" ? data : {},
      });
    });
    const open = async () => {
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: "instant" }),
      );
      await page.getByRole("button", { name: "Deposits", exact: true }).click();
      if (kind === "recurring")
        await page
          .getByRole("button", { name: "Recurring deposits", exact: true })
          .click();
      await page
        .getByRole("button", { name: `View ${reference}`, exact: true })
        .click();
    };
    await page.goto("/");
    await open();
    await page
      .getByRole("button", { name: "View demo opening advice" })
      .click();
    const preview = page.getByRole("region", {
      name: "Demo opening advice",
      exact: true,
    });
    await expect(preview.getByRole("alert")).toContainText(
      "Advice temporarily unavailable",
    );
    await expect(preview.getByRole("link")).toHaveCount(0);
    mode = "foreign";
    await page.getByRole("button", { name: "Retry opening advice" }).click();
    await expect(preview.getByRole("alert")).toContainText(
      "could not be verified",
    );
    await expect(preview.getByRole("link")).toHaveCount(0);
    mode = "ready";
    await page.getByRole("button", { name: "Retry opening advice" }).click();
    await expect(preview.getByRole("heading")).toBeFocused();
    await expect(preview).toContainText("not an interest or tax certificate");
    await expect(preview).toContainText(
      kind === "fixed" ? "₹2,060.00" : "₹12,210.00",
    );
    if (kind === "recurring") {
      await expect(preview).toContainText(
        "<script>Example travel goal</script>",
      );
      await expect(preview.locator("script")).toHaveCount(0);
    }
    let downloads = 0;
    page.on("download", () => downloads++);
    await preview
      .getByRole("button", { name: "Download demo opening advice (.txt)" })
      .click();
    await expect(preview.getByRole("alert")).toContainText(
      "download could not be verified",
    );
    expect(downloads).toBe(0);
    failDownload = "changed";
    await preview
      .getByRole("button", { name: "Download demo opening advice (.txt)" })
      .click();
    await expect(preview.getByRole("alert")).toContainText(
      "download could not be verified",
    );
    await expect(
      preview.getByRole("button", {
        name: "Download demo opening advice (.txt)",
      }),
    ).toBeEnabled();
    expect(downloads).toBe(0);
    failDownload = null;
    const downloadEvent = page.waitForEvent("download");
    await preview
      .getByRole("button", { name: "Download demo opening advice (.txt)" })
      .click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe(
      `openfinacle-demo-${reference}.txt`,
    );
    const stream = await download.createReadStream();
    let text = "";
    for await (const chunk of stream) text += chunk.toString();
    expect(text).toContain(`Holding reference: ${reference}`);
    expect(text).toContain(
      "Authorization: officer → approver · activation version 2",
    );
    expect(text).toContain("no accrued or credited earnings are certified");
    await preview.getByRole("button", { name: "Close opening advice" }).click();
    await expect(
      page.getByRole("button", { name: "View demo opening advice" }),
    ).toBeFocused();
    await page.reload();
    await open();
    await choosePersona(page, "officer");
    await open();
    await page
      .getByRole("button", { name: "View demo opening advice" })
      .click();
    await expect(preview.getByRole("heading")).toBeFocused();
    await expect(preview).toContainText(reference);
    await page.screenshot({ path: `/tmp/finacle4-${kind}-advice-desktop.png` });
    await page
      .getByRole("button", { name: "Extra-large text", exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await preview.getByRole("heading").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/finacle4-${kind}-advice-mobile-xl.png`,
    });
    await page.setViewportSize({ width: 640, height: 900 });
    await page.addStyleTag({ content: "html { font-size: 36px !important; }" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await preview.locator("dd").evaluateAll((elements) =>
        elements
          .filter((element) => element.textContent?.startsWith("₹"))
          .every((element) => {
            const range = document.createRange();
            range.selectNodeContents(element);
            return range.getClientRects().length <= 1;
          }),
      ),
    ).toBe(true);
    await preview
      .getByText("Illustrated maturity amount", { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/finacle4-${kind}-advice-200.png` });
    expect(writes).toBe(0);
  });
}
