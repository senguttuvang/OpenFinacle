import { Effect, Schema } from "effect";
import {
  BankingError,
  type Role,
} from "../../../banking-workspace/domain/banking";
import { api } from "../../../banking-workspace/ui/api";
import {
  CashCountAction,
  CashCountDetail,
  CashCountInput,
  CashCountKey,
  CashCountList,
  sameCountSnapshot,
} from "../../domain/cash-counts";

export const PendingCount = Schema.Union(
  Schema.Struct({
    key: CashCountKey,
    kind: Schema.Literal("declare"),
    command: CashCountInput,
  }),
  Schema.Struct({
    key: CashCountKey,
    kind: Schema.Literal("action"),
    command: CashCountAction,
  }),
);
export type PendingCount = typeof PendingCount.Type;
const invalid = () =>
  new BankingError({
    message:
      "Count response could not be verified. Inspect the original action reference before retrying.",
    status: 503,
    uncertain: true,
  });
const decode = <A, I>(
  schema: Schema.Schema<A, I>,
  branchId: string,
  value: unknown,
) =>
  Schema.decodeUnknown(schema)(value).pipe(
    Effect.filterOrFail(
      (v) =>
        typeof v === "object" &&
        v !== null &&
        "branchId" in v &&
        v.branchId === branchId,
      invalid,
    ),
    Effect.mapError(invalid),
  );
export const countListApi = (customerId: string, branchId: string) =>
  api<unknown>(
    `/branch/cash-counts?customerId=${encodeURIComponent(customerId)}`,
  ).pipe(Effect.flatMap((value) => decode(CashCountList, branchId, value)));
export const countDetailApi = (
  customerId: string,
  branchId: string,
  selector: { id: string } | { key: string },
  pending?: PendingCount,
  role?: Role,
) =>
  api<unknown>(
    `/branch/cash-counts?customerId=${encodeURIComponent(customerId)}&${"id" in selector ? `id=${encodeURIComponent(selector.id)}` : `key=${encodeURIComponent(selector.key)}`}`,
  ).pipe(
    Effect.flatMap((value) => decode(CashCountDetail, branchId, value)),
    Effect.filterOrFail(
      (value) =>
        ("id" in selector ? value.record.countId === selector.id : true) &&
        (!pending || confirmsCount(value, pending, role)),
      invalid,
    ),
  );
const confirmsCount = (
  value: CashCountDetail,
  pending: PendingCount,
  role?: Role,
) => {
  const event = value.confirmedEvent;
  if (
    !event ||
    event.key !== pending.key ||
    event.actor !== role ||
    event.note !== pending.command.note.trim()
  )
    return false;
  if (pending.kind === "declare")
    return (
      event.action === "declare" &&
      event.version === 1 &&
      sameCountSnapshot(event.snapshot, {
        ...pending.command,
        label: pending.command.label.trim(),
        source: "synthetic_declaration",
        currency: "INR",
        totalMinor: event.snapshot.totalMinor,
      })
    );
  return (
    event.countId === pending.command.id &&
    event.action === pending.command.action &&
    event.version === pending.command.version + 1 &&
    (pending.command.action !== "resubmit" ||
      sameCountSnapshot(event.snapshot, {
        ...event.snapshot,
        quantities: pending.command.quantities,
      }))
  );
};
export const saveCountApi = (
  customerId: string,
  branchId: string,
  pending: PendingCount,
  role: Role,
) =>
  api<unknown>(
    pending.kind === "declare"
      ? "/branch/cash-counts"
      : "/branch/cash-count-action",
    { customerId, key: pending.key, command: pending.command },
  ).pipe(
    Effect.flatMap((value) => decode(CashCountDetail, branchId, value)),
    Effect.filterOrFail(
      (value) => confirmsCount(value, pending, role),
      invalid,
    ),
  );
