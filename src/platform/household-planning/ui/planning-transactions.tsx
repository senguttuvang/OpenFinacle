import { useState } from "react";
import {
  planningMoney as money,
  type PlanningPosting,
} from "../domain/planning";
export function Transactions({ rows }: { rows: readonly PlanningPosting[] }) {
  const [limit, setLimit] = useState(30);
  const shown = [...rows].reverse().slice(0, limit);
  return (
    <>
      <div className="wp-table">
        <table>
          <caption>
            {rows.length} recorded postings · exact filter context · paise
            retained in calculations
          </caption>
          <thead>
            <tr>
              <th>Date / reference</th>
              <th>Merchant / member</th>
              <th>Category / treatment</th>
              <th>Signed amount</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.date}
                  <small>
                    {p.id}
                    <br />
                    {p.link && `Linked: ${p.link}`}
                  </small>
                </td>
                <td>
                  {p.merchant}
                  <small>
                    {p.member} · {p.account}
                  </small>
                </td>
                <td>
                  {p.category}
                  <small>{p.kind}</small>
                </td>
                <td className={p.minor > 0 ? "wp-positive" : ""}>
                  {money(p.minor)}
                  <small>{p.minor} paise</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <p className="wp-empty">
          No postings match these filters. Widen the dates or clear category,
          account and merchant filters.
        </p>
      )}
      {rows.length > limit && (
        <button
          type="button"
          className="secondary"
          onClick={() => setLimit(limit + 50)}
        >
          Show 50 more postings
        </button>
      )}
    </>
  );
}
