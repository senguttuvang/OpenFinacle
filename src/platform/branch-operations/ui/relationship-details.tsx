"use client";
import { formatMoney } from "../../banking-workspace/domain/banking";
import { coreDate } from "../domain/branch-day";
import type { RelationshipState } from "./use-relationship-enquiry";
export const coreAmount = (
  value: number | undefined,
  currency: { code: string } | undefined,
) =>
  value === undefined || !currency
    ? "Not returned by core"
    : currency.code === "INR"
      ? formatMoney(value)
      : `${value.toLocaleString("en-IN", { maximumFractionDigits: 20 })} ${currency.code}`;
export function RelationshipDetails({
  state,
  reviewFixture = false,
}: {
  state: RelationshipState;
  reviewFixture?: boolean;
}) {
  if (reviewFixture)
    return (
      <section className="branch-day-item">
        <h4>Customer 360 evidence</h4>
        <p>
          STATIC REVIEW FIXTURE. Native client, portfolio, document and profile
          evidence is not connected here.
        </p>
      </section>
    );
  const { value, loading, error, reload } = state;
  return (
    <section className="branch-day-item">
      <h4>Customer 360 evidence</h4>
      <button type="button" disabled={loading} onClick={reload}>
        Refresh customer 360
      </button>
      {loading && (
        <p role="status">Reading core client and portfolio evidence…</p>
      )}
      {error && <p role="alert">{error}</p>}
      {value && (
        <>
          <p>
            Core and application sources collected{" "}
            {new Date(value.observedAt).toLocaleString("en-IN")}. These reads
            are not atomic.
          </p>
          {value.errors.map((e) => (
            <p role="alert" key={e.source}>
              {e.source}: {e.message}
            </p>
          ))}
          <h4>Core identity and relationship</h4>
          {value.client ? (
            <>
              <dl>
                <dt>Core client / reference</dt>
                <dd>
                  {value.client.displayName} · {value.client.accountNo}
                </dd>
                <dt>Core legal form</dt>
                <dd>{value.client.legalForm?.value ?? "Not returned"}</dd>
                <dt>Core status</dt>
                <dd>{value.client.status.value}</dd>
                <dt>Client office</dt>
                <dd>{value.client.officeName ?? value.client.officeId}</dd>
                <dt>Core activation date</dt>
                <dd>
                  {value.client.activationDate
                    ? coreDate([...value.client.activationDate])
                    : "Not returned"}
                </dd>
              </dl>
              <p>
                Core record status and legal form do not establish real identity
                verification, KYC or a business mandate. Those checks remain
                unimplemented.
              </p>
            </>
          ) : (
            <p>Native client evidence unavailable.</p>
          )}
          <h4>Core account portfolio</h4>
          <p>
            Account families returned by this client endpoint. Servicing
            controls below target the registered savings account.
          </p>
          {value.portfolio ? (
            <div className="table-scroll">
              <table className="branch-table">
                <thead>
                  <tr>
                    <th>Family / account</th>
                    <th>Product / status</th>
                    <th>Core ledger / loan balance</th>
                    <th>Core available</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["Savings", value.portfolio.savingsAccounts],
                      ["Loan", value.portfolio.loanAccounts],
                      [
                        "Working capital",
                        value.portfolio.workingCapitalLoanAccounts,
                      ],
                    ] as const
                  ).flatMap(([family, rows]) =>
                    (rows ?? []).map((row) => (
                      <tr key={`${family}-${row.id}`}>
                        <td>
                          {family} · {row.accountNo}
                          {row.id === value.selectedSavings?.id && (
                            <small>Registered servicing account</small>
                          )}
                        </td>
                        <td>
                          {row.productName ?? row.productId ?? "Not returned"}
                          <small>{row.status.value}</small>
                        </td>
                        <td>
                          {coreAmount(
                            row.accountBalance ?? row.loanBalance,
                            row.currency,
                          )}
                        </td>
                        <td>
                          {coreAmount(row.availableBalance, row.currency)}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <p>Native account portfolio unavailable.</p>
          )}
          <h4>Core account charges</h4>
          {value.charges === null ? (
            <p>Charge enquiry unavailable.</p>
          ) : value.charges.length ? (
            <div className="table-scroll">
              <table className="branch-table">
                <thead>
                  <tr>
                    <th>Charge</th>
                    <th>Amount</th>
                    <th>Outstanding</th>
                    <th>Core state</th>
                  </tr>
                </thead>
                <tbody>
                  {value.charges.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{coreAmount(c.amount, c.currency)}</td>
                      <td>{coreAmount(c.amountOutstanding, c.currency)}</td>
                      <td>
                        {c.waived
                          ? "Waived"
                          : c.paid === true
                            ? "Paid"
                            : c.paid === false
                              ? "Unpaid"
                              : "Not returned"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>
              No charge rows returned. This does not certify the full product
              tariff.
            </p>
          )}
          <h4>Document metadata</h4>
          <p>
            Metadata only. Content, identity authenticity and KYC verification
            are not established.
          </p>
          <p>
            Core document store:{" "}
            {value.coreDocuments === null
              ? "unavailable"
              : `${value.coreDocuments.length} metadata records returned`}
          </p>
          {value.coreDocuments?.map((d) => (
            <p key={`core-${d.id}`}>
              {d.name} · {d.fileName ?? "Filename not returned"} ·{" "}
              {d.size === undefined ? "Size not returned" : `${d.size} bytes`}
            </p>
          ))}
          <p>
            Application document store: {value.applicationDocuments.length}{" "}
            metadata records.
          </p>
          {value.applicationDocuments.map((d) => (
            <p key={d.id}>
              {d.kind} · {d.name} · {d.size} bytes · {d.created_at} UTC
            </p>
          ))}
          <h4>Saved application profile</h4>
          {value.profile ? (
            <>
              <p>
                Version {value.profile.profile.version} · recorded{" "}
                {value.profile.profile.updated_at}. Application-maintained
                synthetic data.
              </p>
              <dl>
                {Object.entries(value.profile.profile.fields).map(
                  ([key, text]) => (
                    <div key={key}>
                      <dt>{key.replaceAll("_", " ")}</dt>
                      <dd>{text || "Not recorded"}</dd>
                    </div>
                  ),
                )}
              </dl>
              <details>
                <summary>
                  Latest 10 of {value.profile.history.length} saved profile
                  snapshots
                </summary>
                {[...value.profile.history]
                  .slice(-10)
                  .reverse()
                  .map((event) => (
                    <p key={event.id}>
                      v{event.version} · {event.actor} · {event.created_at} ·{" "}
                      {event.note}
                      {event.case_id ? ` · case ${event.case_id}` : ""}
                    </p>
                  ))}
              </details>
            </>
          ) : (
            <p>Saved application profile unavailable.</p>
          )}
          <h4>Nominee declaration and mandates</h4>
          {value.nominee ? (
            <p>
              Staged demo declaration v{value.nominee.version}:{" "}
              {value.nominee.choice === "add"
                ? `${value.nominee.name} · ${value.nominee.relationship}`
                : value.nominee.choice === "decline"
                  ? "Declined in application"
                  : "No choice recorded"}
              .
            </p>
          ) : (
            <p>No staged nominee declaration returned.</p>
          )}
          <p>
            Core nominee registration, signatory authority and business mandate
            verification remain unimplemented. A staged declaration is not a
            registered mandate.
          </p>
        </>
      )}
    </section>
  );
}
