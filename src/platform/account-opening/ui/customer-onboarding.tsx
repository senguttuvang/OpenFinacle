"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileCheck2,
  ShieldCheck,
} from "lucide-react";
import { FormSelect } from "../../form-controls/form-select";
import { onboardingSteps, validateOnboarding } from "../domain/onboarding";
import {
  attachSampleIdentityPack,
  confirmOnboarding,
  continueOnboarding,
  inspectOpening,
  saveOnboarding,
} from "./onboarding-api";
import "./onboarding.css";
import { statusText, useAccountOpening } from "./use-account-opening";
export function CustomerOnboarding({ onOpened }: { onOpened?: () => void }) {
  const {
    draft,
    fields,
    step,
    busy,
    loading,
    error,
    setError,
    message,
    errors,
    setErrors,
    confirming,
    setConfirming,
    uncertain,
    canStartAnother,
    heading,
    confirmationHeading,
    apply,
    execute,
    update,
    move,
    start,
    refresh,
    field,
    checkbox,
  } = useAccountOpening({ onOpened });
  return (
    <section
      className="customer-onboarding"
      aria-label="Savings account application"
    >
      <header className="onboarding-header">
        <h1>Open a savings account</h1>
        <p>A guided application, from your details to your opening receipt.</p>
        <p className="onboarding-demo">
          <ShieldCheck size={20} aria-hidden="true" /> Synthetic banking demo ·
          Use fictional details only. Contact and identity checks are simulated.
        </p>
      </header>
      {loading ? (
        <p role="status">Loading your saved application…</p>
      ) : !draft || !fields ? (
        <div className="onboarding-start">
          <h2>Your own account, step by step</h2>
          <p>
            Choose Everyday Savings, complete seven short stages and send your
            application for branch review. Your progress is saved when you
            continue or select Save draft.
          </p>
          <p>
            Identity review and a separate approver are required before your
            synthetic account opens. No real money or identity documents are
            used.
          </p>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => start(false)}
          >
            {busy
              ? "Starting application…"
              : uncertain
                ? "Resume original application"
                : "Start my application"}
            <ArrowRight size={20} />
          </button>
          {canStartAnother && (
            <div className="onboarding-recovery">
              <p>
                Your earlier application belongs to a different demo session and
                remains saved. You can return to that session or start a
                separate fictional applicant.
              </p>
              <button type="button" disabled={busy} onClick={() => start(true)}>
                Start a separate sample application
              </button>
            </div>
          )}
        </div>
      ) : draft.status !== "draft" ? (
        <div className="onboarding-receipt">
          <FileCheck2 size={32} aria-hidden="true" />
          <h2>
            {draft.account
              ? "Your savings account is open"
              : (statusText[draft.applicationStatus ?? ""] ??
                "Submission needs inspection")}
          </h2>
          <p>
            {draft.account
              ? "Your synthetic savings account is active. Continue to your account to start banking."
              : draft.applicationStatus
                ? "Your application is saved. A bank officer reviews the sample identity pack, then a separate approver authorises opening. Check status here to see the outcome."
                : "The original submission outcome is not confirmed. The branch must inspect this application before any further instruction."}
          </p>
          <dl>
            <dt>Application reference</dt>
            <dd>{draft.id}</dd>
            <dt>Applicant</dt>
            <dd>{fields.name}</dd>
            <dt>Product</dt>
            <dd>Everyday Savings · INR</dd>
            <dt>Status</dt>
            <dd>{statusText[draft.applicationStatus ?? ""] ?? draft.status}</dd>
            {draft.account && (
              <>
                <dt>Account number</dt>
                <dd>{draft.account.accountNo}</dd>
              </>
            )}
          </dl>
          <div className="onboarding-actions">
            {draft.canInspectOpening && (
              <button
                type="button"
                disabled={busy}
                onClick={() => execute(inspectOpening(), apply, true)}
              >
                Inspect original Core opening
              </button>
            )}
            <button type="button" disabled={busy} onClick={refresh}>
              Check opening status
            </button>
            {draft.account && (
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() =>
                  execute(
                    continueOnboarding(),
                    (saved) => {
                      apply(saved);
                      if (saved.account) {
                        if (onOpened) onOpened();
                        else window.location.assign("/");
                      }
                    },
                    true,
                  )
                }
              >
                Continue to my account
                <ArrowRight size={20} />
              </button>
            )}
            <a href="/">Return to banking portal</a>
            {draft.account && (
              <button
                type="button"
                disabled={busy || uncertain}
                onClick={() => start(true)}
              >
                Start another sample application
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <nav aria-label="Application progress">
            <ol className="onboarding-stepper">
              {onboardingSteps.map((label, index) => (
                <li
                  key={label}
                  aria-label={label}
                  aria-current={index === step ? "step" : undefined}
                >
                  <span>
                    {index < step ? (
                      <Check size={18} aria-label="Completed" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  {label}
                </li>
              ))}
            </ol>
          </nav>
          <p className="onboarding-progress">
            Step {step + 1} of {onboardingSteps.length} ·{" "}
            {onboardingSteps[step]}
          </p>
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (step < 6) move(step + 1, true);
              else {
                const found = validateOnboarding(fields);
                setErrors(found);
                if (Object.keys(found).length) {
                  setError(Object.values(found).join(" "));
                  return;
                }
                execute(
                  saveOnboarding(draft, fields, 6),
                  (saved) => {
                    apply(saved);
                    setConfirming(true);
                  },
                  true,
                );
              }
            }}
          >
            <fieldset disabled={busy || uncertain}>
              <legend>
                <h2 ref={heading} tabIndex={-1}>
                  {onboardingSteps[step]}
                </h2>
              </legend>
              {step === 0 && (
                <>
                  <h3>Everyday Savings</h3>
                  <p>
                    One individual account in Indian rupees. No opening deposit
                    is collected in this journey.
                  </p>
                  <p>
                    For this sample journey: an adult resident of India,
                    applying as the sole account holder.
                  </p>
                  {checkbox(
                    "eligible",
                    "I confirm this fictional applicant is 18 or over and resident in India.",
                  )}
                </>
              )}
              {step === 1 && (
                <>
                  {field(
                    "email",
                    "Sample email",
                    undefined,
                    "ananya@example.test",
                  )}
                  {field("phone", "Sample mobile contact", [
                    "DEMO-PHONE-01",
                    "DEMO-PHONE-02",
                    "DEMO-PHONE-03",
                  ])}
                  <p>
                    We simulate verification here. No SMS, email or OTP is sent.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const found = validateOnboarding(
                        { ...fields, contactVerified: true },
                        1,
                      );
                      setErrors(found);
                      if (!Object.keys(found).length)
                        update("contactVerified", true);
                    }}
                  >
                    Complete simulated contact check
                  </button>
                  <p role="status">
                    {fields.contactVerified
                      ? "Sample contact checked (simulated)"
                      : (errors.contactVerified ?? "Contact check pending")}
                  </p>
                </>
              )}
              {step === 2 && (
                <>
                  {field(
                    "name",
                    "Fictional full name",
                    undefined,
                    "Demo Ananya Rao",
                  )}
                  {field("birthDate", "Sample date of birth", [
                    "1990-01-01",
                    "1985-06-15",
                    "2000-03-20",
                  ])}
                </>
              )}
              {step === 3 && (
                <>
                  {field(
                    "address",
                    "Fictional residential address",
                    undefined,
                    "Demo 14 Sample Avenue",
                  )}
                  {field("city", "City", ["Chennai", "Bengaluru", "Mumbai"])}
                  {field("pincode", "Postal code", undefined, "600020")}
                  <div className="onboarding-field">
                    <label htmlFor="opening-taxResidency">Tax residency</label>
                    <FormSelect
                      id="opening-taxResidency"
                      value={fields.taxResidency}
                      onValueChange={(value) =>
                        update("taxResidency", value as "india" | "other")
                      }
                      aria-invalid={Boolean(errors.taxResidency)}
                      aria-describedby={
                        errors.taxResidency
                          ? "tax-help opening-tax-error"
                          : "tax-help"
                      }
                      options={[
                        { value: "india", label: "India only" },
                        {
                          value: "other",
                          label: "Another country or multiple countries",
                        },
                      ]}
                    />
                    <p id="tax-help">
                      This sample journey supports India-only tax residency.
                    </p>
                    {errors.taxResidency && (
                      <p
                        className="onboarding-field-error"
                        id="opening-tax-error"
                      >
                        {errors.taxResidency}
                      </p>
                    )}
                  </div>
                  {field("occupation", "Occupation", [
                    "Salaried",
                    "Self-employed",
                    "Student",
                    "Retired",
                  ])}
                </>
              )}
              {step === 4 && (
                <>
                  <p>
                    A nominee helps the bank know who should receive the balance
                    following the account holder’s death. This records a demo
                    preference only.
                  </p>
                  <div className="onboarding-options">
                    {[
                      ["add", "Add an adult sample nominee"],
                      ["decline", "Decline nomination for this demo"],
                    ].map(([value, label]) => (
                      <label key={value} className="onboarding-choice">
                        <input
                          type="radio"
                          name="nominee"
                          value={value}
                          checked={fields.nomineeChoice === value}
                          onChange={() =>
                            update("nomineeChoice", value as "add" | "decline")
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  {errors.nomineeChoice && (
                    <p className="onboarding-field-error">
                      {errors.nomineeChoice}
                    </p>
                  )}
                  {fields.nomineeChoice === "add" && (
                    <>
                      {field(
                        "nomineeName",
                        "Fictional nominee name",
                        undefined,
                        "Demo Kavya Rao",
                      )}
                      {field("nomineeRelationship", "Relationship", [
                        "Spouse",
                        "Parent",
                        "Sibling",
                        "Adult child",
                      ])}
                    </>
                  )}
                </>
              )}
              {step === 5 && (
                <>
                  <h3>Sample identity and address pack</h3>
                  <p>
                    The pack contains two fictional sample records. There is no
                    government identifier, photograph, upload or video call to
                    provide.
                  </p>
                  <p>
                    A bank officer will review these sample records after
                    submission. This is a simulated KYC stage.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      execute(attachSampleIdentityPack(), () =>
                        update("identityChecked", true),
                      )
                    }
                  >
                    Use sample identity pack
                  </button>
                  <p role="status">
                    {fields.identityChecked
                      ? "Sample identity and address records saved for branch review"
                      : (errors.identityChecked ??
                        "Sample pack not yet attached")}
                  </p>
                </>
              )}
              {step === 6 && (
                <>
                  <p>
                    Review your application before sending it to the branch. You
                    can edit each section.
                  </p>
                  <dl className="onboarding-review">
                    {[
                      ["Contact", `${fields.email} · ${fields.phone}`, 1],
                      [
                        "Personal details",
                        `${fields.name} · ${fields.birthDate}`,
                        2,
                      ],
                      [
                        "Address and tax",
                        `${fields.address}, ${fields.city} ${fields.pincode} · India · ${fields.occupation}`,
                        3,
                      ],
                      [
                        "Nominee",
                        fields.nomineeChoice === "add"
                          ? `${fields.nomineeName} · ${fields.nomineeRelationship}`
                          : "Declined for this demo",
                        4,
                      ],
                      [
                        "Identity",
                        "Sample pack · simulated verification · branch review required",
                        5,
                      ],
                    ].map(([label, value, index]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                        <button
                          type="button"
                          onClick={() => move(Number(index), false)}
                        >
                          Edit {label}
                        </button>
                      </div>
                    ))}
                  </dl>
                  <details>
                    <summary>Read demo savings terms</summary>
                    <p>
                      Everyday Savings is a synthetic INR account. No real
                      funds, legal identity verification, deposit protection or
                      regulated bank service is provided. Account opening
                      requires sample document review and separate approval.
                      Your saved application and nominee preference are
                      demonstration records.
                    </p>
                  </details>
                  {checkbox(
                    "termsAccepted",
                    "I accept the demo savings terms and consent to processing these fictional records.",
                  )}
                  {checkbox(
                    "accuracyConfirmed",
                    "I have reviewed this fictional application and confirm it is ready for branch review.",
                  )}
                </>
              )}
            </fieldset>
            {confirming && !uncertain && (
              <section
                className="onboarding-confirm"
                aria-label="Confirm application submission"
              >
                <h3 ref={confirmationHeading} tabIndex={-1}>
                  Send this application for review?
                </h3>
                <p>
                  Your details will be sent for review. The account opens only
                  after branch review and independent approval.
                </p>
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() => execute(confirmOnboarding(draft), apply, true)}
                >
                  {busy ? "Submitting…" : "Confirm and submit application"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  Keep editing
                </button>
              </section>
            )}
            <div className="onboarding-actions">
              <button
                type="button"
                disabled={busy || uncertain || step === 0}
                onClick={() => move(step - 1, false)}
              >
                <ArrowLeft size={18} />
                Back
              </button>
              <button
                type="button"
                disabled={busy || uncertain}
                onClick={() => move(step, false)}
              >
                Save draft
              </button>
              <button
                type="submit"
                className="primary"
                disabled={busy || uncertain}
              >
                {busy
                  ? "Saving…"
                  : step === 6
                    ? "Review submission"
                    : "Save and continue"}
                <ArrowRight size={18} />
              </button>
            </div>
          </form>
          <p className="onboarding-save" role="status">
            {message ||
              "Progress is saved when you continue or select Save draft."}
          </p>
        </>
      )}
      {error && (
        <p className="onboarding-error" role="alert">
          {error}
        </p>
      )}
      {uncertain && draft && (
        <div className="onboarding-recovery">
          <p>
            A write outcome needs checking. Reload the saved application before
            continuing; keep the original reference.
          </p>
          <button type="button" disabled={busy} onClick={refresh}>
            Inspect saved application
          </button>
        </div>
      )}
    </section>
  );
}
