import { expect, type Page } from "@playwright/test";
import { bankingDate } from "../../src/platform/banking-workspace/domain/banking";
import type { Dashboard } from "../../src/platform/banking-workspace/domain/view";
import { openWorkspace } from "../fixtures/navigation";
import { savedWorkspace } from "../fixtures/workspace";

export function createHarness() {
  const installCustomers = async (
    page: Page,
    options: {
      lostResponse?: boolean;
      malformedResponse?: boolean;
      historyFailure?: boolean;
      emptyPayees?: boolean;
      stalePayee?: boolean;
      payeeCount?: number;
      reviewFailure?: "funds" | "null" | "malformed";
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
        if (options.reviewFailure === "funds")
          return route.fulfill({
            status: 400,
            json: {
              error: "The transfer exceeds current available funds.",
              uncertain: false,
            },
          });
        if (options.reviewFailure === "null")
          return route.fulfill({
            status: 503,
            contentType: "application/json",
            body: "null",
          });
        if (options.reviewFailure === "malformed")
          return route.fulfill({
            json: { offer: { id: "incomplete-review" } },
          });
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
  const prepareTransfer = async (page: Page) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Explore existing customer" })
      .click();
    await page.getByRole("button", { name: /Mira Krishnan.*SYN-001/ }).click();
    await openWorkspace(page, "transfer");
    await page
      .getByRole("combobox", { name: "Recipient", exact: true })
      .click();
    await page
      .getByRole("option", { name: "Aadhya Iyer · ending 0200" })
      .click();
    await page.getByLabel("Amount in INR").fill("12.34");
    await page
      .getByRole("button", { name: "Review transfer", exact: true })
      .click();
  };
  return {
    get installCustomers() {
      return installCustomers;
    },
    get prepareTransfer() {
      return prepareTransfer;
    },
  };
}
