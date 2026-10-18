"use client";

import {
  ArrowDownToLine,
  ArrowRight,
  CheckCheck,
  CheckCircle2,
  FileCheck2,
  FileText,
  Fingerprint,
  Sparkles,
} from "lucide-react";
import { api } from "../api";
import type { WorkspaceContext } from "../use-banking-workspace";
import { PendingButton, Pill } from "../workspace-presentation";
export function ApplicationScreen({ context }: { context: WorkspaceContext }) {
  const {
    data,
    view,
    busy,
    form,
    setForm,
    reviewNote,
    setReviewNote,
    perform,
    changeRole,
    attach,
    sampleDocs,
    role,
    staff,
  } = context;
  return (
    <>
      {view === "application" && (!data.bank.applicant || staff) && (
        <div className="form-grid">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>{staff ? "Customer application" : "Your first account"}</h2>
                <p>
                  {staff
                    ? "Review submitted details and supporting documents."
                    : "Everyday Savings · 3.5% p.a. configured interest · INR"}
                </p>
              </div>
              {data.application && <Pill status={data.application.status} />}
            </div>
            {staff ? (
              data.application ? (
                <>
                  <div className="detail-grid">
                    {Object.entries({
                      Customer: data.application.name,
                      Email: data.application.email,
                      Phone: data.application.phone,
                      Address: data.application.address,
                      Employment: data.application.employment,
                    }).map(([key, value]) => (
                      <div key={key}>
                        <small>{key}</small>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="document-list">
                    {data.documents.map((doc) => (
                      <a
                        key={doc.id}
                        href={`/api/documents/${doc.id}`}
                        className="document"
                      >
                        <FileCheck2 size={20} />
                        <div>
                          <strong>{doc.name}</strong>
                          <small>{doc.kind} · synthetic document</small>
                        </div>
                        <ArrowDownToLine size={17} />
                      </a>
                    ))}
                  </div>
                  {data.application.review_note && (
                    <div className="notice neutral">
                      {data.application.review_note}
                    </div>
                  )}
                  {role === "officer" &&
                    data.application.status === "submitted" && (
                      <div className="form-actions-column">
                        <label>
                          Review notes
                          <textarea
                            value={reviewNote}
                            onChange={(e) => setReviewNote(e.target.value)}
                          />
                        </label>
                        <div className="button-row">
                          <PendingButton
                            busy={busy}
                            className="primary"
                            onClick={() =>
                              perform(
                                api("/application/review", {
                                  decision: "recommend",
                                  note: reviewNote,
                                }),
                                "Application sent to the separate approver.",
                              )
                            }
                          >
                            Recommend opening <ArrowRight size={16} />
                          </PendingButton>
                          <PendingButton
                            busy={busy}
                            className="secondary"
                            onClick={() =>
                              perform(
                                api("/application/review", {
                                  decision: "needs_changes",
                                  note: reviewNote,
                                }),
                                "Customer notified of requested information.",
                              )
                            }
                          >
                            Request information
                          </PendingButton>
                        </div>
                      </div>
                    )}
                  {role === "approver" &&
                    data.application.status === "awaiting_approval" && (
                      <PendingButton
                        busy={busy}
                        className="primary"
                        onClick={() =>
                          perform(
                            api("/application/review", {
                              decision: "approve",
                              note: "Approved after independent review",
                            }),
                            "Account opened and activated in the banking core.",
                          )
                        }
                      >
                        Approve & open account <CheckCheck size={16} />
                      </PendingButton>
                    )}
                  {data.application.status === "awaiting_approval" &&
                    role === "officer" && (
                      <button
                        type="button"
                        className="primary"
                        onClick={() => changeRole("approver", "application")}
                      >
                        Continue as the approver <ArrowRight size={16} />
                      </button>
                    )}
                </>
              ) : (
                <div className="empty-state">
                  <FileText />
                  <h3>No application yet</h3>
                  <p>Switch to the customer to start the journey.</p>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => changeRole("customer", "application")}
                  >
                    Start as customer
                  </button>
                </div>
              )
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  perform(
                    api("/application", form),
                    "Application submitted. The bank officer can now review it.",
                  );
                }}
              >
                <div className="fields-grid">
                  {(["name", "email", "phone", "employment"] as const).map(
                    (key) => (
                      <label key={key}>
                        {
                          {
                            name: "Full name",
                            email: "Email address",
                            phone: "Mobile number",
                            employment: "Employment",
                          }[key]
                        }
                        <input
                          required
                          value={form[key]}
                          onChange={(e) =>
                            setForm({ ...form, [key]: e.target.value })
                          }
                          disabled={data.application?.status === "approved"}
                          type={key === "email" ? "email" : "text"}
                        />
                      </label>
                    ),
                  )}
                </div>
                <label>
                  Residential address
                  <textarea
                    required
                    value={form.address}
                    onChange={(e) =>
                      setForm({ ...form, address: e.target.value })
                    }
                    disabled={data.application?.status === "approved"}
                  />
                </label>
                <h3 className="subheading">Supporting documents</h3>
                <p className="muted">
                  Use the sample documents, or attach synthetic files. Please
                  don't upload real identity documents.
                </p>
                <div className="upload-grid">
                  {(["identity", "address"] as const).map((kind) => (
                    <label className="upload-box" key={kind}>
                      <FileCheck2 size={23} />
                      <strong>
                        {kind === "identity"
                          ? "Identity document"
                          : "Address proof"}
                      </strong>
                      <span>
                        {data.documents.some((d) => d.kind === kind)
                          ? "Document attached ✓"
                          : "PDF, JPG, PNG or TXT · Up to 1 MB"}
                      </span>
                      <input
                        aria-label={`Upload ${kind} document`}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.txt"
                        disabled={busy}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file)
                            perform(attach(kind, file), "Document attached.");
                        }}
                      />
                    </label>
                  ))}
                </div>
                <div className="button-row">
                  <PendingButton
                    busy={busy}
                    type="button"
                    className="secondary"
                    onClick={sampleDocs}
                    disabled={data.documents.length >= 2}
                  >
                    Use sample documents <Sparkles size={15} />
                  </PendingButton>
                  <PendingButton
                    busy={busy}
                    className="primary"
                    type="submit"
                    disabled={
                      !!(
                        data.application &&
                        !["needs_changes"].includes(data.application.status)
                      )
                    }
                  >
                    Submit application <ArrowRight size={16} />
                  </PendingButton>
                </div>
                {data.application?.review_note && (
                  <div className="notice neutral">
                    {data.application.review_note}
                  </div>
                )}
                {data.application?.status === "submitted" && (
                  <button
                    className="text-link spaced"
                    type="button"
                    onClick={() => changeRole("officer", "application")}
                  >
                    Next: review as bank officer <ArrowRight size={16} />
                  </button>
                )}
                {data.application?.status === "approved" && (
                  <div className="notice positive">
                    <CheckCircle2 size={18} />
                    Your account is open. You're ready for your first deposit.
                  </div>
                )}
              </form>
            )}
          </section>
          <aside className="info-panel">
            <Fingerprint size={35} />
            <h2>
              A thoughtful
              <br />
              first step.
            </h2>
            <p>
              Opening an account connects your identity, documents, product and
              branch.
            </p>
            <div className="info-line">
              <CheckCircle2 size={17} />
              Document review by the officer
            </div>
            <div className="info-line">
              <CheckCircle2 size={17} />
              Independent approval
            </div>
            <div className="info-line">
              <CheckCircle2 size={17} />A real account in the banking core
            </div>
            <div className="small-note">
              Identity verification is simulated. Account creation and
              activation execute in Apache Fineract.
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
