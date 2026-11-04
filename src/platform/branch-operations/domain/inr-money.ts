import { Schema } from "effect";

export const nativeMinor = (
  value: unknown,
  decimalPlaces: number | undefined,
): number | null => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    decimalPlaces === undefined ||
    !Number.isInteger(decimalPlaces) ||
    decimalPlaces < 0 ||
    decimalPlaces > 20
  )
    return null;
  const scale = 10 ** decimalPlaces;
  const minor = Math.round(value * scale);
  return Number.isSafeInteger(minor) && value === minor / scale ? minor : null;
};
export const inrMinor = (value: unknown): number | null =>
  nativeMinor(value, 2);
export const InrMoney = Schema.Number.pipe(
  Schema.filter((value) => inrMinor(value) !== null),
);
export const safeMinorTotal = (value: bigint): number | null =>
  value > BigInt(Number.MAX_SAFE_INTEGER) ||
  value < BigInt(Number.MIN_SAFE_INTEGER)
    ? null
    : Number(value);
