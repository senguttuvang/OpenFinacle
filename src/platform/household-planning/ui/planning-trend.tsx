import { useId } from "react";
import { planningMoney as money } from "../domain/planning";

const amount = (minor: number) => {
  const magnitude = Math.abs(minor);
  const scale =
    magnitude >= 1000000000 ? 1000000000 : magnitude >= 10000000 ? 10000000 : 0;
  return scale
    ? `${minor < 0 ? "−" : ""}₹${(magnitude / scale).toFixed(1)} ${scale === 1000000000 ? "Cr" : "L"}`
    : money(Math.round(minor));
};
export function Trend({
  labels,
  series,
  caption,
}: {
  labels: string[];
  series: { id: string; name: string; values: number[]; color: string }[];
  caption: string;
}) {
  const id = useId();
  const values = series.flatMap((s) => s.values);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const y = (value: number) => 168 - ((value - min) / (max - min)) * 140;
  return (
    <figure className="wp-chart">
      <svg viewBox="0 0 700 215" role="img" aria-labelledby={id}>
        <title id={id}>{caption}. Exact values in the table below.</title>
        {[0, 0.5, 1].map((fraction) => (
          <g key={fraction}>
            <line
              x1="140"
              x2="660"
              y1={y(min + (max - min) * fraction)}
              y2={y(min + (max - min) * fraction)}
              stroke="#dae2ef"
            />
            <text
              x="132"
              y={y(min + (max - min) * fraction) + 5}
              textAnchor="end"
            >
              {amount(min + (max - min) * fraction)}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <polyline
            key={s.id}
            points={s.values
              .map(
                (value, i) =>
                  `${140 + (i / Math.max(1, labels.length - 1)) * 510},${y(value)}`,
              )
              .join(" ")}
            fill="none"
            stroke={s.color}
            strokeWidth="3"
          />
        ))}
        {labels
          .filter(
            (_, i) =>
              i === 0 ||
              i === labels.length - 1 ||
              i === Math.floor(labels.length / 2),
          )
          .map((label) => (
            <text
              key={label}
              x={
                140 +
                (labels.indexOf(label) / Math.max(1, labels.length - 1)) * 510
              }
              y="201"
              textAnchor="middle"
            >
              {label}
            </text>
          ))}
      </svg>
      <figcaption>
        {caption}
        <small>
          Axis labels are rounded; L = lakh, Cr = crore. Exact values are
          available in the data table.
        </small>
        <span className="wp-legend">
          {series.map((s) => (
            <span key={s.id}>
              <i style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </span>
      </figcaption>
    </figure>
  );
}
