import { Database } from "bun:sqlite";
import { afterEach } from "bun:test";
import { Schema } from "effect";
import type { LoanWriteInstruction } from "../../../src/platform/lending/domain/origination/loan-writing";
import { LoanRepaymentResult } from "../../../src/platform/lending/domain/repayments/loan-repayments";
import {
  repaymentAfter,
  repaymentInstruction,
} from "../../fixtures/loan-repayment";
import {
  workflowQuote,
  workflowQuotedAt,
  workflowResult,
} from "../../fixtures/loan-workflow";
export type Value = string | number | null;
export async function createHarness() {
  const paths: string[] = [];
  for await (const path of new Bun.Glob("migrations/*.sql").scan("."))
    paths.push(path);
  const script = (
    await Promise.all(paths.sort().map((path) => Bun.file(path).text()))
  ).join("\n");
  const tables = [
    "loan_repayment_offers",
    "loan_repayment_requests",
    "loan_repayment_operations",
    "loan_repayment_events",
  ];
  const databases: Database[] = [];
  afterEach(() => {
    for (const db of databases.splice(0)) db.close();
  });
  const insert = (db: Database, table: string, values: Record<string, Value>) =>
    db.run(
      `INSERT INTO ${table}(${Object.keys(values).join(",")}) VALUES(${Object.keys(
        values,
      )
        .map(() => "?")
        .join(",")})`,
      Object.values(values),
    );
  const loanId = repaymentInstruction.offer.loan_id;
  const requestId = "30000000-0000-4000-8000-000000000003";
  const iso = (at: number) => new Date(at).toISOString();
  const now = workflowQuotedAt + 60000;
  const operationId = repaymentInstruction.operation_id;
  const originalOffer = repaymentInstruction.offer;
  const command = {
    ...repaymentInstruction,
    consented_at: workflowQuotedAt + 1000,
  };
  const request = {
    id: requestId,
    version: 1,
    action: "pay",
    note: command.note,
  };
  const result = Schema.decodeUnknownSync(LoanRepaymentResult)({
    operation_id: operationId,
    loan: repaymentAfter,
    loan_transaction_id: 82,
    savings_transaction_id: 102,
    transfer_id: 92,
    amount_minor: 100000,
    principal_minor: 90000,
    interest_minor: 10000,
    date: "2026-10-17",
  });
  const seedActive = (db: Database) => {
    db.run(
      "INSERT INTO banks(id,status,customer_client,customer_account) VALUES('loan-test-bank','ready',41,51),('foreign-bank','ready',61,71)",
    );
    insert(db, "loan_quotes", {
      id: workflowQuote.id,
      bank_id: workflowQuote.bank_id,
      account_id: 51,
      client_id: 41,
      product_id: 31,
      quote_json: JSON.stringify(workflowQuote),
      quoted_at: workflowQuotedAt,
      expires_at: workflowQuote.expires_at,
      created_at: iso(workflowQuotedAt),
    });
    const event = {
      loan_id: loanId,
      bank_id: workflowQuote.bank_id,
      quote_id: workflowQuote.id,
      origin: "admin-pilot",
      accepted_at: workflowQuotedAt,
      actor: "customer",
      action: "submit",
      kind: "decision",
      note: "Invented customer acceptance",
      status: "submitted",
      maker: null,
      checker: null,
      core_id: null,
      withdrawal_requested: 0,
      version: 0,
      at_ms: workflowQuotedAt,
      created_at: iso(workflowQuotedAt),
      request_json: JSON.stringify({
        quote_id: workflowQuote.id,
        consent: true,
      }),
    };
    insert(db, "loan_events", {
      ...event,
      id: "orig-submit",
      command_key: "original-submit",
    });
    insert(db, "loan_events", {
      ...event,
      id: "orig-recommend",
      command_key: "original-recommend",
      actor: "officer",
      action: "recommend",
      status: "recommended",
      maker: "officer",
      version: 1,
    });
    for (const [index, action] of (
      ["register", "approve", "disburse"] as const
    ).entries()) {
      const version = 1 + index * 2;
      const id = `original-operation-${index}`;
      const input: LoanWriteInstruction = {
        owner: originalOffer.owner,
        terms: workflowQuote.terms,
        quote: workflowQuote,
        expected_disbursement_date: "2026-10-17",
        external_id: `of-loan-${loanId}`,
        action,
        key: `of-loan-op-${id}`,
        date: "2026-10-17",
        note: "Invented original authorization",
        consented_at: workflowQuotedAt,
        ...(action === "register" ? {} : { core_id: 71 }),
        ...(action === "disburse"
          ? { transaction_external_id: `of-loan-disburse-${id}` }
          : {}),
      };
      insert(db, "loan_operations", {
        id,
        loan_id: loanId,
        bank_id: workflowQuote.bank_id,
        account_id: 51,
        client_key: `original-client-${index}`,
        request_json: JSON.stringify({
          id: loanId,
          version,
          action,
          note: input.note,
        }),
        command_json: JSON.stringify(input),
        action,
        actor: "approver",
        original_version: version,
        status: "executing",
        version: 0,
        started_at: workflowQuotedAt,
        observed_at: workflowQuotedAt,
        created_at: iso(workflowQuotedAt),
        updated_at: iso(workflowQuotedAt),
      });
      db.run(
        "UPDATE loan_operations SET status='confirmed',version=1,result_json=?,observed_at=?,updated_at=? WHERE id=?",
        [
          JSON.stringify(workflowResult(input)),
          workflowQuotedAt,
          iso(workflowQuotedAt),
          id,
        ],
      );
    }
    db.run(
      "INSERT INTO financial_snapshots(bank_id,payload,synced_at,invalidated_at) VALUES('loan-test-bank','{}',?,0)",
      [workflowQuotedAt],
    );
  };
  const harness = () => {
    const db = new Database(":memory:");
    databases.push(db);
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(script);
    seedActive(db);
    return db;
  };
  const offer = (db: Database, overrides: Record<string, unknown> = {}) => {
    const value = { ...originalOffer, ...overrides };
    return insert(db, "loan_repayment_offers", {
      id: value.id as string,
      loan_id: loanId,
      bank_id: workflowQuote.bank_id,
      account_id: 51,
      offer_json: JSON.stringify(value),
      quoted_at: value.quoted_at as number,
      expires_at: value.expires_at as number,
      created_at: iso(workflowQuotedAt),
    });
  };
  const submit = (db: Database, overrides: Record<string, Value> = {}) =>
    insert(db, "loan_repayment_events", {
      id: "repayment-submit",
      request_id: requestId,
      loan_id: loanId,
      bank_id: workflowQuote.bank_id,
      offer_id: originalOffer.id,
      origin: "customer",
      consented_at: command.consented_at,
      command_key: "repayment-submit-key",
      request_json: JSON.stringify({
        offer_id: originalOffer.id,
        consent: true,
      }),
      actor: "customer",
      action: "submit",
      kind: "decision",
      note: "Customer accepts owned savings partial payment",
      status: "submitted",
      maker: null,
      checker: null,
      version: 0,
      at_ms: command.consented_at,
      created_at: iso(command.consented_at),
      ...overrides,
    });
  const decision = (
    db: Database,
    action = "recommend",
    actor = "officer",
    overrides: Record<string, Value> = {},
  ) =>
    insert(db, "loan_repayment_events", {
      id: `repayment-${action}`,
      request_id: requestId,
      loan_id: loanId,
      bank_id: workflowQuote.bank_id,
      offer_id: originalOffer.id,
      origin: "customer",
      consented_at: command.consented_at,
      command_key: `repayment-${action}-key`,
      request_json: JSON.stringify({
        id: requestId,
        version: 0,
        action,
        note: "Independently reviewed payment",
      }),
      actor,
      action,
      kind: "decision",
      note: "Independently reviewed payment",
      status:
        action === "recommend"
          ? "recommended"
          : action === "cancel"
            ? "cancelled"
            : "rejected",
      maker: action === "recommend" ? "officer" : null,
      checker: null,
      version: 1,
      at_ms: now,
      created_at: iso(now),
      ...overrides,
    });
  const reserve = (db: Database, overrides: Record<string, Value> = {}) =>
    insert(db, "loan_repayment_operations", {
      id: operationId,
      request_id: requestId,
      loan_id: loanId,
      bank_id: workflowQuote.bank_id,
      account_id: 51,
      client_key: "repayment-payment-key",
      request_json: JSON.stringify(request),
      command_json: JSON.stringify(command),
      actor: "approver",
      original_version: 1,
      status: "executing",
      version: 0,
      started_at: now,
      observed_at: now,
      created_at: iso(now),
      updated_at: iso(now),
      ...overrides,
    });
  const prepare = (db: Database) => {
    offer(db);
    submit(db);
    decision(db);
  };
  const outcome = (
    db: Database,
    status: string,
    proof: unknown = null,
    version = 0,
  ) =>
    db.run(
      "UPDATE loan_repayment_operations SET status=?,version=version+1,result_json=?,error=?,observed_at=?,updated_at=? WHERE id=? AND version=?",
      [
        status,
        proof === null ? null : JSON.stringify(proof),
        status === "confirmed" ? null : "Original result requires inspection",
        now + 1000,
        iso(now + 1000),
        operationId,
        version,
      ],
    );
  const row = (db: Database, table: string) =>
    db.query(`SELECT * FROM ${table} ORDER BY rowid DESC LIMIT 1`).get();
  return {
    get paths() {
      return paths;
    },
    get script() {
      return script;
    },
    get tables() {
      return tables;
    },
    get databases() {
      return databases;
    },
    get insert() {
      return insert;
    },
    get loanId() {
      return loanId;
    },
    get requestId() {
      return requestId;
    },
    get iso() {
      return iso;
    },
    get now() {
      return now;
    },
    get operationId() {
      return operationId;
    },
    get originalOffer() {
      return originalOffer;
    },
    get command() {
      return command;
    },
    get request() {
      return request;
    },
    get result() {
      return result;
    },
    get seedActive() {
      return seedActive;
    },
    get harness() {
      return harness;
    },
    get offer() {
      return offer;
    },
    get submit() {
      return submit;
    },
    get decision() {
      return decision;
    },
    get reserve() {
      return reserve;
    },
    get prepare() {
      return prepare;
    },
    get outcome() {
      return outcome;
    },
    get row() {
      return row;
    },
  };
}
