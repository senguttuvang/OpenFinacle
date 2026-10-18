import { useId } from "react";

export function NumberField({
  label,
  ariaLabel,
  value,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  ariaLabel?: string;
  value: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <label className="est-number" htmlFor={id}>
      <span>{label}</span>
      <input
        aria-label={ariaLabel}
        id={id}
        type="number"
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const next = event.target.valueAsNumber;
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(0, next)));
        }}
      />
    </label>
  );
}
