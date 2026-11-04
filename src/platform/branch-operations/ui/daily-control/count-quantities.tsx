"use client";
import { formatMoney } from "../../../banking-workspace/domain/banking";
import {
  type CashQuantities,
  cashDenominations,
  declaredCashTotal,
} from "../../domain/cash-counts";

export const quantityValues = (
  values: readonly string[],
): CashQuantities | null => {
  if (
    values.length !== cashDenominations.length ||
    values.some((v) => !/^\d{1,7}$/.test(v))
  )
    return null;
  const rows = cashDenominations.map((denominationMinor, i) => ({
    denominationMinor,
    quantity: Number(values[i]),
  }));
  return declaredCashTotal(rows) === null ? null : rows;
};
export function CountQuantities({
  values,
  change,
  disabled,
}: {
  values: readonly string[];
  change: (values: string[]) => void;
  disabled: boolean;
}) {
  const rows = quantityValues(values),
    total = rows ? declaredCashTotal(rows) : null;
  return (
    <fieldset disabled={disabled}>
      <legend>
        Supported demo denomination slots · every quantity required
      </legend>
      <p>
        Blank means unknown. Enter zero explicitly or mark remaining blanks as
        zero. This is a declaration, not physical verification.
      </p>
      <div className="cash-count-grid">
        {cashDenominations.map((d, i) => (
          <label key={d}>
            Quantity of {formatMoney(d / 100)}
            <input
              type="number"
              min="0"
              max="1000000"
              step="1"
              inputMode="numeric"
              required
              value={values[i] ?? ""}
              onChange={(e) =>
                change(values.map((v, j) => (j === i ? e.target.value : v)))
              }
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={() => change(values.map((v) => (v === "" ? "0" : v)))}
      >
        Mark remaining blanks as zero
      </button>
      <p>
        Declared total preview, not saved:{" "}
        <strong>
          {total === null ? "Incomplete" : formatMoney(total / 100)}
        </strong>
      </p>
    </fieldset>
  );
}
