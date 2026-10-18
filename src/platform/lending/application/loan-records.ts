import { Clock, Effect, Schema } from "effect";
import {
  BankingError,
  bankingDate,
  RoleSchema,
  type Session,
} from "../../banking-workspace/domain/banking";
import { Store } from "../../banking-workspace/domain/ports";
import { CoreLoanSnapshot } from "../domain/origination/loan-engine";
import {
  availableLoanActions,
  LoanApplication,
  LoanDetail,
  LoanEvent,
  LoanOperation,
  LoanRequest,
} from "../domain/origination/loan-workflow";
import {
  LoanWriteInstruction,
  LoanWriteResult,
  validateLoanWriteInstruction,
} from "../domain/origination/loan-writing";
import {
  type LoanCommand,
  LoanQuote,
  LoanTerms,
  type loanDecision,
  validateLoanQuote,
  validateLoanSchedule,
} from "../domain/origination/loans";

export const loanFailure = (message: string, status = 409, uncertain = false) =>
  Effect.fail(new BankingError({ message, status, uncertain }));
export const loanNow = Effect.gen(function* () {
  const now = yield* Clock.currentTimeMillis;
  if (
    !Number.isSafeInteger(now) ||
    now <= 0 ||
    !Number.isFinite(new Date(now).getTime())
  )
    return yield* loanFailure(
      "The current loan instruction time could not be verified.",
      503,
    );
  return now;
});
export const readLoanValue = <A, I>(
  schema: Schema.Schema<A, I>,
  value: unknown,
) =>
  Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError(
      () =>
        new BankingError({
          message:
            "Saved loan data could not be verified. Inspect the original instruction before continuing.",
          status: 503,
        }),
    ),
  );
const flag = Schema.transform(Schema.Literal(0, 1), Schema.Boolean, {
  strict: true,
  decode: (value) => value === 1,
  encode: (value) => (value ? 1 : 0),
});
const identifier = Schema.Number.pipe(Schema.int(), Schema.positive());
const ContextRow = Schema.Struct({
  ...LoanApplication.fields,
  terms: Schema.parseJson(LoanTerms),
  withdrawal_requested: flag,
  quote_json: Schema.parseJson(LoanQuote),
  account_id: identifier,
  client_id: identifier,
  product_id: identifier,
});
const contextSql =
  "SELECT l.*,q.quote_json,json_extract(q.quote_json,'$.terms') AS terms FROM loan_applications l JOIN loan_quotes q ON q.id=l.quote_id";
const decodeContext = (row: unknown) =>
  Effect.gen(function* () {
    const {
      quote_json: quote,
      account_id,
      client_id,
      product_id,
      ...loan
    } = yield* readLoanValue(ContextRow, row);
    const owner = {
      bank_id: loan.bank_id,
      product_id,
      client_id,
      savings_account_id: account_id,
    };
    if (quote.id !== loan.quote_id)
      return yield* loanFailure(
        "The original loan quote link could not be verified.",
        503,
      );
    yield* validateLoanQuote(quote, loan.terms, owner, loan.accepted_at);
    return { loan, quote, owner };
  });
export const loanContext = (session: Session, id: string) =>
  Effect.gen(function* () {
    const row = yield* (yield* Store).one(
      `${contextSql} WHERE l.id=? AND l.bank_id=?`,
      id,
      session.bank_id,
    );
    if (!row) return yield* loanFailure("Loan application not found.", 404);
    return yield* decodeContext(row);
  });
export const listLoanApplications = (session: Session) =>
  Effect.gen(function* () {
    const rows = yield* (yield* Store).all(
      `${contextSql} WHERE l.bank_id=? ORDER BY l.created_at DESC,l.rowid DESC`,
      session.bank_id,
    );
    return {
      loans: yield* Effect.forEach(rows, (row) =>
        decodeContext(row).pipe(Effect.map((value) => value.loan)),
      ),
    };
  });
const validLoanKey = (key: string) => /^[a-zA-Z0-9_-]{8,100}$/.test(key);
const KeyRecord = Schema.Struct({
  loan_id: Schema.NonEmptyString,
  actor: RoleSchema,
  request_json: Schema.parseJson(LoanRequest),
  operation_id: Schema.NullOr(Schema.NonEmptyString),
});
const loanKeyRecord = (session: Session, key: string) =>
  Effect.gen(function* () {
    if (!validLoanKey(key))
      return yield* loanFailure(
        "A stable original loan instruction reference is required.",
        400,
      );
    const row = yield* (yield* Store).one(
      "SELECT loan_id,actor,request_json,operation_id FROM loan_events WHERE bank_id=? AND command_key=?",
      session.bank_id,
      key,
    );
    return row ? yield* readLoanValue(KeyRecord, row) : null;
  });
export const replayLoanRequest = (
  session: Session,
  key: string,
  request: typeof LoanRequest.Type,
) =>
  Effect.gen(function* () {
    const recorded = yield* loanKeyRecord(session, key);
    if (
      recorded &&
      (recorded.actor !== session.role ||
        JSON.stringify(recorded.request_json) !== JSON.stringify(request))
    )
      return yield* loanFailure(
        "This reference belongs to a different original loan instruction or role. Inspect its saved history.",
      );
    return recorded;
  });
export const originalLoanOperation = (session: Session, loanId: string) =>
  Effect.gen(function* () {
    const row = yield* (yield* Store).one(
      "SELECT *,client_key AS key FROM loan_operations WHERE loan_id=? AND bank_id=? ORDER BY rowid DESC LIMIT 1",
      loanId,
      session.bank_id,
    );
    if (!row) return null;
    return yield* readLoanValue(
      Schema.Struct({
        ...LoanOperation.fields,
        request_json: Schema.parseJson(LoanRequest),
        command_json: Schema.parseJson(LoanWriteInstruction),
      }),
      row,
    );
  });
const readCoreView = (id: string) =>
  Effect.gen(function* () {
    const row = yield* (yield* Store).one(
      "SELECT snapshot_json AS snapshot,synced_at,stale FROM loan_core_views WHERE loan_id=?",
      id,
    );
    if (!row) return null;
    const value = yield* readLoanValue(
      Schema.Struct({
        snapshot: Schema.parseJson(CoreLoanSnapshot),
        synced_at: identifier,
        stale: flag,
      }),
      row,
    );
    const now = yield* Clock.currentTimeMillis;
    return {
      ...value,
      source: "fineract" as const,
      stale:
        value.stale || now < value.synced_at || now - value.synced_at > 300000,
    };
  });
export const savedLoanDetail = (
  session: Session,
  id: string,
  key: string | null = null,
) =>
  Effect.gen(function* () {
    const { loan, quote, owner } = yield* loanContext(session, id);
    const store = yield* Store;
    const core = yield* readCoreView(id);
    if (core) {
      const snapshot = core.snapshot;
      if (
        snapshot.id !== loan.core_id ||
        snapshot.external_id !== `of-loan-${loan.id}` ||
        snapshot.owner.bank_id !== owner.bank_id ||
        snapshot.owner.product_id !== owner.product_id ||
        snapshot.owner.client_id !== owner.client_id ||
        snapshot.owner.savings_account_id !== owner.savings_account_id ||
        snapshot.principal_minor !== quote.schedule.principal_minor ||
        snapshot.expected_disbursement_date !== quote.expected_disbursement_date
      )
        return yield* loanFailure(
          "The saved Core view does not match this owned loan. Inspect its original instruction.",
          503,
        );
      if (snapshot.status === "active")
        yield* validateLoanSchedule(
          snapshot.schedule,
          quote.terms,
          snapshot.actual_disbursement_date ?? "",
        );
    }
    const operation = yield* originalLoanOperation(session, id);
    const pending =
      operation?.status === "executing" || operation?.status === "uncertain";
    const rows = yield* store.all(
      "SELECT id,actor,action,kind,note,status,operation_status,version,created_at FROM loan_events WHERE loan_id=? AND bank_id=? ORDER BY version",
      id,
      session.bank_id,
    );
    const history = yield* Effect.forEach(rows, (row) =>
      readLoanValue(LoanEvent, row),
    );
    if (
      history.length !== loan.version + 1 ||
      history.at(-1)?.version !== loan.version
    )
      return yield* loanFailure(
        "This loan changed while its saved view was loading. Refresh before another decision.",
      );
    const availability = availableLoanActions(
      loan,
      quote,
      session.role,
      pending,
      yield* Clock.currentTimeMillis,
      core !== null && core.snapshot.status !== loan.status,
    );
    const accountClaim = yield* store.one(
      "SELECT id FROM core_write_claims WHERE bank_id=? AND account_id=? AND status IN ('executing','uncertain') LIMIT 1",
      session.bank_id,
      owner.savings_account_id,
    );
    const coreActions = new Set([
      "register",
      "approve",
      "disburse",
      "undo_approval",
      "withdraw",
    ]);
    const actions = availability.actions.filter(
      (action) => !accountClaim || !coreActions.has(action),
    );
    const reason =
      availability.reason ??
      (accountClaim
        ? "This account has an original instruction awaiting confirmation. Inspect it before another Core instruction."
        : null);
    const financial = yield* store.one<{
      synced_at: number;
      invalidated_at: number;
    }>(
      "SELECT synced_at,invalidated_at FROM financial_snapshots WHERE bank_id=?",
      session.bank_id,
    );
    const recorded = key ? yield* loanKeyRecord(session, key) : null;
    if (key && (!recorded || recorded.loan_id !== id))
      return yield* loanFailure(
        "The original instruction reference is not recorded for this loan. Check again before sending another Core instruction.",
        404,
        true,
      );
    let recordedOperation: LoanOperation | null = null;
    if (recorded?.operation_id) {
      const original = yield* store.one(
        "SELECT id,action,client_key AS key,actor,status,version,started_at,observed_at,error FROM loan_operations WHERE id=? AND loan_id=? AND bank_id=?",
        recorded.operation_id,
        id,
        session.bank_id,
      );
      recordedOperation = yield* readLoanValue(LoanOperation, original);
      if (
        recordedOperation.key !== key ||
        recordedOperation.actor !== recorded.actor ||
        !("action" in recorded.request_json) ||
        recordedOperation.action !== recorded.request_json.action
      )
        return yield* loanFailure(
          "The original operation does not match its saved instruction reference.",
          503,
        );
    }
    return yield* readLoanValue(LoanDetail, {
      loan,
      quote,
      core,
      operation,
      history,
      actions,
      unavailable_reason: reason,
      financial_view_stale:
        !financial || financial.synced_at < financial.invalidated_at,
      recorded_key: key,
      recorded_actor: recorded?.actor ?? null,
      recorded_request: recorded?.request_json ?? null,
      recorded_operation: recordedOperation,
    });
  });
export const savedLoanForKey = (session: Session, key: string) =>
  Effect.gen(function* () {
    const recorded = yield* loanKeyRecord(session, key);
    if (!recorded)
      return yield* loanFailure(
        "No original loan instruction is recorded with this reference yet. Check again; do not send another Core instruction.",
        404,
        true,
      );
    return yield* savedLoanDetail(session, recorded.loan_id, key);
  });

const reservationUnknown = () =>
  new BankingError({
    message:
      "The original loan reservation acknowledgement is unavailable. Check its saved reference; do not send another Core instruction.",
    status: 503,
    uncertain: true,
  });
export const persistLoanQuote = (quote: LoanQuote) =>
  Effect.gen(function* () {
    yield* (yield* Store).run(
      "INSERT INTO loan_quotes(id,bank_id,account_id,client_id,product_id,quote_json,quoted_at,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      quote.id,
      quote.bank_id,
      quote.savings_account_id,
      quote.client_id,
      quote.product_id,
      JSON.stringify(quote),
      quote.quoted_at,
      quote.expires_at,
      new Date(quote.quoted_at).toISOString(),
    );
  });
export const readOwnedLoanQuote = (session: Session, id: string) =>
  Effect.gen(function* () {
    const row = yield* (yield* Store).one<{ quote_json: string }>(
      "SELECT quote_json FROM loan_quotes WHERE id=? AND bank_id=?",
      id,
      session.bank_id,
    );
    if (!row)
      return yield* loanFailure(
        "Owned loan quote not found. Request and review a new quote.",
        404,
      );
    return yield* readLoanValue(Schema.parseJson(LoanQuote), row.quote_json);
  });
export const insertLoanAcceptance = (
  session: Session,
  quote: LoanQuote,
  key: string,
  origin: LoanApplication["origin"],
  now: number,
) =>
  Effect.gen(function* () {
    const id = crypto.randomUUID();
    const request = { quote_id: quote.id, consent: true as const };
    const inserted = yield* (yield* Store)
      .run(
        "INSERT INTO loan_events(id,loan_id,bank_id,quote_id,origin,accepted_at,command_key,request_json,actor,action,kind,note,status,maker,checker,core_id,withdrawal_requested,version,at_ms,created_at) SELECT ?,?,q.bank_id,q.id,?,?,?,?,'customer','submit','decision','Customer accepted the immutable demonstration quote.','submitted',NULL,NULL,NULL,0,0,?,? FROM loan_quotes q WHERE q.id=? AND q.bank_id=? AND NOT EXISTS(SELECT 1 FROM loan_events WHERE bank_id=? AND command_key=?) AND NOT EXISTS(SELECT 1 FROM loan_applications WHERE quote_id=q.id OR (bank_id=q.bank_id AND status IN ('submitted','recommended','registered','approved')))",
        crypto.randomUUID(),
        id,
        origin,
        now,
        key,
        JSON.stringify(request),
        now,
        new Date(now).toISOString(),
        quote.id,
        session.bank_id,
        session.bank_id,
        key,
      )
      .pipe(Effect.mapError(reservationUnknown));
    return { id, inserted };
  });
export const insertLoanDecision = (
  session: Session,
  context: Effect.Effect.Success<ReturnType<typeof loanContext>>,
  input: LoanCommand,
  proposal: Effect.Effect.Success<ReturnType<typeof loanDecision>>,
  key: string,
  now: number,
) =>
  Effect.gen(function* () {
    const l = context.loan;
    return yield* (yield* Store)
      .run(
        "INSERT INTO loan_events(id,loan_id,bank_id,quote_id,origin,accepted_at,command_key,request_json,actor,action,kind,note,status,maker,checker,core_id,withdrawal_requested,version,at_ms,created_at) SELECT ?,l.id,l.bank_id,l.quote_id,l.origin,l.accepted_at,?,?,?,?,'decision',?,?,?,?,?, ?,l.version+1,?,? FROM loan_applications l WHERE l.id=? AND l.bank_id=? AND l.version=? AND NOT EXISTS(SELECT 1 FROM loan_operations WHERE loan_id=l.id AND status IN ('executing','uncertain')) AND NOT EXISTS(SELECT 1 FROM loan_events WHERE bank_id=l.bank_id AND command_key=?)",
        crypto.randomUUID(),
        key,
        JSON.stringify(input),
        session.role,
        input.action,
        input.note,
        proposal.next_status,
        proposal.maker,
        proposal.checker,
        l.core_id,
        proposal.withdrawal_requested ? 1 : 0,
        now,
        new Date(now).toISOString(),
        l.id,
        session.bank_id,
        input.version,
        key,
      )
      .pipe(Effect.mapError(reservationUnknown));
  });
export const reserveLoanOperation = (
  session: Session,
  context: Effect.Effect.Success<ReturnType<typeof loanContext>>,
  input: LoanCommand,
  action: LoanWriteInstruction["action"],
  key: string,
  now: number,
) =>
  Effect.gen(function* () {
    const id = crypto.randomUUID();
    const { loan, quote, owner } = context;
    const command = yield* validateLoanWriteInstruction(
      {
        owner,
        terms: quote.terms,
        quote,
        consented_at: loan.accepted_at,
        expected_disbursement_date: quote.expected_disbursement_date,
        external_id: `of-loan-${loan.id}`,
        action,
        key: `of-loan-op-${id}`,
        date: bankingDate(now),
        note: input.note,
        ...(loan.core_id === null ? {} : { core_id: loan.core_id }),
        ...(action === "disburse"
          ? { transaction_external_id: `of-loan-disburse-${id}` }
          : {}),
      },
      now,
      "dispatch",
    );
    const inserted = yield* (yield* Store)
      .run(
        "INSERT INTO loan_operations(id,loan_id,bank_id,account_id,client_key,request_json,command_json,action,actor,original_version,status,version,started_at,observed_at,created_at,updated_at) SELECT ?,l.id,l.bank_id,l.account_id,?,?,?,?,'approver',l.version,'executing',0,?,?,?,? FROM loan_applications l WHERE l.id=? AND l.bank_id=? AND l.version=? AND NOT EXISTS(SELECT 1 FROM loan_events WHERE bank_id=l.bank_id AND command_key=?) AND NOT EXISTS(SELECT 1 FROM loan_operations WHERE loan_id=l.id AND status IN ('executing','uncertain')) AND NOT EXISTS(SELECT 1 FROM core_write_claims WHERE bank_id=l.bank_id AND account_id=l.account_id AND status IN ('executing','uncertain'))",
        id,
        key,
        JSON.stringify(input),
        JSON.stringify(command),
        action,
        now,
        now,
        new Date(now).toISOString(),
        new Date(now).toISOString(),
        loan.id,
        session.bank_id,
        input.version,
        key,
      )
      .pipe(Effect.mapError(reservationUnknown));
    return { id, command, inserted, version: 0, status: "executing" as const };
  });
export const persistLoanOutcome = (
  session: Session,
  operation: Pick<LoanOperation, "id" | "version" | "status">,
  status: "confirmed" | "uncertain" | "failed",
  result: LoanWriteResult | null = null,
) =>
  Effect.gen(function* () {
    const verified =
      result === null ? null : yield* readLoanValue(LoanWriteResult, result);
    const now = yield* loanNow;
    return yield* (yield* Store).run(
      "UPDATE loan_operations SET status=?,version=version+1,result_json=?,error=?,observed_at=?,updated_at=? WHERE id=? AND bank_id=? AND version=? AND status=?",
      status,
      verified === null ? null : JSON.stringify(verified),
      status === "confirmed"
        ? null
        : status === "uncertain"
          ? "Original Core result remains unconfirmed. Inspect it; do not repeat the write."
          : "The original instruction was not dispatched or was definitely rejected. Review its saved history.",
      now,
      new Date(now).toISOString(),
      operation.id,
      session.bank_id,
      operation.version,
      operation.status,
    );
  }).pipe(
    Effect.mapError(
      () =>
        new BankingError({
          message:
            "The original Core outcome acknowledgement is unavailable. Inspect the saved instruction; do not send another Core write.",
          status: 503,
          uncertain: true,
        }),
    ),
  );
export const persistLoanCoreView = (
  loanId: string,
  snapshot: CoreLoanSnapshot,
) =>
  Effect.gen(function* () {
    const verified = yield* readLoanValue(CoreLoanSnapshot, snapshot);
    const now = yield* loanNow;
    yield* (yield* Store).run(
      "INSERT INTO loan_core_views(loan_id,snapshot_json,synced_at,stale) VALUES(?,?,?,0) ON CONFLICT(loan_id) DO UPDATE SET snapshot_json=excluded.snapshot_json,synced_at=excluded.synced_at,stale=0 WHERE excluded.synced_at>=loan_core_views.synced_at",
      loanId,
      JSON.stringify(verified),
      now,
    );
  });
