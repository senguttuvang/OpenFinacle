import { useId } from "react";
import { planningMoney as money } from "../../src/domain/planning";

const amount = (minor: number) => money(Math.round(minor));
export function Trend({
  labels,
  series,
  caption,
}: {
  labels: string[];
  series: { name: string; values: number[]; color: string }[];
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
              x1="90"
              x2="680"
              y1={y(min + (max - min) * fraction)}
              y2={y(min + (max - min) * fraction)}
              stroke="#dae2ef"
            />
            <text
              x="82"
              y={y(min + (max - min) * fraction) + 5}
              textAnchor="end"
            >
              {amount(min + (max - min) * fraction)}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <polyline
            key={s.name}
            points={s.values
              .map(
                (value, i) =>
                  `${90 + (i / Math.max(1, labels.length - 1)) * 580},${y(value)}`,
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
                90 +
                (labels.indexOf(label) / Math.max(1, labels.length - 1)) * 580
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
        <span className="wp-legend">
          {series.map((s) => (
            <span key={s.name}>
              <i style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </span>
      </figcaption>
    </figure>
  );
}
