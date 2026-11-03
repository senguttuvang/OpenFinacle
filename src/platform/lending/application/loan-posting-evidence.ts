import { Effect, Schema } from "effect";
import {
  BankingError,
  bankingDate,
  type Role,
  type Session,
} from "../../banking-workspace/domain/banking";
import { Store } from "../../banking-workspace/domain/ports";
import type { LoanPostingEvidence } from "../domain/origination/loan-posting-evidence";
import {
  LoanWriteInstruction,
  LoanWriteResult,
} from "../domain/origination/loan-writing";
import { LoanCommand } from "../domain/origination/loans";
import { loanContext, readLoanValue, savedLoanDetail } from "./loan-records";
import {
  originalRepaymentOperation,
  savedRepaymentDetail,
} from "./loan-repayment-records";

const invalid = () =>
  Effect.fail(
    new BankingError({
      message: "Saved posting ownership or result cannot be verified.",
      status: 503,
    }),
  );
export const readLoanPostingEvidence = (
  session: Session,
  coreId: number,
  clientId: number,
  accountId: number,
) =>
  Effect.gen(function* () {
    if (session.role === "customer")
      return yield* Effect.fail(
        new BankingError({
          message: "Posting evidence requires a staff demo persona.",
          status: 403,
        }),
      );
    const store = yield* Store;
    const app = yield* store.one<{ id: string }>(
      "SELECT id FROM loan_applications WHERE bank_id=? AND core_id=? AND client_id=? AND account_id=?",
      session.bank_id,
      coreId,
      clientId,
      accountId,
    );
    if (!app)
      return {
        applicationId: null,
        receipts: [],
        errors: [],
      } satisfies LoanPostingEvidence;
    const context = yield* loanContext(session, app.id);
    const sameOwner = (owner: typeof context.owner) =>
      owner.bank_id === session.bank_id &&
      owner.client_id === clientId &&
      owner.savings_account_id === accountId &&
      owner.product_id === context.owner.product_id;
    if (context.loan.core_id !== coreId || !sameOwner(context.owner))
      return yield* invalid();
    const receipts: LoanPostingEvidence["receipts"][number][] = [];
    const errors: string[] = [];
    const history = (
      rows: readonly {
        id: string;
        actor: Role;
        action: string;
        kind: string;
        note: string;
        version: number;
        created_at: string;
      }[],
    ) =>
      rows.slice(0, 100).map((r) => ({
        id: r.id,
        actor: r.actor,
        action: r.action,
        kind: r.kind,
        note: r.note,
        version: r.version,
        createdAt: r.created_at,
      }));
    const orig = yield* store.all(
      "SELECT id,loan_id,bank_id,account_id,client_key,action,actor,status,request_json,original_version,started_at,command_json,result_json,observed_at FROM loan_operations WHERE loan_id=? AND bank_id=? AND status='confirmed' AND action='disburse' ORDER BY rowid LIMIT 201",
      app.id,
      session.bank_id,
    );
    if (orig.length > 200)
      errors.push("Disbursement receipt coverage is limited.");
    for (const raw of orig.slice(0, 200)) {
      const receipt = yield* Effect.gen(function* () {
        const row = yield* readLoanValue(
          Schema.Struct({
            id: Schema.String,
            loan_id: Schema.String,
            bank_id: Schema.String,
            account_id: Schema.Number,
            client_key: Schema.String,
            action: Schema.Literal("disburse"),
            actor: Schema.Literal("approver"),
            status: Schema.Literal("confirmed"),
            request_json: Schema.parseJson(LoanCommand),
            original_version: Schema.Number.pipe(
              Schema.int(),
              Schema.nonNegative(),
            ),
            started_at: Schema.Number.pipe(Schema.int(), Schema.positive()),
            command_json: Schema.parseJson(LoanWriteInstruction),
            result_json: Schema.parseJson(LoanWriteResult),
            observed_at: Schema.Number.pipe(Schema.int(), Schema.positive()),
          }),
          raw,
        );
        const command = row.command_json,
          result = row.result_json;
        if (
          row.bank_id !== session.bank_id ||
          row.loan_id !== app.id ||
          row.account_id !== accountId ||
          row.request_json.id !== app.id ||
          row.request_json.action !== "disburse" ||
          row.request_json.version !== row.original_version ||
          row.request_json.note !== command.note ||
          command.consented_at !== context.loan.accepted_at ||
          command.expected_disbursement_date !==
            context.quote.expected_disbursement_date ||
          row.started_at < context.loan.accepted_at ||
          row.observed_at < row.started_at ||
          command.date !== bankingDate(row.started_at) ||
          command.action !== "disburse" ||
          command.core_id !== coreId ||
          command.external_id !== `of-loan-${app.id}` ||
          command.key !== `of-loan-op-${row.id}` ||
          !sameOwner(command.owner) ||
          JSON.stringify(command.quote) !== JSON.stringify(context.quote) ||
          JSON.stringify(command.terms) !==
            JSON.stringify(context.quote.terms) ||
          result.loan.id !== coreId ||
          result.loan.external_id !== command.external_id ||
          !sameOwner(result.loan.owner) ||
          result.transaction_id === null ||
          !result.loan.disbursements.some(
            (d) =>
              d.id === result.transaction_id &&
              !d.reversed &&
              d.amount_minor === context.quote.schedule.principal_minor &&
              d.date === command.date &&
              d.transfer?.id === result.transfer_id &&
              !d.transfer.reversed &&
              d.transfer.amount_minor === d.amount_minor &&
              d.transfer.date === d.date,
          )
        )
          return yield* invalid();
        const saved = yield* savedLoanDetail(session, app.id);
        return {
          kind: "disbursement" as const,
          recordId: app.id,
          operationId: row.id,
          transactionId: result.transaction_id,
          actor: row.actor,
          observedAt: row.observed_at,
          historyComplete: saved.history.length <= 100,
          history: history(saved.history),
        };
      }).pipe(
        Effect.catchAll(() => {
          errors.push(
            "A saved disbursement receipt is unavailable or invalid; no posting link inferred.",
          );
          return Effect.succeed(null);
        }),
      );
      if (receipt) receipts.push(receipt);
    }
    const repayments = yield* store.all<{ id: string; request_id: string }>(
      "SELECT id,request_id FROM loan_repayment_operations WHERE loan_id=? AND bank_id=? AND status='confirmed' ORDER BY rowid LIMIT 201",
      app.id,
      session.bank_id,
    );
    if (repayments.length > 200)
      errors.push("Repayment receipt coverage is limited.");
    for (const row of repayments.slice(0, 200)) {
      const receipt = yield* Effect.gen(function* () {
        const op = yield* originalRepaymentOperation(
          session,
          row.request_id,
          row.id,
        );
        if (
          op?.status !== "confirmed" ||
          !op.result ||
          op.command_json.offer.core_id !== coreId ||
          !sameOwner(op.command_json.offer.owner) ||
          op.result.loan.id !== coreId ||
          !sameOwner(op.result.loan.owner)
        )
          return yield* invalid();
        const saved = yield* savedRepaymentDetail(session, row.request_id);
        return {
          kind: "repayment" as const,
          recordId: row.request_id,
          operationId: op.id,
          transactionId: op.result.loan_transaction_id,
          actor: "approver" as const,
          observedAt: op.observed_at,
          historyComplete: saved.history.length <= 100,
          history: history(saved.history),
        };
      }).pipe(
        Effect.catchAll(() => {
          errors.push(
            "A saved repayment receipt is unavailable or invalid; no posting link inferred.",
          );
          return Effect.succeed(null);
        }),
      );
      if (receipt) receipts.push(receipt);
    }
    const counts = new Map<number, number>();
    for (const receipt of receipts)
      counts.set(
        receipt.transactionId,
        (counts.get(receipt.transactionId) ?? 0) + 1,
      );
    const ambiguous = [...counts].some(([, count]) => count > 1);
    if (ambiguous)
      errors.push("Ambiguous stored transaction references were withheld.");
    return {
      applicationId: app.id,
      receipts: receipts.filter((r) => counts.get(r.transactionId) === 1),
      errors,
    } satisfies LoanPostingEvidence;
  });
