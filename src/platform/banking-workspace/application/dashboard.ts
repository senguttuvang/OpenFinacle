import { Clock, Effect } from "effect";
import {
  type Application,
  type BankingCommand,
  type Beneficiary,
  bankingDate,
  type Session,
} from "../domain/banking";
import { Store } from "../domain/ports";
import { financialView } from "./financial-view";
import { requiredBank } from "./workspace-context";
export const dashboard = (session: Session, refresh = true) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const bank = yield* requiredBank(session);
    const financial = yield* financialView(bank, refresh);
    const { account, recipient } = financial;
    const employer = session.role === "customer" ? null : financial.employer;
    const {
      application,
      beneficiaries,
      commands,
      events,
      documents,
      requests,
    } = yield* Effect.all(
      {
        application: store.one<Application>(
          "SELECT * FROM applications WHERE bank_id=?",
          bank.id,
        ),
        beneficiaries: store.all<Beneficiary>(
          "SELECT * FROM beneficiaries WHERE bank_id=? ORDER BY created_at DESC",
          bank.id,
        ),
        commands: store.all<BankingCommand>(
          "SELECT * FROM commands WHERE bank_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100",
          bank.id,
        ),
        events: store.all(
          "SELECT * FROM audit WHERE bank_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100",
          bank.id,
        ),
        documents: store.all(
          "SELECT id,name,kind,size,created_at FROM documents WHERE bank_id=?",
          bank.id,
        ),
        requests: store.all(
          "SELECT id,bank_id,kind,detail,status,created_at FROM service_requests WHERE bank_id=? ORDER BY created_at DESC",
          bank.id,
        ),
      },
      { concurrency: 3 },
    );
    return {
      bank: { id: bank.id, created_at: bank.created_at, journey: bank.journey },
      role: session.role,
      account,
      recipient: {
        id: recipient.id,
        accountNo: recipient.accountNo,
        clientName: recipient.clientName,
        ...(session.role === "customer" ? {} : { summary: recipient.summary }),
      },
      employer,
      application,
      beneficiaries,
      commands,
      audit: events,
      documents,
      requests,
      core: {
        engine: "Apache Fineract",
        version: "1.15.0",
        connected: refresh,
        syncedAt: financial.syncedAt,
        cached: !refresh,
        stale: financial.stale,
      },
      businessDate: bankingDate(yield* Clock.currentTimeMillis),
    };
  });
