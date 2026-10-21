"use client";

import {
  ArrowRight,
  CheckCircle2,
  Landmark,
  LockKeyhole,
  Plus,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";
import { FormSelect } from "../../../form-controls/form-select";
import { CustomerTransfer } from "../../../payments/ui/customer-transfer";
import { formatMoney } from "../../domain/banking";
import { api } from "../api";
import type { WorkspaceContext } from "../use-banking-workspace";
import { PendingButton, Pill } from "../workspace-presentation";
export function TransferScreen({ context }: { context: WorkspaceContext }) {
  const {
    data,
    view,
    setView,
    busy,
    amount,
    setAmount,
    note,
    setNote,
    beneficiaryName,
    setBeneficiaryName,
    otp,
    setOtp,
    load,
    perform,
    instruction,
    staff,
    account,
    balance,
    activeBeneficiary,
  } = context;
  return (
    <>
      {view === "transfer" && (
        <>
          {data.customer && !staff && (
            <CustomerTransfer
              key={data.bank.id}
              bankId={data.bank.id}
              onPayeesChanged={() =>
                perform(load(false), "Saved payees updated.", false)
              }
              onPosted={() =>
                perform(load(true), "Balances and statement refreshed.", false)
              }
            />
          )}
          {(!data.customer || staff) && (
            <details
              open={!data.customer || staff}
              className="customer-legacy-transfer"
            >
              <summary>Saved demo beneficiaries and payment controls</summary>
              <div className="form-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Make a payment</h2>
                      <p>To another customer in your demo bank.</p>
                    </div>
                    <span className="circle-icon">
                      <Send size={20} />
                    </span>
                  </div>
                  {!account ? (
                    <div className="empty-state">
                      <LockKeyhole />
                      <h3>Your account comes first</h3>
                      <p>Complete account opening before sending money.</p>
                      <button
                        className="primary"
                        type="button"
                        onClick={() => setView("application")}
                      >
                        Open your account
                      </button>
                    </div>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        instruction("transfer", Number(amount), note, {
                          beneficiaryId: activeBeneficiary?.id ?? "",
                        });
                      }}
                    >
                      <label>
                        From account
                        <input
                          className="sr-only"
                          aria-label="From account number"
                          value={account.accountNo}
                          readOnly
                          tabIndex={-1}
                        />
                        <div className="account-selector">
                          <Landmark size={20} />
                          <div>
                            <strong>
                              Everyday Savings · {account.accountNo}
                            </strong>
                            <small>{formatMoney(balance)} available</small>
                          </div>
                          <CheckCircle2 size={18} />
                        </div>
                      </label>
                      <label htmlFor="legacy-beneficiary">
                        To beneficiary
                        <FormSelect
                          id="legacy-beneficiary"
                          disabled={!activeBeneficiary}
                          aria-label="Select beneficiary"
                          value="confirmed-beneficiary"
                          onValueChange={() => undefined}
                          options={[
                            {
                              value: "confirmed-beneficiary",
                              label: activeBeneficiary
                                ? `${activeBeneficiary.name} · ${activeBeneficiary.account_no}`
                                : "Add and confirm a beneficiary first",
                            },
                          ]}
                        />
                      </label>
                      <div className="fields-grid">
                        <label>
                          Amount (INR)
                          <div className="money-input">
                            <span>₹</span>
                            <input
                              type="number"
                              min="0.01"
                              max="10000000"
                              step="0.01"
                              required
                              value={amount}
                              onChange={(e) => setAmount(e.target.value)}
                            />
                          </div>
                        </label>
                        <label>
                          Payment note
                          <input
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            maxLength={160}
                          />
                        </label>
                      </div>
                      <div className="notice neutral">
                        <ShieldCheck size={17} />
                        Transfers up to ₹25,000 post immediately. Larger
                        transfers go to the approver.
                      </div>
                      <PendingButton
                        busy={busy}
                        className="primary"
                        type="submit"
                        disabled={!activeBeneficiary}
                      >
                        Review & send money <ArrowRight size={16} />
                      </PendingButton>
                    </form>
                  )}
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Your beneficiaries</h2>
                      <p>Know where your money is going.</p>
                    </div>
                    <Users size={20} />
                  </div>
                  {data.beneficiaries.map((b) => (
                    <div key={b.id} className="beneficiary">
                      <span className="avatar peach">AR</span>
                      <div>
                        <strong>{b.name}</strong>
                        <small>{b.account_no}</small>
                        <Pill status={b.status} />
                      </div>
                      {b.status === "pending" && (
                        <div className="otp-form">
                          <label>
                            Demo code
                            <input
                              aria-label="Beneficiary verification code"
                              value={otp}
                              onChange={(e) => setOtp(e.target.value)}
                            />
                          </label>
                          <PendingButton
                            busy={busy}
                            className="primary"
                            onClick={() =>
                              perform(
                                api("/beneficiaries/confirm", {
                                  id: b.id,
                                  code: otp,
                                }),
                                "Beneficiary verified and active.",
                              )
                            }
                          >
                            Confirm
                          </PendingButton>
                        </div>
                      )}
                    </div>
                  ))}
                  {!data.beneficiaries.length && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        perform(
                          api("/beneficiaries", { name: beneficiaryName }),
                          "Beneficiary added. Confirm with the demo code.",
                        );
                      }}
                    >
                      <div className="recipient-preview">
                        <span className="avatar peach">AR</span>
                        <div>
                          <strong>Arjun Raman</strong>
                          <small>A customer in your demo bank</small>
                        </div>
                      </div>
                      <label>
                        Beneficiary nickname
                        <input
                          value={beneficiaryName}
                          onChange={(e) => setBeneficiaryName(e.target.value)}
                          required
                        />
                      </label>
                      <label>
                        Account number
                        <input value={data.recipient.accountNo} readOnly />
                      </label>
                      <PendingButton
                        busy={busy}
                        type="submit"
                        className="secondary"
                        disabled={!account}
                      >
                        <Plus size={16} />
                        Add beneficiary
                      </PendingButton>
                    </form>
                  )}
                  <div className="small-note">
                    <ShieldCheck size={16} />
                    Verification is simulated. Use <strong>246810</strong>; no
                    SMS is sent.
                  </div>
                </section>
              </div>
            </details>
          )}
        </>
      )}
    </>
  );
}
