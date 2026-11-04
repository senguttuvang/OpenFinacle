import { Schema } from "effect";
import { bankingDate, type Role } from "../../banking-workspace/domain/banking";
import { coreDate } from "./branch-day";
export const cashDenominations = [
  50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50,
] as const;
const nonempty = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(1000),
);
const count = Schema.Number.pipe(
  Schema.int(),
  Schema.nonNegative(),
  Schema.filter(Number.isSafeInteger),
);
export const CashQuantities = Schema.Array(
  Schema.Struct({
    denominationMinor: Schema.Literal(...cashDenominations),
    quantity: Schema.Number.pipe(Schema.int(), Schema.between(0, 1000000)),
  }),
).pipe(
  Schema.itemsCount(10),
  Schema.filter(
    (rows) => new Set(rows.map((r) => r.denominationMinor)).size === 10,
  ),
);
export type CashQuantities = typeof CashQuantities.Type;
export const declaredCashTotal = (rows: unknown) =>
  Schema.is(CashQuantities)(rows)
    ? rows.reduce((sum, r) => sum + r.denominationMinor * r.quantity, 0)
    : null;
const date = Schema.String.pipe(
  Schema.filter(
    (d) =>
      /^\d{4}-\d{2}-\d{2}$/.test(d) && coreDate(d.split("-").map(Number)) === d,
  ),
);
export const CashCountInput = Schema.Struct({
  boxType: Schema.Literal("teller", "vault"),
  label: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(80)),
  countDate: date,
  quantities: CashQuantities,
  note: nonempty,
});
export type CashCountInput = typeof CashCountInput.Type;
export const CashCountAction = Schema.Union(
  Schema.Struct({
    id: Schema.NonEmptyString,
    version: count,
    action: Schema.Literal("review", "return", "withdraw"),
    note: nonempty,
  }),
  Schema.Struct({
    id: Schema.NonEmptyString,
    version: count,
    action: Schema.Literal("resubmit"),
    note: nonempty,
    quantities: CashQuantities,
  }),
);
export type CashCountAction = typeof CashCountAction.Type;
export const CashCountKey = Schema.String.pipe(
  Schema.pattern(/^[a-zA-Z0-9_-]{8,100}$/),
);
export const CashSnapshot = Schema.Struct({
  source: Schema.Literal("synthetic_declaration"),
  currency: Schema.Literal("INR"),
  boxType: CashCountInput.fields.boxType,
  label: CashCountInput.fields.label,
  countDate: date,
  quantities: CashQuantities,
  totalMinor: count,
}).pipe(
  Schema.filter(
    (v) =>
      v.label === v.label.trim() &&
      declaredCashTotal(v.quantities) === v.totalMinor,
  ),
);
export type CashSnapshot = typeof CashSnapshot.Type;
export const CashCountEvent = Schema.Struct({
  id: Schema.NonEmptyString,
  branchId: Schema.NonEmptyString,
  countId: Schema.NonEmptyString,
  key: CashCountKey,
  actor: Schema.Literal("officer", "approver"),
  action: Schema.Literal("declare", "review", "return", "resubmit", "withdraw"),
  version: Schema.Number.pipe(Schema.int(), Schema.positive()),
  status: Schema.Literal("submitted", "reviewed", "returned", "withdrawn"),
  snapshot: CashSnapshot,
  note: nonempty,
  createdAt: Schema.String.pipe(
    Schema.filter((s) => Number.isFinite(Date.parse(s))),
  ),
});
export type CashCountEvent = typeof CashCountEvent.Type;
export const countActions = (
  record: CashCountEvent,
  role: Role,
): CashCountAction["action"][] =>
  role === "approver" && record.status === "submitted"
    ? ["review", "return"]
    : role === "officer" && record.status === "returned"
      ? ["resubmit", "withdraw"]
      : role === "officer" && record.status === "submitted"
        ? ["withdraw"]
        : [];
export const validCountEvent = (e: CashCountEvent) =>
  e.snapshot.countDate <= bankingDate(Date.parse(e.createdAt)) &&
  (e.action === "declare"
    ? e.version === 1 && e.actor === "officer" && e.status === "submitted"
    : e.version > 1 &&
      (e.action === "review"
        ? e.actor === "approver" && e.status === "reviewed"
        : e.action === "return"
          ? e.actor === "approver" && e.status === "returned"
          : e.action === "resubmit"
            ? e.actor === "officer" && e.status === "submitted"
            : e.actor === "officer" && e.status === "withdrawn"));
const sameCountIdentity = (a: CashSnapshot, b: CashSnapshot) =>
  a.boxType === b.boxType && a.label === b.label && a.countDate === b.countDate;
export const sameCountSnapshot = (a: CashSnapshot, b: CashSnapshot) =>
  sameCountIdentity(a, b) &&
  a.totalMinor === b.totalMinor &&
  cashDenominations.every(
    (d) =>
      a.quantities.find((r) => r.denominationMinor === d)?.quantity ===
      b.quantities.find((r) => r.denominationMinor === d)?.quantity,
  );
const CashCountDetailModel = Schema.Struct({
  branchId: Schema.String,
  record: CashCountEvent,
  history: Schema.Array(CashCountEvent).pipe(Schema.maxItems(200)),
  historyComplete: Schema.Boolean,
  actions: Schema.Array(
    Schema.Literal("review", "return", "resubmit", "withdraw"),
  ),
  confirmedEvent: Schema.NullOr(CashCountEvent),
});
export const validCountHistory = (v: typeof CashCountDetailModel.Type) =>
  validCountEvent(v.record) &&
  v.record.branchId === v.branchId &&
  v.history.length > 0 &&
  v.history.every(
    (e, i) =>
      validCountEvent(e) &&
      e.branchId === v.branchId &&
      e.countId === v.record.countId &&
      e.version === i + 1 &&
      sameCountIdentity(e.snapshot, v.record.snapshot) &&
      (i === 0 ||
        (e.action !== "declare" &&
          countActions(v.history[i - 1], e.actor).includes(e.action) &&
          (e.action === "resubmit" ||
            sameCountSnapshot(e.snapshot, v.history[i - 1].snapshot)))),
  ) &&
  (v.historyComplete
    ? v.history.length === v.record.version &&
      JSON.stringify(v.history[v.history.length - 1]) ===
        JSON.stringify(v.record)
    : v.actions.length === 0 &&
      v.history.length === 200 &&
      v.record.version > v.history.length) &&
  (!v.confirmedEvent ||
    (validCountEvent(v.confirmedEvent) &&
      v.confirmedEvent.branchId === v.branchId &&
      v.confirmedEvent.countId === v.record.countId &&
      v.confirmedEvent.version <= v.record.version &&
      (v.confirmedEvent.version > v.history.length ||
        JSON.stringify(v.history[v.confirmedEvent.version - 1]) ===
          JSON.stringify(v.confirmedEvent))));
export const CashCountDetail = CashCountDetailModel.pipe(
  Schema.filter(validCountHistory),
);
export type CashCountDetail = typeof CashCountDetail.Type;
export const CashCountList = Schema.Struct({
  branchId: Schema.String,
  observedAt: Schema.Number.pipe(Schema.finite()),
  limit: Schema.Literal(100),
  limited: Schema.Boolean,
  records: Schema.Array(CashCountEvent).pipe(Schema.maxItems(100)),
}).pipe(
  Schema.filter(
    (v) =>
      new Set(v.records.map((e) => e.countId)).size === v.records.length &&
      v.records.every((e) => e.branchId === v.branchId && validCountEvent(e)),
  ),
);
export type CashCountList = typeof CashCountList.Type;
