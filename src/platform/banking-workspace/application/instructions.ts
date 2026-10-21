import { Clock, Effect } from "effect";
import {
  type BankingCommand,
  BankingError,
  type Beneficiary,
  bankingDate,
  type CommandKind,
  canApprove,
  dateFields,
  moneyToMinor,
  type Session,
} from "../domain/banking";
import { Core, Store } from "../domain/ports";
import {
  audit,
  type Created,
  requireAccount,
  requiredBank,
} from "./workspace-context";

interface CommandInput {
  kind: CommandKind;
  amount?: number;
  description?: string;
  beneficiaryId?: string;
  originalId?: string;
}

export const createCommand = (
  session: Session,
  input: CommandInput,
  key: string,
) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const bank = yield* requiredBank(session);
    const accountId = yield* requireAccount(bank);
    if (key.length < 10 || key.length > 100)
      return yield* Effect.fail(
        new BankingError({
          message: "A valid idempotency key is required.",
          status: 400,
        }),
      );
    const existing = yield* store.one<BankingCommand>(
      "SELECT * FROM commands WHERE bank_id=? AND key=?",
      bank.id,
      key,
    );
    if (existing) {
      if (existing.payload !== JSON.stringify(input))
        return yield* Effect.fail(
          new BankingError({
            message: "This idempotency key belongs to a different request.",
            status: 409,
          }),
        );
      if (["failed", "uncertain", "executing"].includes(existing.status))
        return yield* Effect.fail(
          new BankingError({
            message:
              existing.error ??
              `Instruction is ${existing.status}; inspect its state before retrying.`,
            status: 409,
            uncertain: existing.status !== "failed",
          }),
        );
      return existing;
    }
    const unresolved = yield* store.one<{ id: string }>(
      "SELECT id FROM core_write_claims WHERE bank_id=? AND account_id=? AND status IN ('executing','uncertain') LIMIT 1",
      bank.id,
      accountId,
    );
    if (unresolved)
      return yield* Effect.fail(
        new BankingError({
          message:
            "An earlier instruction is still processing or requires reconciliation. Inspect it before starting another financial instruction.",
          status: 409,
        }),
      );
    const allowed: CommandKind[] =
      session.role === "customer"
        ? ["transfer"]
        : session.role === "officer"
          ? ["deposit", "withdrawal", "salary", "freeze", "unfreeze", "reverse"]
          : [];
    if (!allowed.includes(input.kind))
      return yield* Effect.fail(
        new BankingError({
          message: "This persona cannot initiate that operation.",
          status: 403,
        }),
      );
    const amount = ["freeze", "unfreeze", "reverse"].includes(input.kind)
      ? 0
      : yield* Effect.try({
          try: () => moneyToMinor(input.amount ?? 0),
          catch: () =>
            new BankingError({
              message:
                "Enter a positive amount with at most two decimal places.",
              status: 400,
            }),
        });
    if (input.kind === "transfer") {
      const beneficiary = yield* store.one<Beneficiary>(
        "SELECT * FROM beneficiaries WHERE id=? AND bank_id=? AND status='active'",
        input.beneficiaryId ?? "",
        bank.id,
      );
      if (!beneficiary)
        return yield* Effect.fail(
          new BankingError({
            message: "Select an active beneficiary.",
            status: 400,
          }),
        );
    }
    if (input.kind === "reverse") {
      const original = yield* store.one<BankingCommand>(
        "SELECT * FROM commands WHERE id=? AND bank_id=? AND status='posted'",
        input.originalId ?? "",
        bank.id,
      );
      if (!original || !["deposit", "withdrawal"].includes(original.kind))
        return yield* Effect.fail(
          new BankingError({
            message:
              "Only a posted cash deposit or withdrawal can be reversed here.",
            status: 400,
          }),
        );
      const prior = yield* store.one<BankingCommand>(
        "SELECT * FROM commands WHERE bank_id=? AND kind='reverse' AND json_extract(payload,'$.originalId')=? AND status IN ('pending','executing','posted','uncertain')",
        bank.id,
        original.id,
      );
      if (prior)
        return yield* Effect.fail(
          new BankingError({
            message: "A reversal already exists for this transaction.",
            status: 409,
          }),
        );
    }
    const id = crypto.randomUUID();
    const inserted = yield* store.run(
      "INSERT OR IGNORE INTO commands(id,bank_id,key,kind,status,amount_minor,description,maker,account_id,payload) SELECT ?,?,?,?,'pending',?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM core_write_claims WHERE bank_id=? AND account_id=? AND status IN ('executing','uncertain'))",
      id,
      bank.id,
      key,
      input.kind,
      amount,
      input.description?.trim().slice(0, 160) || input.kind,
      session.role,
      accountId,
      JSON.stringify(input),
      bank.id,
      accountId,
    );
    const command = yield* store.one<BankingCommand>(
      "SELECT * FROM commands WHERE bank_id=? AND key=?",
      bank.id,
      key,
    );
    if (!command)
      return yield* Effect.fail(
        new BankingError({
          message:
            inserted === 0
              ? "Another instruction started or requires reconciliation. Inspect it before creating another financial instruction."
              : "Command persistence failed.",
          status: inserted === 0 ? 409 : 503,
        }),
      );
    if (command.payload !== JSON.stringify(input))
      return yield* Effect.fail(
        new BankingError({
          message: "This idempotency key belongs to a different request.",
          status: 409,
        }),
      );
    yield* audit(
      bank.id,
      session.role,
      "Instruction created",
      `${input.kind}: ${amount / 100} INR`,
    );
    if (input.kind === "transfer" && amount <= 2500000)
      return yield* executeCommand(session, command.id, true);
    return command;
  });

export const executeCommand = (
  session: Session,
  id: string,
  straightThrough = false,
) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const core = yield* Core;
    const bank = yield* requiredBank(session);
    const command = yield* store.one<BankingCommand>(
      "SELECT * FROM commands WHERE id=? AND bank_id=?",
      id,
      bank.id,
    );
    if (!command)
      return yield* Effect.fail(
        new BankingError({ message: "Instruction not found.", status: 404 }),
      );
    if (command.status !== "pending") return command;
    const automatic =
      straightThrough &&
      command.kind === "transfer" &&
      command.amount_minor <= 2500000 &&
      session.role === "customer" &&
      command.maker === "customer";
    if (!automatic && !canApprove(session.role, command.maker))
      return yield* Effect.fail(
        new BankingError({
          message: "A separate approver must authorise this instruction.",
          status: 403,
        }),
      );
    const claim = yield* store.run(
      "UPDATE commands SET status='executing',approver=? WHERE id=? AND status='pending' AND NOT EXISTS(SELECT 1 FROM core_write_claims WHERE bank_id=? AND account_id=? AND status IN ('executing','uncertain'))",
      automatic ? "policy:retail-transfer" : session.role,
      command.id,
      bank.id,
      command.account_id,
    );
    if (!claim)
      return yield* Effect.fail(
        new BankingError({
          message:
            "This or another instruction is processing or requires reconciliation.",
          status: 409,
        }),
      );
    const payload = JSON.parse(command.payload) as CommandInput;
    const posting = Effect.gen(function* () {
      const today = bankingDate(yield* Clock.currentTimeMillis);
      const fields = dateFields();
      if (command.kind === "freeze" || command.kind === "unfreeze") {
        return yield* core.request<Created>(
          "POST",
          `savingsaccounts/${bank.customer_account}?command=${command.kind === "freeze" ? "blockDebit" : "unblockDebit"}`,
          command.kind === "freeze"
            ? { reasonForBlock: command.description }
            : {},
          command.id,
        );
      }
      if (command.kind === "reverse") {
        const original = yield* store.one<BankingCommand>(
          "SELECT * FROM commands WHERE id=? AND bank_id=?",
          payload.originalId ?? "",
          bank.id,
        );
        if (!original?.core_id)
          return yield* Effect.fail(
            new BankingError({
              message: "Original posting cannot be located.",
              status: 409,
            }),
          );
        return yield* core.request<Created>(
          "POST",
          `savingsaccounts/${bank.customer_account}/transactions/${original.core_id}?command=undo`,
          {},
          command.id,
        );
      }
      if (["transfer", "salary"].includes(command.kind)) {
        const fromClient =
          command.kind === "salary"
            ? bank.employer_client
            : bank.customer_client;
        const fromAccount =
          command.kind === "salary"
            ? bank.employer_account
            : bank.customer_account;
        const toClient =
          command.kind === "salary"
            ? bank.customer_client
            : bank.recipient_client;
        const toAccount =
          command.kind === "salary"
            ? bank.customer_account
            : bank.recipient_account;
        return yield* core.request<Created>(
          "POST",
          "accounttransfers",
          {
            fromOfficeId: "1",
            toOfficeId: "1",
            fromClientId: String(fromClient),
            toClientId: String(toClient),
            fromAccountType: "2",
            toAccountType: "2",
            fromAccountId: String(fromAccount),
            toAccountId: String(toAccount),
            transferDate: today,
            transferAmount: String(command.amount_minor / 100),
            transferDescription: command.description,
            ...fields,
          },
          command.id,
        );
      }
      const cash = yield* store.one<{ value: string }>(
        "SELECT value FROM settings WHERE key='cash_payment_type'",
      );
      if (!cash)
        return yield* Effect.fail(
          new BankingError({
            message: "Cash payment type has not been configured.",
            status: 503,
          }),
        );
      return yield* core.request<Created>(
        "POST",
        `savingsaccounts/${bank.customer_account}/transactions?command=${command.kind}`,
        {
          transactionDate: today,
          transactionAmount: command.amount_minor / 100,
          paymentTypeId: Number(cash.value),
          receiptNumber: command.id,
          ...fields,
        },
        command.id,
      );
    });
    const result = yield* posting.pipe(
      Effect.tapError((error) =>
        store.run(
          "UPDATE commands SET status=?,error=? WHERE id=?",
          error.uncertain ? "uncertain" : "failed",
          error.message,
          command.id,
        ),
      ),
    );
    yield* store.run(
      "UPDATE commands SET status='posted',core_id=? WHERE id=?",
      result.resourceId,
      command.id,
    );
    yield* audit(
      bank.id,
      automatic ? "policy" : session.role,
      "Instruction posted",
      `${command.kind}: core reference ${result.resourceId}`,
    );
    return {
      ...command,
      status: "posted" as const,
      core_id: result.resourceId,
    };
  });

export const rejectCommand = (session: Session, id: string) =>
  Effect.gen(function* () {
    const store = yield* Store;
    if (session.role !== "approver")
      return yield* Effect.fail(
        new BankingError({ message: "Approver role required.", status: 403 }),
      );
    const changed = yield* store.run(
      "UPDATE commands SET status='rejected',approver=? WHERE id=? AND bank_id=? AND status='pending'",
      session.role,
      id,
      session.bank_id,
    );
    if (!changed)
      return yield* Effect.fail(
        new BankingError({
          message: "Pending instruction not found.",
          status: 404,
        }),
      );
    yield* audit(session.bank_id, session.role, "Instruction rejected", id);
    return { status: "rejected" };
  });
