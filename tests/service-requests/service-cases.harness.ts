import { Database } from "bun:sqlite";
import { beforeEach, mock } from "bun:test";
import { Effect, Layer } from "effect";
import {
  BankingError,
  type Session,
} from "../../src/platform/banking-workspace/domain/banking";
import {
  Store,
  type StoreService,
} from "../../src/platform/banking-workspace/domain/ports";
import {
  actOnServiceCase,
  submitServiceCase,
} from "../../src/platform/service-requests/application/service-cases";
import type {
  CaseAction,
  ServiceCase,
} from "../../src/platform/service-requests/domain/service-cases";

export async function createHarness() {
  mock.module("@cloudflare/containers", () => ({
    getContainer: (namespace: unknown) => namespace,
  }));
  const { handleRequest } = await import("../../src/runtime/http/http");
  let db: Database;
  let interfere: (() => void) | undefined;
  const customer: Session = {
    token_hash: "synthetic",
    bank_id: "case-bank",
    role: "customer",
    expires_at: Number.MAX_SAFE_INTEGER,
  };
  const officer: Session = { ...customer, role: "officer" };
  const approver: Session = { ...customer, role: "approver" };
  const cheque = { leaves: "25", delivery: "Collect at branch" };
  const address = {
    address: "14 Example Lane",
    city: "Chennai",
    pincode: "600020",
  };
  const initialize = async (legacy = false) => {
    db?.close();
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys=ON");
    for (const file of [
      "0001_workflows.sql",
      "0002_reversal_guard.sql",
      "0003_customer_journey.sql",
      "0004_persistent_demo.sql",
    ])
      db.exec(await Bun.file(`migrations/${file}`).text());
    db.run(
      "INSERT INTO banks(id,status,customer_account) VALUES('case-bank','ready',101),('other-bank','ready',202),('unopened','ready',0)",
    );
    if (legacy)
      db.run(
        "INSERT INTO service_requests(id,bank_id,kind,detail,status) VALUES('legacy-cheque','case-bank','chequebook','Earlier cheque request','open'),('legacy-product','case-bank','fixed_deposit','Earlier product application','open'),('legacy-address','case-bank','address_change','Earlier synthetic address request','open')",
      );
    db.exec(await Bun.file("migrations/0005_service_cases.sql").text());
    db.exec(await Bun.file("migrations/0006_legacy_service_guards.sql").text());
    db.exec(await Bun.file("migrations/0007_cards.sql").text());
    db.exec(await Bun.file("migrations/0008_profiles.sql").text());
    interfere = undefined;
  };
  beforeEach(() => initialize());
  const failure = () =>
    new BankingError({ message: "Workflow persistence failed.", status: 503 });
  const layer = () =>
    Layer.succeed(Store, {
      all: <T>(sql: string, ...values: (string | number | null)[]) =>
        Effect.try({
          try: () => db.query(sql).all(...values) as T[],
          catch: failure,
        }),
      one: <T>(sql: string, ...values: (string | number | null)[]) =>
        Effect.try({
          try: () => {
            if (sql.startsWith("UPDATE service_requests") && interfere) {
              const callback = interfere;
              interfere = undefined;
              callback();
            }
            return db.query(sql).get(...values) as T | null;
          },
          catch: failure,
        }),
      run: (sql: string, ...values: (string | number | null)[]) =>
        Effect.try({ try: () => db.run(sql, values).changes, catch: failure }),
    });
  const run = <A, E>(task: Effect.Effect<A, E, StoreService>) =>
    Effect.runPromise(task.pipe(Effect.provide(layer())));
  const denied = <A>(task: Effect.Effect<A, BankingError, StoreService>) =>
    run(task.pipe(Effect.flip));
  const row = (id: string) =>
    db
      .query("SELECT * FROM service_requests WHERE id=?")
      .get(id) as ServiceCase;
  const action = (
    session: Session,
    id: string,
    act: CaseAction,
    note = "Reviewed synthetic request",
    fields?: Record<string, string>,
    version = row(id).version,
  ) =>
    actOnServiceCase(session, {
      id,
      version,
      action: act,
      note,
      ...(fields ? { fields } : {}),
    });
  const submit = (
    code = "chequebook",
    fields: Record<string, string> = cheque,
    key = "case-request-key-one",
  ) => submitServiceCase(customer, code, fields, key);
  return {
    get handleRequest() {
      return handleRequest;
    },
    get db() {
      return db;
    },
    set db(value: typeof db) {
      db = value;
    },
    get interfere() {
      return interfere;
    },
    set interfere(value: typeof interfere) {
      interfere = value;
    },
    get customer() {
      return customer;
    },
    get officer() {
      return officer;
    },
    get approver() {
      return approver;
    },
    get cheque() {
      return cheque;
    },
    get address() {
      return address;
    },
    get initialize() {
      return initialize;
    },
    get failure() {
      return failure;
    },
    get layer() {
      return layer;
    },
    get run() {
      return run;
    },
    get denied() {
      return denied;
    },
    get row() {
      return row;
    },
    get action() {
      return action;
    },
    get submit() {
      return submit;
    },
  };
}
