import { expect, type Page, test } from "@playwright/test";
import { bankingDate } from "../src/domain/banking";
import { planningHouseholds } from "../src/domain/planning-fixtures";
import { initialPlanningState } from "../src/domain/planning-state";
import type { Dashboard } from "../src/domain/view";
import { chooseOption } from "./fixtures/form-select";
import { openWorkspace } from "./fixtures/navigation";
import { savedWorkspace } from "./fixtures/workspace";

const installCustomers = async (
  page: Page,
  options: {
    lostResponse?: boolean;
    malformedResponse?: boolean;
    historyFailure?: boolean;
    emptyPayees?: boolean;
    stalePayee?: boolean;
    payeeCount?: number;
  } = {},
) => {
  const first = savedWorkspace(),
    second = savedWorkspace();
  first.customer = {
    id: "legacy-mira",
    display_name: "Mira Krishnan",
    reference: "SYN-001",
    account_suffix: "0001",
  };
  second.bank = { ...second.bank, id: "sample-branch-002" };
  second.customer = {
    id: "sample-aadhya",
    display_name: "Aadhya Iyer",
    reference: "SYN-002",
    account_suffix: "0200",
  };
  if (!first.account || !second.account)
    throw new Error("Customer fixture requires accounts");
  first.account.transactions = [];
  second.account = {
    ...second.account,
    id: 200,
    clientId: 100,
    accountNo: "SYN-0200",
    clientName: "Aadhya Iyer",
    summary: { availableBalance: 15000, accountBalance: 15000 },
    transactions: [],
  };
  const rows: Dashboard[] = [first, second];
  first.payeeSummary = {
    count: options.emptyPayees ? 0 : (options.payeeCount ?? 1),
    first: options.emptyPayees
      ? null
      : {
          id: "payee-sample-aadhya",
          recipient_id: "sample-aadhya",
          display_name: "Aadhya Iyer",
          account_suffix: "0200",
        },
    maximum: 50,
  };
  second.payeeSummary = {
    count: 1,
    first: {
      id: "payee-legacy-mira",
      recipient_id: "legacy-mira",
      display_name: "Mira Krishnan",
      account_suffix: "0001",
    },
    maximum: 50,
  };
  let selected: Dashboard | undefined;
  let posts = 0;
  let financialRefreshes = 0;
  let lostResponse = options.lostResponse ?? false;
  let lastOutcome: Record<string, unknown> | null = null;
  let payeeSaved = !options.emptyPayees;
  let stalePayee = options.stalePayee ?? false;
  let reviews = 0;
  let offer: {
    id: string;
    bank_id: string;
    sender_id: string;
    recipient_id: string;
    amount_minor: number;
    payment_date: string;
    expires_at: number;
  } | null = null;
  await page.route("**/api/**", (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    const input = request.method() === "POST" ? request.postDataJSON() : null;
    if (path === "/api/customers")
      return route.fulfill({
        json: { customers: rows.map((row) => row.customer) },
      });
    if (path === "/api/customer-selection") {
      selected = rows.find((row) => row.customer?.id === input.customerId);
      if (!selected)
        return route.fulfill({
          status: 404,
          json: { error: "Choose a registered customer" },
        });
      selected.role = "customer";
      return route.fulfill({ json: { dashboard: selected } });
    }
    if (path === "/api/session/end") {
      selected = undefined;
      return route.fulfill({ json: { ended: true } });
    }
    if (path === "/api/telemetry-config") return route.fulfill({ json: {} });
    if (!selected)
      return route.fulfill({
        status: 401,
        json: { error: "Choose a customer" },
      });
    if (path === "/api/dashboard") {
      if (new URL(request.url()).searchParams.get("refresh") === "true")
        financialRefreshes++;
      return route.fulfill({ json: selected });
    }
    const payeeList = () => {
      const payees = payeeSaved
        ? rows
            .filter((row) => row.bank.id !== selected?.bank.id)
            .map((row) => ({
              ...row.customer,
              id: `payee-${row.customer?.id}`,
              recipient_id: row.customer?.id,
            }))
        : [];
      if (payeeSaved)
        for (let index = 1; index < (options.payeeCount ?? 1); index++)
          payees.push({
            id: `saved-payee-${index}`,
            recipient_id: `registered-${index}`,
            display_name: `Lakshmi Narayanan Synthetic ${index}`,
            reference: `SYN-${index}`,
            account_suffix: String(2100 + index),
          });
      return { payees, count: payees.length, maximum: 50 };
    };
    if (path === "/api/customers/payees")
      return route.fulfill({ json: payeeList() });
    if (path === "/api/customers/payees/review") {
      if (
        input.holderName !== "Aadhya Iyer" ||
        input.accountNumber !== "SYN-0200"
      )
        return route.fulfill({
          status: 400,
          json: { error: "Check the account number and holder name." },
        });
      return route.fulfill({
        json: {
          review_id: "review-payee-001",
          expires_at: Date.now() + 600000,
          display_name: "Aadhya Iyer",
          reference: "SYN-002",
          account_suffix: "0200",
        },
      });
    }
    if (path === "/api/customers/payees/confirm") {
      payeeSaved = true;
      if (selected)
        selected.payeeSummary = {
          count: 1,
          first: {
            id: "payee-sample-aadhya",
            recipient_id: "sample-aadhya",
            display_name: "Aadhya Iyer",
            account_suffix: "0200",
          },
          maximum: 50,
        };
      return route.fulfill({ json: payeeList() });
    }
    if (path === "/api/customers/payees/remove") {
      payeeSaved = false;
      if (selected)
        selected.payeeSummary = { count: 0, first: null, maximum: 50 };
      return route.fulfill({ json: payeeList() });
    }
    if (path === "/api/customers/recipients")
      return route.fulfill({
        json: {
          customers: rows
            .filter((row) => row.bank.id !== selected?.bank.id)
            .map((row) => row.customer),
        },
      });
    if (path === "/api/customer-transfers/history" && options.historyFailure)
      return route.fulfill({
        status: 503,
        json: { error: "Original history unavailable" },
      });
    if (path === "/api/customer-transfers/history")
      return route.fulfill({ json: { transfers: [] } });
    if (path === "/api/customer-transfers/inspect" && lastOutcome)
      return route.fulfill({ json: lastOutcome });
    if (path === "/api/customer-transfers/review") {
      offer = {
        id: `offer-registered-${++reviews}`,
        bank_id: selected.bank.id,
        sender_id: selected.customer?.id ?? "",
        recipient_id: input.recipientId,
        amount_minor: Math.round(Number(input.amount) * 100),
        payment_date: bankingDate(Date.now()),
        expires_at: Date.now() + 600000,
      };
      const recipient = rows.find(
        (row) => row.customer?.id === input.recipientId,
      );
      return route.fulfill({
        json: {
          offer,
          sender_name: selected.account?.clientName,
          sender_suffix: selected.customer?.account_suffix,
          recipient_name: recipient?.account?.clientName,
          recipient_suffix: recipient?.customer?.account_suffix,
        },
      });
    }
    if (path === "/api/customer-transfers/confirm") {
      expect(request.headers()["x-customer-scope"]).toBe(selected.bank.id);
      expect(input.offerId).toBe(offer?.id);
      if (!offer || !selected.account?.summary)
        throw new Error("Missing reviewed transfer");
      if (stalePayee) {
        stalePayee = false;
        lastOutcome = {
          id: "declined-original",
          bank_id: selected.bank.id,
          offer_id: offer.id,
          key: input.key,
          status: "failed",
          receipt: null,
          message: "The saved payee changed. Review the transfer again.",
        };
        return route.fulfill({ json: lastOutcome });
      }
      const recipient = rows.find(
        (row) => row.customer?.id === offer?.recipient_id,
      );
      if (!recipient?.account?.summary)
        throw new Error("Missing registered destination");
      posts++;
      const amount = offer.amount_minor / 100;
      selected.account.summary.accountBalance -= amount;
      selected.account.summary.availableBalance =
        selected.account.summary.accountBalance;
      recipient.account.summary.accountBalance += amount;
      recipient.account.summary.availableBalance =
        recipient.account.summary.accountBalance;
      const transaction = {
        date: [2026, 10, 18],
        amount,
        reversed: false,
        note: "OpenFinacle transfer saved-original",
      };
      selected.account.transactions?.push({
        ...transaction,
        id: 501,
        runningBalance: selected.account.summary.accountBalance,
        transactionType: { value: "Withdrawal", withdrawal: true },
      });
      recipient.account.transactions?.push({
        ...transaction,
        id: 502,
        runningBalance: recipient.account.summary.accountBalance,
        transactionType: { value: "Deposit", deposit: true },
      });
      lastOutcome = {
        id: "saved-original",
        bank_id: selected.bank.id,
        offer_id: offer.id,
        key: input.key,
        status: "posted",
        receipt: {
          transfer_id: 701,
          debit_id: 501,
          credit_id: 502,
          amount_minor: offer.amount_minor,
          date: offer.payment_date,
          source_balance_minor: Math.round(
            selected.account.summary.accountBalance * 100,
          ),
          recipient_balance_minor: Math.round(
            recipient.account.summary.accountBalance * 100,
          ),
        },
      };
      if (lostResponse) {
        lostResponse = false;
        return route.abort("failed");
      }
      return route.fulfill({
        json: options.malformedResponse
          ? { ...lastOutcome, key: "different-original-key" }
          : lastOutcome,
      });
    }
    return route.fulfill({ json: {} });
  });
  return { posts: () => posts, financialRefreshes: () => financialRefreshes };
};

test("explicit picker, reviewed transfer, switch and reload show each customer's own statement", async ({
  page,
}) => {
  const fixture = await installCustomers(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Explore existing customer" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose an existing customer" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Mira Krishnan.*SYN-001/ }),
  ).toBeVisible();
  expect(fixture.posts()).toBe(0);
  await page
    .getByLabel("Search name, reference or account suffix")
    .fill("0001");
  await page.getByRole("button", { name: /Mira Krishnan.*SYN-001/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".person strong")).toHaveText("Mira Krishnan");
  await openWorkspace(page, "transfer");
  await expect(page.locator(".customer-legacy-transfer")).toHaveCount(0);
  await page.getByRole("combobox", { name: "Recipient", exact: true }).click();
  await page.getByRole("option", { name: "Aadhya Iyer · ending 0200" }).click();
  await page.getByLabel("Amount in INR").fill("1234.56");
  await page
    .getByRole("button", { name: "Review transfer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review your transfer" }),
  ).toBeVisible();
  expect(fixture.posts()).toBe(0);
  await page.getByRole("button", { name: "Confirm transfer once" }).click();
  await expect(
    page.getByRole("heading", { name: "Transfer completed" }),
  ).toBeVisible();
  await expect(
    page.getByText("Sender debit 501 · Recipient credit 502"),
  ).toBeVisible();
  expect(fixture.posts()).toBe(1);
  await page
    .getByRole("button", { name: "Switch customer", exact: true })
    .click();
  await page
    .getByLabel("Search name, reference or account suffix")
    .fill("Aadhya");
  await page.getByRole("button", { name: /Aadhya Iyer.*SYN-002/ }).click();
  await expect(page.locator(".person strong")).toHaveText("Aadhya Iyer");
  await openWorkspace(page, "statements");
  await expect(
    page.getByRole("cell", { name: "Deposit", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".person strong")).toHaveText("Aadhya Iyer");
  await page
    .getByRole("button", { name: "Switch customer", exact: true })
    .click();
  await page.getByRole("button", { name: /Mira Krishnan.*SYN-001/ }).click();
  await openWorkspace(page, "statements");
  await expect(
    page.getByRole("cell", { name: "Withdrawal", exact: true }),
  ).toBeVisible();
  expect(fixture.posts()).toBe(1);
  await page.screenshot({
    path: "test-results/customer-statement-desktop.png",
    fullPage: true,
  });
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 720, height: 900 },
])
  test(`customer picker reflows at${viewport.width}px with200percent text`, async ({
    page,
  }) => {
    await installCustomers(page);
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await page
      .getByRole("button", { name: "Explore existing customer" })
      .click();
    const picker = page.getByRole("region", {
      name: "Choose an existing customer",
    });
    await expect(picker).toBeVisible();
    await page
      .getByLabel("Search name, reference or account suffix")
      .fill("Aadhya");
    await expect(
      page.getByRole("button", { name: /Aadhya Iyer.*SYN-002/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/customer-picker-${viewport.width}.png`,
      fullPage: true,
    });
  });

test("standalone shared planning binds its verified registered customer before saving", async ({
  page,
}) => {
  const relationship = "sample-branch-002";
  let state = initialPlanningState(planningHouseholds()[1]);
  let writes = 0;
  await page.addInitScript(() =>
    localStorage.setItem("openfinacle-planning-source", "shared"),
  );
  await page.route("**/api/**", (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (path === "/api/planning/context")
      return route.fulfill({
        json: { relationship, role: "customer", readOnly: false },
      });
    if (path === "/api/planning" && request.method() === "GET")
      return route.fulfill({
        json: { state, relationship, readOnly: false, history: [] },
      });
    if (path === "/api/planning" && request.method() === "POST") {
      expect(request.headers()["x-customer-scope"]).toBe(relationship);
      writes++;
      state = { ...request.postDataJSON(), version: state.version + 1 };
      return route.fulfill({
        json: {
          state,
          relationship,
          confirmedKey: request.headers()["idempotency-key"],
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/planning");
  await expect(
    page.getByRole("heading", { name: "Household net worth" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cash flow", exact: true }).click();
  await chooseOption(
    page,
    page.getByLabel("Category", { exact: true }),
    "Dining",
  );
  await page.getByLabel("Dining monthly budget INR").fill("123");
  await page.getByRole("button", { name: "Save budget", exact: true }).click();
  await expect(
    page.getByText("Saved on the planning server", { exact: false }),
  ).toBeVisible();
  expect(writes).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Cash flow", exact: true }).click();
  await chooseOption(
    page,
    page.getByLabel("Category", { exact: true }),
    "Dining",
  );
  await expect(page.getByLabel("Dining monthly budget INR")).toHaveValue("123");
});

const prepareTransfer = async (page: Page) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore existing customer" }).click();
  await page.getByRole("button", { name: /Mira Krishnan.*SYN-001/ }).click();
  await openWorkspace(page, "transfer");
  await page.getByRole("combobox", { name: "Recipient", exact: true }).click();
  await page.getByRole("option", { name: "Aadhya Iyer · ending 0200" }).click();
  await page.getByLabel("Amount in INR").fill("12.34");
  await page
    .getByRole("button", { name: "Review transfer", exact: true })
    .click();
};
for (const mode of ["lost", "malformed"] as const)
  test(`${mode} transfer acknowledgement retains original across reload even with empty history`, async ({
    page,
  }) => {
    const fixture = await installCustomers(page, {
      lostResponse: mode === "lost",
      malformedResponse: mode === "malformed",
    });
    await prepareTransfer(page);
    await page.getByRole("button", { name: "Confirm transfer once" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    expect(fixture.posts()).toBe(1);
    const stored = await page.evaluate(() =>
      sessionStorage.getItem(
        "openfinacle:customer-transfer:synthetic-workspace",
      ),
    );
    expect(stored).not.toBeNull();
    await page.reload();
    await openWorkspace(page, "transfer");
    await expect(
      page.getByRole("heading", { name: "Review your transfer" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Confirm transfer once" }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Inspect original transfer" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Transfer completed" }),
    ).toBeVisible();
    expect(fixture.posts()).toBe(1);
    expect(
      await page.evaluate(() =>
        sessionStorage.getItem(
          "openfinacle:customer-transfer:synthetic-workspace",
        ),
      ),
    ).toBeNull();
  });
test("transfer storage failure or unavailable original history prevents dispatch", async ({
  page,
}) => {
  const fixture = await installCustomers(page);
  await page.addInitScript(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("openfinacle:customer-transfer:"))
        throw new DOMException("Storage unavailable", "SecurityError");
      return write.call(this, key, value);
    };
  });
  await prepareTransfer(page);
  await page.getByRole("button", { name: "Confirm transfer once" }).click();
  await expect(
    page.locator(".customer-transfer").getByRole("alert"),
  ).toContainText("storage is unavailable");
  expect(fixture.posts()).toBe(0);
});
test("history read failure blocks a fresh transfer rather than hiding an unresolved original", async ({
  page,
}) => {
  const fixture = await installCustomers(page, { historyFailure: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore existing customer" }).click();
  await page.getByRole("button", { name: /Mira Krishnan.*SYN-001/ }).click();
  await openWorkspace(page, "transfer");
  await expect(
    page.locator(".customer-transfer").getByRole("alert"),
  ).toContainText("original transfer");
  await expect(
    page.getByRole("button", { name: "Review transfer", exact: true }),
  ).toHaveCount(0);
  expect(fixture.posts()).toBe(0);
});

test("empty future customer adds a known account by holder name, reviews it and removes saved payee without enumerating the directory", async ({
  page,
}) => {
  const fixture = await installCustomers(page, { emptyPayees: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore existing customer" }).click();
  await page.getByRole("button", { name: /Mira Krishnan.*SYN-001/ }).click();
  await openWorkspace(page, "transfer");
  await expect(
    page.getByRole("combobox", { name: "Recipient", exact: true }),
  ).toBeDisabled();
  await page.getByText("Manage saved payees (0)", { exact: true }).click();
  await expect(
    page.getByText("No saved payees yet.", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("Account holder name", { exact: true })
    .fill("Wrong holder");
  await page
    .locator(".customer-payees")
    .getByLabel("Account number", { exact: true })
    .fill("SYN-0200");
  await page.getByRole("button", { name: "Review payee", exact: true }).click();
  await expect(
    page.locator(".customer-payees").getByRole("alert"),
  ).toContainText("Check the account number and holder name");
  await page
    .getByLabel("Account holder name", { exact: true })
    .fill("Aadhya Iyer");
  await page.getByRole("button", { name: "Review payee", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Check payee details" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Check payee details" }),
  ).toBeFocused();
  await expect(
    page.getByRole("combobox", { name: "Recipient", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Confirm saved payee", exact: true })
    .click();
  await openWorkspace(page, "overview");
  await expect(
    page.getByRole("region", { name: "Saved payee summary" }),
  ).toContainText("Aadhya Iyer");
  expect(fixture.financialRefreshes()).toBe(0);
  await openWorkspace(page, "transfer");
  await page.getByText("Manage saved payees (1)", { exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Recipient", exact: true }),
  ).toBeEnabled();
  await page.getByRole("combobox", { name: "Recipient", exact: true }).focus();
  await page
    .getByRole("combobox", { name: "Recipient", exact: true })
    .press("ArrowDown");
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("listbox").getByRole("option")).toHaveText(
    "Aadhya Iyer · ending 0200",
  );
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("combobox", { name: "Recipient", exact: true }),
  ).toContainText("Aadhya Iyer");
  await page
    .getByRole("button", { name: "Remove Aadhya Iyer", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Recipient", exact: true }),
  ).toBeDisabled();
  expect(fixture.posts()).toBe(0);
  await openWorkspace(page, "overview");
  await expect(
    page.getByRole("region", { name: "Saved payee summary" }),
  ).toContainText("No saved payees yet");
  expect(fixture.financialRefreshes()).toBe(0);
});

test("definitive stale payee rejection clears only proven terminal original and permits a fresh reviewed instruction", async ({
  page,
}) => {
  const fixture = await installCustomers(page, { stalePayee: true });
  await prepareTransfer(page);
  await page.getByRole("button", { name: "Confirm transfer once" }).click();
  await expect(
    page.getByText("The saved payee changed. Review the transfer again.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(fixture.posts()).toBe(0);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem(
        "openfinacle:customer-transfer:synthetic-workspace",
      ),
    ),
  ).toBeNull();
  await page.getByRole("button", { name: "Inspect original transfer" }).click();
  expect(fixture.posts()).toBe(0);
  await page.getByRole("button", { name: "Start another transfer" }).click();
  await page.getByRole("combobox", { name: "Recipient", exact: true }).click();
  await page.getByRole("option", { name: "Aadhya Iyer · ending 0200" }).click();
  await page.getByLabel("Amount in INR").fill("1.23");
  await page
    .getByRole("button", { name: "Review transfer", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm transfer once" }).click();
  await expect(
    page.getByRole("heading", { name: "Transfer completed" }),
  ).toBeVisible();
  expect(fixture.posts()).toBe(1);
});

for (const width of [390, 720])
  test(`saved payee dropdown reflows at ${width}px and 200percent text with fifteen choices`, async ({
    page,
  }) => {
    await installCustomers(page, { payeeCount: 15 });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await page
      .getByRole("button", { name: "Explore existing customer" })
      .click();
    await page.getByRole("button", { name: /Mira Krishnan.*SYN-001/ }).click();
    await openWorkspace(page, "transfer");
    for (const selected of [null, "sample-aadhya", "registered-14"]) {
      const trigger = page.getByRole("combobox", {
        name: "Recipient",
        exact: true,
      });
      if (selected) await chooseOption(page, trigger, selected);
      await trigger.press("ArrowDown");
      await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(
        15,
      );
      await expect(
        page.locator('.form-select-option[data-state="checked"]'),
      ).toHaveCount(selected ? 1 : 0);
      expect(
        await page
          .getByRole("listbox")
          .getByRole("option")
          .evaluateAll((items) =>
            items
              .filter((item) => {
                const text = item.querySelector("span");
                if (!text) return true;
                const range = document.createRange();
                range.selectNodeContents(text);
                const box = item.getBoundingClientRect();
                return (
                  item.scrollWidth > item.clientWidth + 1 ||
                  Array.from(range.getClientRects()).some(
                    (rect) => rect.left < box.left || rect.right > box.right,
                  )
                );
              })
              .map((item) => ({
                name: item.textContent,
                width: item.clientWidth,
                scrollWidth: item.scrollWidth,
              })),
          ),
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBe(true);
      await expect(page.locator("#registered-recipient")).toHaveAttribute(
        "data-state",
        "open",
      );
      await page.screenshot({
        path: `test-results/saved-payees-${width}-200percent-${selected ?? "unselected"}.png`,
        fullPage: false,
      });
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("combobox", { name: "Recipient", exact: true }),
      ).toBeFocused();
    }
    await page.getByText("Manage saved payees (15)", { exact: true }).click();
    const list = page.getByRole("list", { name: "Saved payees", exact: true });
    await expect(list.getByRole("listitem")).toHaveCount(15);
    await expect(list.getByRole("button", { name: /^Remove / })).toHaveCount(
      15,
    );
    expect(
      await list
        .getByRole("listitem")
        .evaluateAll((items) =>
          items.every((item) => item.scrollWidth <= item.clientWidth + 1),
        ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await list.getByRole("listitem").first().scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/saved-payee-manager-${width}-200percent.png`,
      fullPage: false,
    });
  });

for (const empty of [false, true])
  test(`registered overview uses ${empty ? "empty add-payee CTA" : "actual saved payee summary"} without a legacy placeholder`, async ({
    page,
  }) => {
    await installCustomers(page, { emptyPayees: empty });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Explore existing customer" })
      .click();
    await page.getByRole("button", { name: /Mira Krishnan.*SYN-001/ }).click();
    const summary = page.getByRole("region", { name: "Saved payee summary" });
    await expect(summary).toBeVisible();
    await expect(summary).not.toContainText("Arjun");
    if (empty) {
      await expect(
        summary.getByText("No saved payees yet", { exact: true }),
      ).toBeVisible();
      await expect(
        summary.getByRole("button", { name: "Add a payee", exact: true }),
      ).toBeVisible();
    } else {
      await expect(summary).toContainText("Aadhya Iyer");
      await expect(summary).toContainText(
        "Account ending 0200 · 1 saved payee",
      );
    }
  });
