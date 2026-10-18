import { Effect, Schema } from "effect";
import {
  type Application,
  BankingError,
  type Session,
} from "../domain/banking";
import {
  emptyOnboarding,
  type OnboardingDraft,
  OnboardingFields,
  OnboardingSave,
  validateOnboarding,
} from "../domain/onboarding";
import { Core, Store } from "../domain/ports";
import { requiredBank, submitApplication } from "./banking";
import { assertApplicantScope } from "./customer-registry";

interface DraftRow {
  id: string;
  bank_id: string;
  operation_id: string;
  version: number;
  step: number;
  fields: string;
  status: OnboardingDraft["status"];
}
const fail = (message: string, status = 409) =>
  Effect.fail(new BankingError({ message, status }));
const readAccount = (path: string) =>
  Effect.gen(function* () {
    const core = yield* Core;
    return yield* Schema.decodeUnknown(
      Schema.Struct({
        id: Schema.Number,
        clientId: Schema.Number,
        accountNo: Schema.String,
        status: Schema.Struct({ active: Schema.Boolean }),
        currency: Schema.Struct({
          code: Schema.String,
          decimalPlaces: Schema.Number,
        }),
        externalId: Schema.optional(Schema.String),
        savingsProductId: Schema.optional(Schema.Number),
      }),
    )(yield* core.request<unknown>("GET", path)).pipe(
      Effect.mapError(
        () =>
          new BankingError({
            message:
              "Core returned an incomplete savings record. Inspect the original account before continuing.",
            status: 503,
          }),
      ),
    );
  });
const applicantBank = (session: Session) =>
  Effect.gen(function* () {
    yield* assertApplicantScope(session);
    const bank = yield* requiredBank(session);
    const store = yield* Store;
    const shared = yield* store.one<{ value: string }>(
      "SELECT value FROM settings WHERE key='demo_new_bank'",
    );
    if (shared?.value === bank.id)
      return yield* fail(
        "Start an independent application from New customer. The shared demonstration cannot be changed.",
      );
    return bank;
  });
const row = (session: Session) =>
  Effect.gen(function* () {
    yield* applicantBank(session);
    const store = yield* Store;
    const draft = yield* store.one<DraftRow>(
      "SELECT * FROM onboarding_drafts WHERE bank_id=?",
      session.bank_id,
    );
    if (!draft)
      return yield* fail(
        "No saved application. Start a new application first.",
        404,
      );
    return draft;
  });

export const onboardingStatus = (session: Session) =>
  Effect.gen(function* () {
    const saved = yield* row(session);
    const store = yield* Store;
    const fields = yield* Schema.decodeUnknown(
      Schema.parseJson(OnboardingFields),
    )(saved.fields).pipe(
      Effect.mapError(
        () =>
          new BankingError({
            message:
              "The saved application could not be read. Ask the branch to inspect it.",
            status: 503,
          }),
      ),
    );
    const application = yield* store.one<Application>(
      "SELECT * FROM applications WHERE bank_id=?",
      session.bank_id,
    );
    const bank = yield* requiredBank(session);
    let account: OnboardingDraft["account"] = null;
    if (application?.status === "approved" && bank.customer_account > 0) {
      const confirmed = yield* readAccount(
        `savingsaccounts/${bank.customer_account}`,
      );
      if (
        confirmed.id !== bank.customer_account ||
        confirmed.clientId !== bank.customer_client ||
        !confirmed.status.active ||
        confirmed.currency.code !== "INR" ||
        confirmed.currency.decimalPlaces !== 2
      )
        return yield* fail(
          "The opened account could not be confirmed active in Core. Ask the branch to inspect the original opening.",
          503,
        );
      account = { id: confirmed.id, accountNo: confirmed.accountNo };
    }
    // An interrupted submission is inspected, never dispatched again. The canonical
    // application row proves submission even if the final draft acknowledgement failed.
    return {
      id: saved.id,
      operationId: saved.operation_id,
      bankId: saved.bank_id,
      version: saved.version,
      step: saved.step,
      fields,
      status:
        application && saved.status !== "draft"
          ? ("submitted" as const)
          : saved.status,
      applicationStatus: application?.status ?? null,
      account,
    } satisfies OnboardingDraft;
  });

export const startOnboardingDraft = (session: Session, operationId: string) =>
  Effect.gen(function* () {
    if (session.role !== "customer")
      return yield* fail("Start the application as the customer.", 403);
    yield* applicantBank(session);
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(operationId))
      return yield* fail(
        "Use the original application operation identity.",
        400,
      );
    const store = yield* Store;
    yield* store.run(
      "INSERT OR IGNORE INTO onboarding_drafts(id,bank_id,operation_id,fields) VALUES(?,?,?,?)",
      operationId,
      session.bank_id,
      operationId,
      JSON.stringify(emptyOnboarding),
    );
    return yield* onboardingStatus(session);
  });

export const saveOnboardingDraft = (
  session: Session,
  input: typeof OnboardingSave.Type,
) =>
  Effect.gen(function* () {
    if (session.role !== "customer")
      return yield* fail("Edit the application as the customer.", 403);
    const command = yield* Schema.decodeUnknown(OnboardingSave, {
      onExcessProperty: "error",
    })(input).pipe(
      Effect.mapError(
        () =>
          new BankingError({
            message: "The application draft is invalid.",
            status: 400,
          }),
      ),
    );
    const saved = yield* row(session);
    if (saved.status !== "draft")
      return yield* fail(
        "Submission is reserved. Inspect the original application status before continuing.",
      );
    // Drafts may be incomplete, but never store unrestricted identifiers or excessive input.
    const safe = command.fields;
    if (
      (safe.name && !/^Demo [a-z .'-]{0,74}$/i.test(safe.name)) ||
      (safe.nomineeName && !/^Demo [a-z .'-]{0,74}$/i.test(safe.nomineeName)) ||
      (safe.email && !/^[a-z0-9._+-]{0,80}@example\.test$/i.test(safe.email)) ||
      (safe.phone && !/^DEMO-PHONE-0[1-9]$/.test(safe.phone)) ||
      (safe.address && !/^Demo [a-z0-9 ,.'/-]{0,140}$/i.test(safe.address)) ||
      !["", "1990-01-01", "1985-06-15", "2000-03-20"].includes(
        safe.birthDate,
      ) ||
      !["", "Chennai", "Bengaluru", "Mumbai"].includes(safe.city) ||
      !["", "Salaried", "Self-employed", "Student", "Retired"].includes(
        safe.occupation,
      ) ||
      !["", "Spouse", "Parent", "Sibling", "Adult child"].includes(
        safe.nomineeRelationship,
      ) ||
      (safe.pincode && !/^\d{0,6}$/.test(safe.pincode)) ||
      Object.values(safe).some(
        (value) => typeof value === "string" && value.length > 160,
      )
    )
      return yield* fail(
        "Save fictional sample details only: Demo names/address, @example.test email and a sample mobile.",
        400,
      );
    const changed = yield* storeSave(session, command);
    if (!changed)
      return yield* fail(
        "This draft changed in another tab. Reload the saved draft before editing.",
      );
    return yield* onboardingStatus(session);
  });
const storeSave = (session: Session, input: typeof OnboardingSave.Type) =>
  Effect.gen(function* () {
    const store = yield* Store;
    return yield* store.run(
      "UPDATE onboarding_drafts SET fields=?,step=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE bank_id=? AND version=? AND status='draft'",
      JSON.stringify(input.fields),
      input.step,
      session.bank_id,
      input.version,
    );
  });

export const submitOnboarding = (
  session: Session,
  operationId: string,
  version: number,
) =>
  Effect.gen(function* () {
    if (session.role !== "customer")
      return yield* fail("Submit the application as the customer.", 403);
    const saved = yield* row(session);
    if (saved.operation_id !== operationId)
      return yield* fail(
        "Inspect the original application. A replacement submission identity is not accepted.",
      );
    if (saved.status !== "draft") return yield* onboardingStatus(session);
    const draft = yield* onboardingStatus(session);
    const errors = validateOnboarding(draft.fields);
    if (Object.keys(errors).length)
      return yield* fail(Object.values(errors).join(" "), 400);
    const store = yield* Store;
    const documents = yield* store.all<{ kind: string; name: string }>(
      "SELECT kind,name FROM documents WHERE bank_id=?",
      session.bank_id,
    );
    if (
      !["identity", "address"].every((kind) =>
        documents.some(
          (document) =>
            document.kind === kind &&
            document.name === `Demo-onboarding-${kind}.txt`,
        ),
      )
    )
      return yield* fail(
        "Attach the sample identity and address pack before submitting.",
        400,
      );
    const claimed = yield* store.run(
      "UPDATE onboarding_drafts SET status='submitting',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE bank_id=? AND operation_id=? AND version=? AND status='draft'",
      session.bank_id,
      operationId,
      version,
    );
    if (!claimed)
      return yield* fail(
        "The draft changed or submission is already reserved. Reload its status.",
      );
    yield* submitApplication(session, {
      name: draft.fields.name,
      email: draft.fields.email,
      phone: draft.fields.phone,
      address: `${draft.fields.address}, ${draft.fields.city} ${draft.fields.pincode}`,
      employment: draft.fields.occupation,
    }).pipe(
      Effect.tapError(() =>
        store.run(
          "UPDATE onboarding_drafts SET status='submission_exception' WHERE bank_id=? AND operation_id=?",
          session.bank_id,
          operationId,
        ),
      ),
    );
    yield* store.run(
      "UPDATE onboarding_drafts SET status='submitted',updated_at=CURRENT_TIMESTAMP WHERE bank_id=? AND operation_id=?",
      session.bank_id,
      operationId,
    );
    return yield* onboardingStatus(session);
  });

// Reconcile only a previously authorised opening. These Core calls are GETs;
// an absent, partial or mismatched account never authorises another dispatch.
export const inspectOnboardingOpening = (session: Session) =>
  Effect.gen(function* () {
    if (session.role !== "approver")
      return yield* fail(
        "An independent approver must inspect the original opening.",
        403,
      );
    yield* row(session);
    const store = yield* Store;
    const application = yield* store.one<Application>(
      "SELECT * FROM applications WHERE bank_id=?",
      session.bank_id,
    );
    if (
      application?.status !== "opening_exception" ||
      application.maker !== "officer"
    )
      return yield* fail(
        "Only a previously authorised opening exception can be reconciled.",
      );
    const bank = yield* requiredBank(session);
    const core = yield* Core;
    const original = `${bank.id}-customer`;
    const account = yield* readAccount(
      `savingsaccounts/external-id/${encodeURIComponent(original)}`,
    );
    const product = yield* store.one<{ value: string }>(
      "SELECT value FROM settings WHERE key='savings_product'",
    );
    if (
      !Number.isSafeInteger(account.id) ||
      account.id <= 0 ||
      !Number.isSafeInteger(account.clientId) ||
      account.clientId <= 0 ||
      account.externalId !== original ||
      !account.status.active ||
      account.currency.code !== "INR" ||
      account.currency.decimalPlaces !== 2 ||
      !account.accountNo ||
      !product ||
      account.savingsProductId !== Number(product.value) ||
      (bank.customer_account !== 0 && bank.customer_account !== account.id) ||
      (bank.customer_client !== 0 && bank.customer_client !== account.clientId)
    )
      return yield* fail(
        "Core has not confirmed the original active savings account. Keep the opening exception for branch inspection.",
      );
    const client = yield* core.request<{
      id: number;
      externalId: string;
      displayName: string;
      active: boolean;
    }>("GET", `clients/${account.clientId}`);
    if (
      client.id !== account.clientId ||
      client.externalId !== original ||
      client.displayName !== application.name ||
      !client.active
    )
      return yield* fail(
        "The original applicant could not be matched to the Core account. Keep the opening exception for branch inspection.",
      );
    const bound = yield* store.run(
      "UPDATE banks SET customer_client=?,customer_account=? WHERE id=? AND customer_account IN (0,?) AND customer_client IN (0,?)",
      client.id,
      account.id,
      bank.id,
      account.id,
      client.id,
    );
    if (!bound)
      return yield* fail(
        "The original applicant scope changed during inspection. Keep the opening exception for branch review.",
      );
    yield* store.run(
      "UPDATE applications SET status='approved',review_note='Original active Core opening confirmed by read-only inspection' WHERE id=? AND status='opening_exception'",
      application.id,
    );
    return yield* onboardingStatus(session);
  });
