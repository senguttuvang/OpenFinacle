import { Schema } from "effect";

export const inrMinor = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const minor = Math.round(value * 100);
  return Number.isSafeInteger(minor) && value === minor / 100 ? minor : null;
};
export const InrMoney = Schema.Number.pipe(
  Schema.filter((value) => inrMinor(value) !== null),
);
export const safeMinorTotal = (value: bigint): number | null =>
  value > BigInt(Number.MAX_SAFE_INTEGER) ||
  value < BigInt(Number.MIN_SAFE_INTEGER)
    ? null
    : Number(value);
