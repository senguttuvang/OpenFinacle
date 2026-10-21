"use client";

import {
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowUpRight,
  FileText,
  Search,
} from "lucide-react";
import { formatMoney } from "../../domain/banking";
import type { WorkspaceContext } from "../use-banking-workspace";
import { Pill } from "../workspace-presentation";
export function StatementsScreen({ context }: { context: WorkspaceContext }) {
  const { view, search, setSearch, account, transactions } = context;
  return (
    <>
      {view === "statements" && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Everyday Savings statement</h2>
              <p>
                {account
                  ? `Account ${account.accountNo} · Transactions from Apache Fineract`
                  : "Your statement will be available after opening an account."}
              </p>
            </div>
            {account && (
              <a className="secondary button" href="/api/statement">
                <ArrowDownToLine size={16} />
                Download CSV
              </a>
            )}
          </div>
          <div className="table-toolbar">
            <label className="search-box">
              <Search size={17} />
              <input
                aria-label="Search transactions"
                placeholder="Search transactions"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <span>{transactions.length} transactions</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Transaction</th>
                  <th>Date</th>
                  <th>Reference</th>
                  <th>Amount</th>
                  <th>Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions
                  .filter((t) =>
                    `${t.transactionType.value} ${t.id}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((t) => (
                    <tr key={t.id}>
                      <td>
                        <span className="table-transaction">
                          {t.transactionType.deposit ? (
                            <ArrowDownLeft size={16} />
                          ) : (
                            <ArrowUpRight size={16} />
                          )}
                          {t.transactionType.value}
                        </span>
                      </td>
                      <td>
                        {t.date[2]}/{t.date[1]}/{t.date[0]}
                      </td>
                      <td className="reference">#{t.id}</td>
                      <td
                        className={
                          t.transactionType.deposit ? "amount-credit" : ""
                        }
                      >
                        {t.transactionType.deposit ? "+" : "−"}
                        {formatMoney(t.amount)}
                      </td>
                      <td>{formatMoney(t.runningBalance ?? 0)}</td>
                      <td>
                        <Pill status={t.reversed ? "reversed" : "posted"} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!transactions.length && (
              <div className="empty-state">
                <FileText />
                <h3>A fresh page</h3>
                <p>Your first posted transaction will appear here.</p>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}
