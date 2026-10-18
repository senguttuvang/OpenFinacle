import { Effect, Schema } from "effect";
import { BankingError } from "../domain/banking";
import { PayeeAdminCommand } from "../domain/customer-payees";
import { Store } from "../domain/ports";

const idsSchema = Schema.parseJson(Schema.Array(Schema.String));
const fail = (message: string) =>
  Effect.fail(new BankingError({ message, status: 409, uncertain: false }));
const decodeIds = (value: string) =>
  Schema.decodeUnknown(idsSchema)(value).pipe(
    Effect.mapError(
      () =>
        new BankingError({
          message:
            "Original payee roster is unreadable; no replacement was created.",
          status: 409,
        }),
    ),
  );

export const runPayeeAdmin = (input: typeof PayeeAdminCommand.Type) =>
  Effect.gen(function* () {
    // Public service validates bounds as well as its HTTP/CLI callers.
    yield* Schema.decodeUnknown(PayeeAdminCommand)(input).pipe(
      Effect.mapError(
        () =>
          new BankingError({
            message:
              "Use a bounded payee owner range (start 1-150, limit 1-10).",
            status: 400,
          }),
      ),
    );
    const store = yield* Store;
    let membershipsAdded = 0;
    let ownersCompleted = 0;
    const branch = yield* store.one<{ id: string }>(
      "SELECT id FROM banks WHERE id=? AND status='ready'",
      input.branchId,
    );
    if (!branch) return yield* fail("Select the original ready branch.");
    let roster = yield* store.one<{ customer_ids: string }>(
      "SELECT customer_ids FROM customer_payee_seed_rosters WHERE branch_id=?",
      input.branchId,
    );
    if (input.action === "prepare") {
      if (!roster) {
        const eligible = yield* store.all<{ id: string }>(
          "SELECT id FROM customers WHERE branch_id=? AND status='active' ORDER BY reference,id LIMIT 151",
          input.branchId,
        );
        if (eligible.length < 6 || eligible.length > 150)
          return yield* fail(
            "Payee setup requires 6-150 existing branch customers. No accounts are created by this command.",
          );
        yield* store.run(
          "INSERT INTO customer_payee_seed_rosters(branch_id,customer_ids) VALUES(?,?) ON CONFLICT(branch_id) DO NOTHING",
          input.branchId,
          JSON.stringify(eligible.map((row) => row.id)),
        );
        roster = yield* store.one<{ customer_ids: string }>(
          "SELECT customer_ids FROM customer_payee_seed_rosters WHERE branch_id=?",
          input.branchId,
        );
      }
      if (!roster)
        return yield* fail("Original payee roster could not be retained.");
      const ids = yield* decodeIds(roster.customer_ids);
      for (const [index, owner] of ids.entries()) {
        const count = Math.min(5 + (index % 11), ids.length - 1);
        const recipients = Array.from(
          { length: count },
          (_, offset) => ids[(index + offset + 1) % ids.length],
        );
        yield* store.run(
          "INSERT INTO customer_payee_seed_owners(owner_id,branch_id,ordinal,recipient_ids,status) VALUES(?,?,?,?,'planned') ON CONFLICT(owner_id) DO NOTHING",
          owner,
          input.branchId,
          index + 1,
          JSON.stringify(recipients),
        );
      }
    }
    if (input.action === "resume") {
      if (!roster)
        return yield* fail("Prepare the original payee roster first.");
      const frozenIds = yield* decodeIds(roster.customer_ids);
      const planned = yield* store.one<{ count: number }>(
        "SELECT count(*) AS count FROM customer_payee_seed_owners WHERE branch_id=?",
        input.branchId,
      );
      if (planned?.count !== frozenIds.length)
        return yield* fail(
          "Payee preparation is incomplete. Repeat prepare to retain all original frozen owners before resume.",
        );
      const plans = yield* store.all<{
        owner_id: string;
        recipient_ids: string;
      }>(
        "SELECT owner_id,recipient_ids FROM customer_payee_seed_owners WHERE branch_id=? AND ordinal>=? AND ordinal<? AND status='planned' ORDER BY ordinal",
        input.branchId,
        input.start,
        input.start + input.limit,
      );
      for (const plan of plans) {
        const recipients = yield* decodeIds(plan.recipient_ids);
        const owner = yield* store.one(
          "SELECT id FROM customers WHERE id=? AND status='active' AND branch_id=?",
          plan.owner_id,
          input.branchId,
        );
        const invalid = yield* store.one<{ count: number }>(
          "SELECT count(*) AS count FROM json_each(?) j WHERE NOT EXISTS(SELECT 1 FROM customer_payees p WHERE p.owner_id=? AND p.recipient_id=j.value AND p.status='removed') AND NOT EXISTS(SELECT 1 FROM customers r WHERE r.id=j.value AND r.status='active' AND r.branch_id=? AND r.id<>?)",
          plan.recipient_ids,
          plan.owner_id,
          input.branchId,
          plan.owner_id,
        );
        if (!owner || invalid?.count !== 0)
          return yield* fail(
            `Payee owner ${plan.owner_id} has an inactive or invalid original recipient. Inspect this saved plan; it remains incomplete.`,
          );
        for (const recipient of recipients) {
          // One atomic statement: preserve all existing membership and removal tombstones.
          membershipsAdded += yield* store.run(
            "INSERT INTO customer_payees(id,owner_id,recipient_id,status) SELECT ?,?,?,'active' WHERE NOT EXISTS(SELECT 1 FROM customer_payees WHERE owner_id=? AND recipient_id=?) AND (SELECT count(*) FROM customer_payees WHERE owner_id=? AND status='active')<? AND EXISTS(SELECT 1 FROM customers s JOIN customers r ON r.branch_id=s.branch_id WHERE s.id=? AND r.id=? AND s.status='active' AND r.status='active') ON CONFLICT(owner_id,recipient_id) DO NOTHING",
            crypto.randomUUID(),
            plan.owner_id,
            recipient,
            plan.owner_id,
            recipient,
            plan.owner_id,
            recipients.length,
            plan.owner_id,
            recipient,
          );
        }
        ownersCompleted += yield* store.run(
          "UPDATE customer_payee_seed_owners SET status='complete' WHERE owner_id=? AND status='planned'",
          plan.owner_id,
        );
      }
    }
    const counts = yield* store.one<{
      owners: number;
      complete: number;
      min_active: number | null;
      max_active: number | null;
    }>(
      "SELECT count(*) AS owners,coalesce(sum(status='complete'),0) AS complete,min(active_count) AS min_active,max(active_count) AS max_active FROM (SELECT m.status,(SELECT count(*) FROM customer_payees p JOIN customers r ON r.id=p.recipient_id WHERE p.owner_id=m.owner_id AND p.status='active' AND r.status='active') AS active_count FROM customer_payee_seed_owners m WHERE m.branch_id=?)",
      input.branchId,
    );
    const frozenOwners = roster
      ? (yield* decodeIds(roster.customer_ids)).length
      : 0;
    const summary = {
      ...counts,
      frozen_owners: frozenOwners,
      preparation_complete: Boolean(roster && counts?.owners === frozenOwners),
      setup_complete: Boolean(
        roster &&
          counts?.owners === frozenOwners &&
          counts?.complete === frozenOwners,
      ),
    };
    const owners = yield* store.all<{
      owner_id: string;
      ordinal: number;
      status: string;
      active_count: number;
      removed_count: number;
    }>(
      "SELECT m.owner_id,m.ordinal,m.status,(SELECT count(*) FROM customer_payees p WHERE p.owner_id=m.owner_id AND p.status='active') AS active_count,(SELECT count(*) FROM customer_payees p WHERE p.owner_id=m.owner_id AND p.status='removed') AS removed_count FROM customer_payee_seed_owners m WHERE branch_id=? AND ordinal>=? AND ordinal<? ORDER BY ordinal",
      input.branchId,
      input.start,
      input.start + input.limit,
    );
    return {
      branch_id: input.branchId,
      frozen: roster !== null,
      summary,
      progress: { membershipsAdded, ownersCompleted },
      owners,
    };
  });
