import {
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  Landmark,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useState } from "react";
import { formatMoney } from "../src/domain/banking";
import type { Dashboard } from "../src/domain/view";

type Destination =
  | "accounts"
  | "transfer"
  | "statements"
  | "services"
  | "cash"
  | "profile";
interface Props {
  data: Dashboard;
  navigate: (view: Destination) => void;
}

export function RetailOverview({ data, navigate }: Props) {
  const [visible, setVisible] = useState(true);
  const account = data.account;
  if (!account) return null;
  const transactions = [...(account.transactions ?? [])].sort(
    (a, b) => b.id - a.id,
  );
  const balance = account.summary?.accountBalance ?? 0;
  const pending = data.commands.filter((command) =>
    ["pending", "executing", "uncertain"].includes(command.status),
  );
  return (
    <div className="retail-dashboard">
      <div className="retail-primary-column">
        <section className="retail-portfolio" aria-label="Savings portfolio">
          <div className="retail-panel-title">
            <h2>My savings portfolio</h2>
            <button
              type="button"
              className="text-link"
              aria-label={visible ? "Hide balances" : "Show balances"}
              onClick={() => setVisible(!visible)}
            >
              {visible ? <Eye size={16} /> : <EyeOff size={16} />}{" "}
              {visible ? "Hide balance" : "Show balance"}
            </button>
          </div>
          <div className="retail-portfolio-body">
            <div
              className="portfolio-ring"
              role="img"
              aria-label="Savings account"
            >
              <Landmark size={26} />
              <span>Savings</span>
            </div>
            <div className="retail-total">
              <span>Total account balance</span>
              <strong data-testid="balance">
                {visible ? formatMoney(balance) : "₹ ••••••"}
              </strong>
              <small>Everyday Savings · Indian Rupee</small>
            </div>
            <span className="retail-account-active">
              <CheckCircle2 size={15} /> {account.status.value}
            </span>
          </div>
          <div className="retail-account-line">
            <div>
              <strong>Savings account</strong>
              <span>A/C {account.accountNo} · Adyar branch</span>
            </div>
            <div>
              <small>Available balance</small>
              <strong>
                {visible
                  ? formatMoney(account.summary?.availableBalance ?? balance)
                  : "₹ ••••••"}
              </strong>
            </div>
            <button
              type="button"
              className="text-link"
              onClick={() => navigate("accounts")}
            >
              Account details <ArrowRight size={15} />
            </button>
          </div>
          <div className="retail-action-strip">
            <button type="button" onClick={() => navigate("statements")}>
              <FileText size={20} />
              View statements
            </button>
            <button type="button" onClick={() => navigate("transfer")}>
              <ArrowLeftRight size={20} />
              Send money
            </button>
            <button type="button" onClick={() => navigate("transfer")}>
              <Users size={20} />
              Manage payees
            </button>
            <button type="button" onClick={() => navigate("services")}>
              <CreditCard size={20} />
              Service requests
            </button>
          </div>
        </section>
        <section className="panel retail-transactions">
          <div className="panel-heading">
            <div>
              <h2>Recent transactions</h2>
              <p>Your latest posted account activity</p>
            </div>
            <button
              type="button"
              className="text-link"
              onClick={() => navigate("statements")}
            >
              View all <ArrowRight size={14} />
            </button>
          </div>
          <div className="activity-list">
            {transactions.slice(0, 5).map((transaction) => (
              <div className="activity" key={transaction.id}>
                <span
                  className={`activity-icon ${transaction.transactionType.deposit ? "incoming" : ""}`}
                >
                  {transaction.transactionType.deposit ? (
                    <ArrowDownLeft size={18} />
                  ) : (
                    <ArrowUpRight size={18} />
                  )}
                </span>
                <div>
                  <strong>{transaction.transactionType.value}</strong>
                  <small>
                    {transaction.date[2]}/{transaction.date[1]}/
                    {transaction.date[0]} · Reference #{transaction.id}
                    {transaction.reversed ? " · Reversed" : ""}
                  </small>
                </div>
                <div className="activity-value">
                  <strong
                    className={
                      transaction.transactionType.deposit ? "amount-credit" : ""
                    }
                  >
                    {visible
                      ? `${transaction.transactionType.deposit ? "+" : "−"}${formatMoney(transaction.amount)}`
                      : "••••••"}
                  </strong>
                  <small>{transaction.reversed ? "Reversed" : "Posted"}</small>
                </div>
              </div>
            ))}
          </div>
          <div className="retail-seed-note">
            Sample opening funds, salary, payment and cash activity are posted
            today. All money is synthetic.
          </div>
        </section>
        <section className="retail-support-banner">
          <div className="support-symbol">
            <ShieldCheck size={28} />
          </div>
          <div>
            <span>YOUR BANK, WITH YOU</span>
            <h2>A little help goes a long way.</h2>
            <p>Request a chequebook, a debit card or an address update.</p>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => navigate("services")}
          >
            Explore services <ArrowRight size={16} />
          </button>
        </section>
      </div>
      <aside className="retail-secondary-column">
        <section className="panel retail-notifications">
          <span className="retail-kicker">AT A GLANCE</span>
          <h2>Your banking updates</h2>
          <div className="retail-update">
            <CheckCircle2 size={19} />
            <div>
              <strong>You're all set</strong>
              <p>Your savings account is active and ready to use.</p>
            </div>
          </div>
          <div className="retail-update">
            <ArrowLeftRight size={19} />
            <div>
              <strong>
                {pending.length
                  ? `${pending.length} instruction${pending.length === 1 ? "" : "s"} need attention`
                  : "No instructions waiting"}
              </strong>
              <p>
                {pending.length
                  ? "Check with the branch approver before retrying a payment."
                  : "No instructions are waiting for action. Account values reflect the last synchronization."}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="text-link"
            onClick={() => navigate("profile")}
          >
            View my profile <ArrowRight size={14} />
          </button>
        </section>
        <section className="panel retail-payee-card">
          <h2>Your saved payee</h2>
          <span className="avatar peach">AR</span>
          <strong>{data.beneficiaries[0]?.name ?? "Arjun Raman"}</strong>
          <p>Within OpenFinacle</p>
          <button
            type="button"
            className="primary"
            onClick={() => navigate("transfer")}
          >
            Transfer funds <ArrowRight size={15} />
          </button>
        </section>
        <section className="retail-help-card">
          <h3>Need something from your branch?</h3>
          <p>Your requests stay connected to your account.</p>
          <button
            type="button"
            className="text-link"
            onClick={() => navigate("services")}
          >
            Track service requests <ArrowRight size={14} />
          </button>
        </section>
      </aside>
    </div>
  );
}

export function RetailAccount({ data, navigate }: Props) {
  const account = data.account;
  if (!account) return null;
  return (
    <section className="account-workspace" aria-label="Savings account details">
      <div className="account-summary">
        <div className="account-balance">
          <div className="account-balance-title">
            <Landmark size={24} />
            <h2>Everyday Savings</h2>
          </div>
          <p>Available to use</p>
          <strong data-testid="account-available-balance">
            {formatMoney(
              account.summary?.availableBalance ??
                account.summary?.accountBalance ??
                0,
            )}
          </strong>
          <span className="account-balance-note">
            Indian Rupee · {account.currency?.code ?? "INR"}
          </span>
          <button
            type="button"
            className="account-statement"
            onClick={() => navigate("statements")}
          >
            <FileText size={20} /> View account statement{" "}
            <ArrowRight size={19} />
          </button>
        </div>
        <div className="account-identity">
          <span className="account-person-icon">
            <Users size={28} />
          </span>
          <div>
            <p>Account holder</p>
            <h2>{account.clientName}</h2>
            <span>A/C {account.accountNo}</span>
          </div>
          <span className="retail-account-active">
            <CheckCircle2 size={18} />
            {account.status.value}
          </span>
          <p className="account-identity-note">
            Everyday banking, connected to your branch.
          </p>
        </div>
      </div>
      <div className="panel account-information">
        <div className="panel-heading">
          <div>
            <h3>Account information</h3>
            <p>The details behind your everyday banking</p>
          </div>
          <Landmark size={24} aria-hidden="true" />
        </div>
        <dl className="account-facts">
          {Object.entries({
            "Account holder": account.clientName,
            "Account number": account.accountNo,
            "Account type": "Everyday Savings",
            Currency: account.currency?.code ?? "INR",
            Branch: "Adyar · Chennai (demo)",
            "Account balance": formatMoney(
              account.summary?.accountBalance ?? 0,
            ),
            "Available balance": formatMoney(
              account.summary?.availableBalance ??
                account.summary?.accountBalance ??
                0,
            ),
            "Debit status": account.subStatus?.value ?? "No restrictions",
          }).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <div className="button-row">
          <button
            type="button"
            className="primary"
            onClick={() =>
              navigate(data.role === "customer" ? "transfer" : "cash")
            }
          >
            {data.role === "customer" ? "Transfer money" : "Go to cash desk"}{" "}
            <ArrowRight size={15} />
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => navigate("statements")}
          >
            <ArrowDownToLine size={16} />
            View account statement
          </button>
        </div>
      </div>
    </section>
  );
}
