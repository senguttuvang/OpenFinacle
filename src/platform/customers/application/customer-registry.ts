import { Clock, Effect } from "effect";
import {
  type Account,
  type Bank,
  BankingError,
  type Session,
} from "../../banking-workspace/domain/banking";
import { Core, Store } from "../../banking-workspace/domain/ports";
import {
  customerChoice,
  type RegisteredCustomer,
} from "../domain/customer-registry";

const fail = (message: string, status = 409) =>
  Effect.fail(new BankingError({ message, status }));
export const registeredCustomer = (id: string) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const row = yield* store.one<RegisteredCustomer>(
      "SELECT * FROM customers WHERE id=? AND status='active'",
      id,
    );
    if (!row)
      return yield* fail("Choose an available registered customer.", 404);
    const bank = yield* store.one<Bank>(
      "SELECT * FROM banks WHERE id=? AND status='ready'",
      row.bank_id,
    );
    if (
      !bank ||
      bank.customer_client !== row.client_id ||
      bank.customer_account !== row.account_id
    )
      return yield* fail(
        "The registered customer's owned scope could not be verified.",
      );
    return row;
  });
export const sessionCustomer = (session: Session) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const row = yield* store.one<{ id: string }>(
      "SELECT id FROM customers WHERE bank_id=? AND status='active'",
      session.bank_id,
    );
    if (!row)
      return yield* fail("Select a registered customer before this operation.");
    return yield* registeredCustomer(row.id);
  });

// The one registration boundary shared by synthetic seeding and completed onboarding.
export const registerCustomer = (input: Omit<RegisteredCustomer, "status">) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const core = yield* Core;
    const bank = yield* store.one<Bank>(
      "SELECT * FROM banks WHERE id=? AND status='ready'",
      input.bank_id,
    );
    const branch = yield* store.one<Bank>(
      "SELECT * FROM banks WHERE id=? AND status='ready'",
      input.branch_id,
    );
    if (
      !bank ||
      !branch ||
      bank.customer_client !== input.client_id ||
      bank.customer_account !== input.account_id ||
      !input.display_name.trim()
    )
      return yield* fail(
        "Registration requires an owned ready customer scope and branch.",
      );
    const account = yield* core.request<Account>(
      "GET",
      `savingsaccounts/${input.account_id}`,
    );
    if (
      account.id !== input.account_id ||
      account.clientId !== input.client_id ||
      account.accountNo !== input.account_no ||
      !account.status.active ||
      account.currency?.code !== "INR" ||
      account.currency.decimalPlaces !== 2
    )
      return yield* fail(
        "The customer's active INR savings ownership could not be verified.",
      );
    const existing = yield* store.one<RegisteredCustomer>(
      "SELECT * FROM customers WHERE id=?",
      input.id,
    );
    if (existing) {
      if (
        Object.entries(input).some(
          ([key, value]) => existing[key as keyof RegisteredCustomer] !== value,
        )
      )
        return yield* fail(
          "The customer reference already belongs to a different registration.",
        );
      return existing;
    }
    yield* store.run(
      "INSERT INTO customers(id,branch_id,bank_id,reference,display_name,client_id,account_id,account_no,origin,status) VALUES(?,?,?,?,?,?,?,?,?,'active') ON CONFLICT(id) DO NOTHING",
      input.id,
      input.branch_id,
      input.bank_id,
      input.reference,
      input.display_name.trim(),
      input.client_id,
      input.account_id,
      input.account_no,
      input.origin,
    );
    return yield* registeredCustomer(input.id);
  });

export const customerDirectory = (query = "", recipientFor?: Session) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const sender = recipientFor ? yield* sessionCustomer(recipientFor) : null;
    const rows = yield* store.all<RegisteredCustomer>(
      "SELECT * FROM customers WHERE status='active' ORDER BY display_name,id LIMIT 500",
    );
    const normalized = query.trim().toLocaleLowerCase("en-IN").slice(0, 120);
    return rows
      .filter(
        (row) =>
          (!sender ||
            (row.branch_id === sender.branch_id && row.id !== sender.id)) &&
          `${row.display_name} ${row.reference} ${row.account_no.slice(-4)}`
            .toLocaleLowerCase("en-IN")
            .includes(normalized),
      )
      .map(customerChoice);
  });

export const selectedCustomer = (session: Session) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const row = yield* store.one<RegisteredCustomer>(
      "SELECT * FROM customers WHERE bank_id=? AND status='active'",
      session.bank_id,
    );
    return row ? customerChoice(yield* registeredCustomer(row.id)) : null;
  });

export const selectCustomerScope = (
  customerId: string,
  tokenHash: string,
  previous?: Session | null,
) =>
  Effect.gen(function* () {
    const customer = yield* registeredCustomer(customerId);
    const store = yield* Store;
    const expires = (yield* Clock.currentTimeMillis) + 31536000000;
    // Revoke first: a storage failure may sign the reviewer out, never leave two live identities.
    if (previous)
      yield* store.run(
        "DELETE FROM sessions WHERE token_hash=?",
        previous.token_hash,
      );
    yield* store.run(
      "INSERT INTO sessions(token_hash,bank_id,role,expires_at) VALUES(?,?,'customer',?)",
      tokenHash,
      customer.bank_id,
      expires,
    );
    return {
      token_hash: tokenHash,
      bank_id: customer.bank_id,
      role: "customer" as const,
      expires_at: expires,
    };
  });

export const registerLegacyCustomer = (branchId: string) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const core = yield* Core;
    const bank = yield* store.one<Bank>(
      "SELECT * FROM banks WHERE id=? AND status='ready'",
      branchId,
    );
    if (!bank || bank.customer_account <= 0)
      return yield* fail(
        "Prepare the existing customer scenario before preparing its directory.",
      );
    const account = yield* core.request<Account>(
      "GET",
      `savingsaccounts/${bank.customer_account}`,
    );
    return yield* registerCustomer({
      id: `legacy-${bank.id}`,
      branch_id: bank.id,
      bank_id: bank.id,
      reference: `LEGACY-${bank.id}`,
      display_name: account.clientName,
      client_id: bank.customer_client,
      account_id: bank.customer_account,
      account_no: account.accountNo,
      origin: "legacy",
    });
  });

interface ApplicantScope {
  operation_id: string;
  owner_session_hash: string;
  bank_id: string;
  customer_id: string;
  branch_id: string;
}
const applicantSnapshot = (bankId: string, branchId: string) =>
  Effect.gen(function* () {
    const store = yield* Store;
    yield* store.run(
      "INSERT INTO financial_snapshots(bank_id,payload,synced_at,invalidated_at) SELECT ?,json_object('account',NULL,'recipient',json_extract(payload,'$.recipient'),'employer',json_extract(payload,'$.employer')),synced_at,invalidated_at FROM financial_snapshots WHERE bank_id=? ON CONFLICT(bank_id) DO NOTHING",
      bankId,
      branchId,
    );
    if (
      !(yield* store.one(
        "SELECT bank_id FROM financial_snapshots WHERE bank_id=?",
        bankId,
      ))
    )
      return yield* fail(
        "Prepare the branch's saved financial view before entering an individual application.",
        503,
      );
  });
export const createApplicantScope = (
  session: Session,
  originalOperationId: string,
) =>
  Effect.gen(function* () {
    if (
      session.role !== "customer" ||
      !/^[a-zA-Z0-9_-]{8,64}$/.test(originalOperationId)
    )
      return yield* fail(
        "Choose a valid original applicant operation as the customer.",
        400,
      );
    const store = yield* Store;
    const existing = yield* store.one<ApplicantScope>(
      "SELECT * FROM customer_applicant_scopes WHERE operation_id=?",
      originalOperationId,
    );
    if (existing) {
      if (existing.owner_session_hash !== session.token_hash)
        return yield* fail(
          "This original application belongs to a different session.",
          403,
        );
      yield* applicantSnapshot(existing.bank_id, existing.branch_id);
      return { bankId: existing.bank_id, customerId: existing.customer_id };
    }
    const setting = yield* store.one<{ value: string }>(
      "SELECT value FROM settings WHERE key='demo_existing_bank'",
    );
    const branch = setting
      ? yield* store.one<Bank>(
          "SELECT * FROM banks WHERE id=? AND status='ready'",
          setting.value,
        )
      : null;
    if (!branch)
      return yield* fail(
        "Prepare the permanent branch before starting an individual application.",
        503,
      );
    const bankId = `applicant-${originalOperationId}`;
    const customerId = bankId;
    yield* store.run(
      "INSERT INTO banks(id,journey,status,recipient_client,recipient_account,employer_client,employer_account) VALUES(?,'new','ready',?,?,?,?) ON CONFLICT(id) DO NOTHING",
      bankId,
      branch.recipient_client,
      branch.recipient_account,
      branch.employer_client,
      branch.employer_account,
    );
    yield* store.run(
      "INSERT INTO customer_applicant_scopes(operation_id,owner_session_hash,bank_id,customer_id,branch_id) VALUES(?,?,?,?,?) ON CONFLICT(operation_id) DO NOTHING",
      originalOperationId,
      session.token_hash,
      bankId,
      customerId,
      branch.id,
    );
    const saved = yield* store.one<ApplicantScope>(
      "SELECT * FROM customer_applicant_scopes WHERE operation_id=?",
      originalOperationId,
    );
    if (!saved || saved.owner_session_hash !== session.token_hash)
      return yield* fail(
        "Another session owns this original application.",
        403,
      );
    yield* applicantSnapshot(saved.bank_id, saved.branch_id);
    return { bankId: saved.bank_id, customerId: saved.customer_id };
  });
export const assertApplicantScope = (session: Session) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const row = yield* store.one<ApplicantScope>(
      "SELECT * FROM customer_applicant_scopes WHERE bank_id=?",
      session.bank_id,
    );
    const registered = row
      ? yield* store.one<{ id: string }>(
          "SELECT id FROM customers WHERE id=? AND bank_id=? AND status='active'",
          row.customer_id,
          session.bank_id,
        )
      : null;
    // Drafts remain bound to their original session. An opened customer's own
    // registered server session can read its retained onboarding receipt after switching.
    if (!row || (row.owner_session_hash !== session.token_hash && !registered))
      return yield* fail(
        "Start an individual application before changing an applicant's records.",
        403,
      );
    return {
      bankId: row.bank_id,
      customerId: row.customer_id,
      branchId: row.branch_id,
    };
  });
export const registerOpenedCustomer = (session: Session) =>
  Effect.gen(function* () {
    const scope = yield* assertApplicantScope(session);
    const store = yield* Store;
    const core = yield* Core;
    const bank = yield* store.one<Bank>(
      "SELECT * FROM banks WHERE id=? AND status='ready'",
      scope.bankId,
    );
    if (!bank || bank.customer_client <= 0 || bank.customer_account <= 0)
      return yield* fail(
        "Complete Core-confirmed account opening before directory registration.",
      );
    const account = yield* core.request<Account>(
      "GET",
      `savingsaccounts/${bank.customer_account}`,
    );
    const registered = yield* registerCustomer({
      id: scope.customerId,
      bank_id: scope.bankId,
      branch_id: scope.branchId,
      reference: `OPEN-${scope.customerId}`,
      display_name: account.clientName,
      client_id: bank.customer_client,
      account_id: bank.customer_account,
      account_no: account.accountNo,
      origin: "onboarding",
    });
    yield* store.run(
      "UPDATE banks SET journey='existing' WHERE id=? AND journey='new'",
      scope.bankId,
    );
    return registered;
  });
