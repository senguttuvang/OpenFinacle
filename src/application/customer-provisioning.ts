import { Clock, Effect } from "effect";
import { type Bank, BankingError, bankingDate } from "../domain/banking";
import {
  CustomerProvisioner,
  type SeedCustomer,
  type SeedOperation,
  type SeedProof,
  type SeedStage,
  syntheticCustomers,
} from "../domain/customer-provisioning";
import { Store } from "../domain/ports";
import { registerCustomer, registerLegacyCustomer } from "./customer-registry";
import { financialView } from "./financial-view";

const fail = (message: string) =>
  Effect.fail(new BankingError({ message, status: 409, uncertain: false }));
const stages: readonly SeedStage[] = [
  "client",
  "account",
  "approve",
  "activate",
  "fund",
];
const seedRow = (id: string) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const row = yield* store.one<SeedCustomer>(
      "SELECT * FROM customer_seed_manifest WHERE id=?",
      id,
    );
    if (!row) return yield* fail("Synthetic manifest entry not found.");
    return row;
  });
const saveSeedProof = (
  row: SeedCustomer,
  operation: SeedOperation,
  proof: SeedProof,
) =>
  Effect.gen(function* () {
    const store = yield* Store;
    // Persist identity first; if outcome persistence fails, read-only inspection recovers it.
    if (operation.stage === "client")
      yield* store.run(
        "UPDATE customer_seed_manifest SET client_id=? WHERE id=?",
        proof.client_id ?? proof.resource_id,
        row.id,
      );
    if (operation.stage === "account") {
      if (!proof.account_id || !proof.account_no)
        return yield* fail("Original Core account proof is incomplete.");
      yield* store.run(
        "UPDATE customer_seed_manifest SET account_id=?,account_no=? WHERE id=?",
        proof.account_id,
        proof.account_no,
        row.id,
      );
    }
    yield* store.run(
      "UPDATE customer_seed_operations SET status='confirmed',resource_id=? WHERE seed_id=? AND stage=? AND status IN ('executing','uncertain')",
      proof.resource_id,
      row.id,
      operation.stage,
    );
  });
export const customerSeedStatus = (branchId: string) =>
  Effect.gen(function* () {
    const store = yield* Store;
    return {
      branch_id: branchId,
      customers: yield* store.all<SeedCustomer>(
        "SELECT * FROM customer_seed_manifest WHERE branch_id=? ORDER BY ordinal",
        branchId,
      ),
      operations: yield* store.all<SeedOperation>(
        "SELECT o.* FROM customer_seed_operations o JOIN customer_seed_manifest m ON m.id=o.seed_id WHERE m.branch_id=? ORDER BY m.ordinal,o.stage",
        branchId,
      ),
      registered: yield* store.one<{ count: number }>(
        "SELECT COUNT(*) AS count FROM customers WHERE branch_id=? AND origin='seed'",
        branchId,
      ),
    };
  });
export const prepareCustomerManifest = (branchId: string) =>
  Effect.gen(function* () {
    yield* registerLegacyCustomer(branchId);
    const store = yield* Store;
    for (const row of syntheticCustomers(branchId))
      yield* store.run(
        "INSERT INTO customer_seed_manifest(id,branch_id,ordinal,reference,firstname,lastname,funding_minor) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
        row.id,
        row.branch_id,
        row.ordinal,
        row.reference,
        row.firstname,
        row.lastname,
        row.funding_minor,
      );
    return yield* customerSeedStatus(branchId);
  });
export const inspectCustomerSeed = (id: string) =>
  Effect.gen(function* () {
    const row = yield* seedRow(id);
    const store = yield* Store;
    const provisioner = yield* CustomerProvisioner;
    const operations = yield* store.all<SeedOperation>(
      "SELECT * FROM customer_seed_operations WHERE seed_id=? AND status IN ('executing','uncertain')",
      id,
    );
    for (const operation of operations) {
      const proof = yield* provisioner
        .inspect(row, operation)
        .pipe(Effect.either);
      if (proof._tag === "Right")
        yield* saveSeedProof(row, operation, proof.right);
      else if (operation.status === "executing")
        yield* store.run(
          "UPDATE customer_seed_operations SET status='uncertain' WHERE seed_id=? AND stage=? AND status='executing'",
          id,
          operation.stage,
        );
    }
    return yield* customerSeedStatus(row.branch_id);
  });
const publishCustomer = (row: SeedCustomer) =>
  Effect.gen(function* () {
    if (!row.client_id || !row.account_id || !row.account_no)
      return yield* fail(
        "Complete positive customer/account proof before registration.",
      );
    const store = yield* Store;
    const branch = yield* store.one<Bank>(
      "SELECT * FROM banks WHERE id=? AND status='ready'",
      row.branch_id,
    );
    if (!branch) return yield* fail("Original branch scope is not ready.");
    yield* store.run(
      "INSERT INTO banks(id,journey,status,customer_client,customer_account,recipient_client,recipient_account,employer_client,employer_account) VALUES(?,'existing','ready',?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
      row.id,
      row.client_id,
      row.account_id,
      branch.recipient_client,
      branch.recipient_account,
      branch.employer_client,
      branch.employer_account,
    );
    const customer = yield* registerCustomer({
      id: row.id,
      bank_id: row.id,
      branch_id: row.branch_id,
      reference: row.reference,
      display_name: `${row.firstname} ${row.lastname}`,
      client_id: row.client_id,
      account_id: row.account_id,
      account_no: row.account_no,
      origin: "seed",
    });
    const bank = yield* store.one<Bank>(
      "SELECT * FROM banks WHERE id=?",
      row.id,
    );
    if (!bank) return yield* fail("Registered customer scope is missing.");
    // Initial cache is read from Core. Repeated provisioning never funds or resets it.
    yield* financialView(bank, true);
    return customer;
  });
export const resumeCustomerSeed = (
  branchId: string,
  start: number,
  limit: number,
  maxStages = 50,
) =>
  Effect.gen(function* () {
    if (
      !Number.isSafeInteger(start) ||
      start < 1 ||
      start > 100 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 10 ||
      !Number.isSafeInteger(maxStages) ||
      maxStages < 1 ||
      maxStages > 50
    )
      return yield* fail(
        "Resume 1–10 manifest entries starting at ordinal 1–100.",
      );
    const store = yield* Store;
    const provisioner = yield* CustomerProvisioner;
    const rows = yield* store.all<SeedCustomer>(
      "SELECT * FROM customer_seed_manifest WHERE branch_id=? AND ordinal>=? ORDER BY ordinal LIMIT ?",
      branchId,
      start,
      limit,
    );
    if (!rows.length)
      return yield* fail(
        "Prepare the durable synthetic manifest before resuming.",
      );
    let dispatched = 0;
    for (const original of rows) {
      for (const stage of stages) {
        const row = yield* seedRow(original.id);
        const existing = yield* store.one<SeedOperation>(
          "SELECT * FROM customer_seed_operations WHERE seed_id=? AND stage=?",
          row.id,
          stage,
        );
        if (existing?.status === "confirmed") continue;
        if (existing)
          return yield* fail(
            `Seed ${row.ordinal} ${stage} is ${existing.status}. Inspect the original; no Core write was retried.`,
          );
        if (dispatched >= maxStages) return yield* customerSeedStatus(branchId);
        const operation: SeedOperation = {
          seed_id: row.id,
          stage,
          command_key: `${row.id}-${stage}`,
          payment_date: bankingDate(yield* Clock.currentTimeMillis),
          status: "executing",
          resource_id: null,
        };
        const saved = yield* store.run(
          "INSERT INTO customer_seed_operations(seed_id,stage,command_key,payment_date,status) VALUES(?,?,?,?,'executing') ON CONFLICT(seed_id,stage) DO NOTHING",
          row.id,
          stage,
          operation.command_key,
          operation.payment_date,
        );
        if (saved !== 1)
          return yield* fail(
            "Another operator reserved this original seed stage. Inspect it.",
          );
        const result = yield* provisioner
          .dispatch(row, operation)
          .pipe(Effect.either);
        dispatched++;
        if (result._tag === "Left") {
          yield* store.run(
            "UPDATE customer_seed_operations SET status=? WHERE seed_id=? AND stage=? AND status='executing'",
            result.left.uncertain === false ? "failed" : "uncertain",
            row.id,
            stage,
          );
          return yield* Effect.fail(result.left);
        }
        yield* saveSeedProof(row, operation, result.right);
      }
      yield* publishCustomer(yield* seedRow(original.id));
    }
    return yield* customerSeedStatus(branchId);
  });
