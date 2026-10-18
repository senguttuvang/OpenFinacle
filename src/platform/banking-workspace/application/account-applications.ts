import { Effect } from "effect";
import { openAccount } from "../../../demo/workspaces/workspace-provisioning";
import {
  type Application,
  BankingError,
  canApprove,
  type Session,
} from "../domain/banking";
import { Store } from "../domain/ports";
import { audit, requiredBank, requireStaff } from "./workspace-context";

interface ApplicationInput {
  name: string;
  email: string;
  phone: string;
  address: string;
  employment: string;
}

export const submitApplication = (session: Session, input: ApplicationInput) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const bank = yield* requiredBank(session);
    if (session.role !== "customer")
      return yield* Effect.fail(
        new BankingError({
          message: "Submit the application as the customer.",
          status: 403,
        }),
      );
    if (bank.customer_account)
      return yield* Effect.fail(
        new BankingError({
          message: "Your account is already open.",
          status: 409,
        }),
      );
    if (
      !input.name.trim() ||
      !input.email.includes("@") ||
      input.phone.length < 8 ||
      input.address.length < 8
    )
      return yield* Effect.fail(
        new BankingError({
          message: "Complete your name, email, phone and address.",
          status: 400,
        }),
      );
    const docs = yield* store.all<{ kind: string }>(
      "SELECT kind FROM documents WHERE bank_id=?",
      bank.id,
    );
    if (
      !docs.some((d) => d.kind === "identity") ||
      !docs.some((d) => d.kind === "address")
    )
      return yield* Effect.fail(
        new BankingError({
          message:
            "Attach synthetic identity and address documents before submitting.",
          status: 400,
        }),
      );
    const existing = yield* store.one<Application>(
      "SELECT * FROM applications WHERE bank_id=?",
      bank.id,
    );
    if (existing && !["needs_changes", "submitted"].includes(existing.status))
      return yield* Effect.fail(
        new BankingError({
          message: "This application is already being processed.",
          status: 409,
        }),
      );
    yield* store.run(
      "INSERT INTO applications(id,bank_id,name,email,phone,address,employment,status,maker) VALUES(?,?,?,?,?,?,?,'submitted','customer') ON CONFLICT(bank_id) DO UPDATE SET name=excluded.name,email=excluded.email,phone=excluded.phone,address=excluded.address,employment=excluded.employment,status='submitted',review_note=NULL",
      existing?.id ?? crypto.randomUUID(),
      bank.id,
      input.name.trim(),
      input.email,
      input.phone,
      input.address,
      input.employment,
    );
    yield* audit(
      bank.id,
      session.role,
      "Account application submitted",
      `${input.name}: identity and address documents supplied.`,
    );
    return { status: "submitted" };
  });

export const reviewApplication = (
  session: Session,
  decision: string,
  note: string,
) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const bank = yield* requiredBank(session);
    yield* requireStaff(session);
    const app = yield* store.one<Application>(
      "SELECT * FROM applications WHERE bank_id=?",
      bank.id,
    );
    if (!app)
      return yield* Effect.fail(
        new BankingError({ message: "No application to review.", status: 404 }),
      );
    if (decision === "needs_changes" || decision === "recommend") {
      if (session.role !== "officer" || app.status !== "submitted")
        return yield* Effect.fail(
          new BankingError({
            message: "The bank officer must review a submitted application.",
            status: 409,
          }),
        );
      yield* store.run(
        "UPDATE applications SET status=?,review_note=?,maker='officer' WHERE id=? AND status='submitted'",
        decision === "recommend" ? "awaiting_approval" : "needs_changes",
        note || "Documents reviewed",
        app.id,
      );
      yield* audit(
        bank.id,
        session.role,
        decision === "recommend"
          ? "Application recommended"
          : "Additional information requested",
        note || "Identity and address reviewed.",
      );
      return {
        status:
          decision === "recommend" ? "awaiting_approval" : "needs_changes",
      };
    }
    if (
      decision !== "approve" ||
      !canApprove(session.role, app.maker) ||
      app.status !== "awaiting_approval"
    )
      return yield* Effect.fail(
        new BankingError({
          message:
            "A separate approver must approve a recommended application.",
          status: 403,
        }),
      );
    const claimed = yield* store.run(
      "UPDATE applications SET status='opening' WHERE id=? AND status='awaiting_approval'",
      app.id,
    );
    if (!claimed)
      return yield* Effect.fail(
        new BankingError({
          message: "Account opening is already in progress.",
          status: 409,
        }),
      );
    const names = app.name.trim().split(/\s+/);
    const opened = yield* openAccount(
      bank.id,
      "customer",
      names[0],
      names.slice(1).join(" ") || "Customer",
      0,
    ).pipe(
      Effect.tapError((error) =>
        store.run(
          "UPDATE applications SET status='opening_exception',review_note=? WHERE id=?",
          error.message,
          app.id,
        ),
      ),
    );
    yield* store.run(
      "UPDATE banks SET customer_client=?,customer_account=? WHERE id=?",
      opened.client,
      opened.account,
      bank.id,
    );
    yield* store.run(
      "UPDATE applications SET status='approved',review_note=? WHERE id=?",
      "Account opened and activated in Apache Fineract",
      app.id,
    );
    yield* audit(
      bank.id,
      session.role,
      "Savings account opened",
      `Fineract account ${opened.account}; approved separately from document review.`,
    );
    return { status: "approved", accountId: opened.account };
  });
