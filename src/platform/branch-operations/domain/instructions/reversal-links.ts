import { Option, Schema } from "effect";
import type {
  Account,
  BankingCommand,
} from "../../../banking-workspace/domain/banking";
import { type BranchRelationship, coreDate } from "../branch-day";
import { inrMinor } from "../inr-money";

const payload = Schema.parseJson(
  Schema.Struct({
    kind: Schema.Literal("reverse"),
    originalId: Schema.NonEmptyString,
  }),
);
const active = new Set<BankingCommand["status"]>([
  "pending",
  "executing",
  "posted",
  "uncertain",
]);
const cash = (c: BankingCommand) =>
  c.kind === "deposit" || c.kind === "withdrawal";
const owned = (r: BranchRelationship, c: BankingCommand) =>
  c.bank_id === r.customer.bank_id && c.account_id === r.customer.account_id;
const originalId = (c: BankingCommand) => {
  if (c.kind !== "reverse") return null;
  const value = Schema.decodeUnknownOption(payload)(c.payload);
  return Option.isSome(value) ? value.value.originalId : null;
};
export const ownedInstruction = (r: BranchRelationship, id: string) => {
  const rows = r.commands.filter((c) => c.id === id && owned(r, c));
  return rows.length === 1 ? rows[0] : null;
};
type NativeTransaction = NonNullable<Account["transactions"]>[number];
function nativeOriginal(
  r: BranchRelationship,
  original: BankingCommand | null,
): NativeTransaction | null {
  const a = r.account;
  if (
    !original ||
    !a ||
    a.id !== r.customer.account_id ||
    a.clientId !== r.customer.client_id ||
    a.accountNo !== r.customer.account_no ||
    a.currency?.code !== "INR" ||
    a.currency.decimalPlaces !== 2 ||
    !Number.isSafeInteger(original.core_id) ||
    Number(original.core_id) <= 0 ||
    !Number.isSafeInteger(original.amount_minor) ||
    original.amount_minor <= 0
  )
    return null;
  const rows = a.transactions?.filter((t) => t.id === original.core_id) ?? [];
  if (rows.length !== 1) return null;
  const t = rows[0],
    deposit = original.kind === "deposit";
  return inrMinor(t.amount) === original.amount_minor &&
    coreDate(t.date) !== "Unknown" &&
    (t.accountId === undefined || t.accountId === a.id) &&
    (t.accountNo === undefined || t.accountNo === a.accountNo) &&
    (t.currency === undefined ||
      (t.currency.code === "INR" && t.currency.decimalPlaces === 2)) &&
    (deposit
      ? t.transactionType.deposit === true &&
        t.transactionType.withdrawal !== true &&
        t.entryType === "CREDIT"
      : t.transactionType.withdrawal === true &&
        t.transactionType.deposit !== true &&
        t.entryType === "DEBIT")
    ? t
    : null;
}
export function cashReversalTrace(
  r: BranchRelationship,
  selected: BankingCommand,
  limited: boolean,
) {
  const valid = ownedInstruction(r, selected.id) === selected;
  const commands = r.commands.filter((c) => owned(r, c));
  const counts = new Map<string, number>();
  for (const c of commands) counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
  const linkedId = originalId(selected);
  const candidate = valid
    ? cash(selected)
      ? selected
      : linkedId
        ? ownedInstruction(r, linkedId)
        : null
    : null;
  const original =
    candidate && cash(candidate) && candidate.status === "posted"
      ? candidate
      : null;
  const reversals = original
    ? commands.filter(
        (c) =>
          counts.get(c.id) === 1 &&
          c.kind === "reverse" &&
          originalId(c) === original.id,
      )
    : [];
  const blocking = reversals.filter((c) => active.has(c.status));
  const complete =
    !limited &&
    counts.size === commands.length &&
    commands.every(
      (c) =>
        c.kind !== "reverse" || !active.has(c.status) || originalId(c) !== null,
    );
  const native = nativeOriginal(r, original);
  const reason = !valid
    ? "scope"
    : !original
      ? "original_unavailable"
      : !complete
        ? "history_incomplete"
        : blocking.length
          ? "existing_reversal"
          : !native
            ? "native_unavailable"
            : native.reversed === true
              ? "already_reversed"
              : native.reversed !== false
                ? "native_state_unknown"
                : "eligible";
  return {
    original,
    reversals,
    blocking,
    native,
    complete,
    reason,
    canRequest: valid && cash(selected) && reason === "eligible",
  };
}
