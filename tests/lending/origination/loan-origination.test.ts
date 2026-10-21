import { expect, test } from "bun:test";
import { financialView } from "../../../src/platform/banking-workspace/application/financial-view";
import { BankingError } from "../../../src/platform/banking-workspace/domain/banking";
import {
  actOnLoan,
  createLoanQuote,
  inspectOriginalLoan,
  refreshLoanCoreView,
  submitLoanApplication,
} from "../../../src/platform/lending/application/loan-origination";
import {
  listLoanApplications,
  savedLoanDetail,
  savedLoanForKey,
} from "../../../src/platform/lending/application/loan-records";
import { savedLoanStatement } from "../../../src/platform/lending/application/loan-statements";
import { inventedLoanStatement } from "../../fixtures/loan-statement";
import { workflowQuote } from "../../fixtures/loan-workflow";
import { createHarness } from "./loan-origination.harness";

const harness = createHarness();
test("customer acceptance and independent Core stages persist one owned loan and expose saved Core holdings without entry reads", async () => {
  const submitted = await harness.apply();
  expect(submitted.loan).toMatchObject({
    status: "submitted",
    origin: "admin-pilot",
    version: 0,
  });
  expect(harness.dispatches).toHaveLength(0);
  const recommended = await harness.act(
    submitted,
    "recommend",
    harness.officer,
  );
  expect(recommended.loan.maker).toBe("officer");
  const registered = await harness.act(
    recommended,
    "register",
    harness.approver,
  );
  expect(registered.loan).toMatchObject({
    status: "registered",
    core_id: 71,
    checker: "approver",
  });
  const sanctioned = await harness.act(registered, "approve", harness.approver);
  expect(sanctioned.loan.status).toBe("approved");
  const active = await harness.act(sanctioned, "disburse", harness.approver);
  expect(active.loan).toMatchObject({ status: "active", version: 7 });
  expect(active.core).toMatchObject({
    source: "fineract",
    snapshot: { id: 71, status: "active", principal_minor: 1200000 },
    stale: false,
  });
  expect(active.financial_view_stale).toBe(false);
  expect(harness.balanceMinor).toBe(1700000);
  expect(active.history).toHaveLength(8);
  expect(harness.dispatches.map((i) => i.action)).toEqual([
    "register",
    "approve",
    "disburse",
  ]);
  const oldReads = harness.coreReads.length;
  const oldCatalogue = harness.catalogueReads;
  const oldCalculations = harness.calculations;
  for (const role of [harness.customer, harness.officer, harness.approver]) {
    expect(
      (await harness.run(savedLoanDetail(role, active.loan.id))).loan.status,
    ).toBe("active");
    expect((await harness.run(listLoanApplications(role))).loans).toHaveLength(
      1,
    );
  }
  expect(harness.coreReads.length).toBe(oldReads);
  expect(harness.catalogueReads).toBe(oldCatalogue);
  expect(harness.calculations).toBe(oldCalculations);
  harness.time += 300001;
  expect(
    (await harness.run(savedLoanDetail(harness.customer, active.loan.id))).core
      ?.stale,
  ).toBe(true);
  expect(harness.coreReads.length).toBe(oldReads);
});

test("keys bind original actor/payload and replay saved outcomes without dispatch even after expiry", async () => {
  const recommended = await harness.recommend();
  const key = crypto.randomUUID();
  const request = {
    id: recommended.loan.id,
    version: recommended.loan.version,
    action: "register",
    note: "Independent invented registration",
  };
  const first = await harness.run(actOnLoan(harness.approver, request, key));
  harness.time += 900000;
  const replay = await harness.run(actOnLoan(harness.approver, request, key));
  expect(replay.loan.id).toBe(first.loan.id);
  expect(harness.dispatches).toHaveLength(1);
  expect(
    (
      await harness.denied(
        actOnLoan(
          harness.approver,
          { ...request, note: "Changed original" },
          key,
        ),
      )
    ).status,
  ).toBe(409);
  expect(
    (await harness.denied(actOnLoan(harness.officer, request, key))).status,
  ).toBe(409);
  expect(
    (await harness.run(savedLoanForKey(harness.customer, key))).recorded_actor,
  ).toBe("approver");
  expect(harness.dispatches).toHaveLength(1);
});

test("quote acceptance is explicit, owned, affordable and unique, with invalid roles/fields/version rejected before Core", async () => {
  const preview = await harness.run(
    createLoanQuote(harness.customer, workflowQuote.terms),
  );
  expect(
    (
      await harness.denied(
        createLoanQuote(harness.officer, workflowQuote.terms),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await harness.denied(
        submitLoanApplication(
          { ...harness.customer, bank_id: "other-bank" },
          { quote_id: preview.quote.id, consent: true },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await harness.denied(
        submitLoanApplication(
          harness.customer,
          { quote_id: preview.quote.id, consent: false },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(400);
  const input = { quote_id: preview.quote.id, consent: true };
  const key = crypto.randomUUID();
  const [one, two] = await Promise.all([
    harness.run(submitLoanApplication(harness.customer, input, key)),
    harness.run(submitLoanApplication(harness.customer, input, key)),
  ]);
  expect(one.loan.id).toBe(two.loan.id);
  expect(
    (
      await harness.denied(
        submitLoanApplication(harness.customer, input, crypto.randomUUID()),
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await harness.denied(
        actOnLoan(
          harness.officer,
          {
            id: one.loan.id,
            version: 99,
            action: "recommend",
            note: "Invented assessment",
          },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await harness.denied(
        actOnLoan(
          harness.approver,
          {
            id: one.loan.id,
            version: 0,
            action: "recommend",
            note: "Invented assessment",
          },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await harness.denied(
        actOnLoan(
          harness.officer,
          {
            id: one.loan.id,
            version: 0,
            action: "recommend",
            note: "Invented assessment",
            core_id: 71,
          },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(400);
  expect(harness.dispatches).toHaveLength(0);
  expect(
    (
      await harness.denied(
        savedLoanDetail(
          { ...harness.customer, bank_id: "other-bank" },
          one.loan.id,
        ),
      )
    ).status,
  ).toBe(404);
});

for (const when of ["before", "after"] as const)
  test(`lost ${when}-commit reservation acknowledgement never reaches Core and preserves any recorded original`, async () => {
    const detail = await harness.recommend();
    harness.failStore = { phase: "reservation", when };
    const key = crypto.randomUUID();
    const error = await harness.denied(
      actOnLoan(
        harness.approver,
        {
          id: detail.loan.id,
          version: detail.loan.version,
          action: "register",
          note: "Invented registration",
        },
        key,
      ),
    );
    expect(error.uncertain).toBe(true);
    expect(harness.dispatches).toHaveLength(0);
    harness.failStore = undefined;
    const found = await harness.run(listLoanApplications(harness.customer));
    expect(found.loans).toHaveLength(1);
    if (when === "after") {
      const original = await harness.run(
        savedLoanForKey(harness.approver, key),
      );
      expect(original.operation?.status).toBe("executing");
      const inspected = await harness.run(
        inspectOriginalLoan(harness.approver, detail.loan.id),
      );
      expect(inspected.operation?.status).toBe("uncertain");
      expect(inspected.actions).toEqual([]);
      expect(harness.dispatches).toHaveLength(0);
    } else
      expect(
        (await harness.denied(savedLoanForKey(harness.customer, key))).status,
      ).toBe(404);
  });

for (const when of ["before", "after"] as const)
  test(`lost ${when}-commit outcome acknowledgement preserves one Core effect and recovers read-only`, async () => {
    const detail = await harness.recommend();
    harness.failStore = { phase: "outcome", when };
    const key = crypto.randomUUID();
    const request = {
      id: detail.loan.id,
      version: detail.loan.version,
      action: "register",
      note: "Invented registration",
    };
    expect(
      (await harness.denied(actOnLoan(harness.approver, request, key)))
        .uncertain,
    ).toBe(true);
    expect(harness.dispatches).toHaveLength(1);
    harness.failStore = undefined;
    const recovered = await harness.run(
      inspectOriginalLoan(harness.approver, detail.loan.id),
    );
    expect(recovered.loan.status).toBe("registered");
    expect(
      (await harness.run(actOnLoan(harness.approver, request, key))).loan
        .status,
    ).toBe("registered");
    expect(harness.dispatches).toHaveLength(1);
    expect(harness.confirmations).toHaveLength(when === "before" ? 1 : 0);
  });

test("an invisible delayed disbursement remains locked across reads, then one original proof confirms posting and refreshes balances", async () => {
  const detail = await harness.approved();
  harness.writerFailure = new BankingError({
    message: "Original command processing",
    status: 503,
    uncertain: true,
  });
  const pending = await harness.act(detail, "disburse", harness.approver);
  expect(pending.operation?.status).toBe("uncertain");
  expect(pending.financial_view_stale).toBe(true);
  const original = harness.dispatches.at(-1);
  if (!original) throw new Error("Missing original dispatch");
  const inspection = await harness.run(
    inspectOriginalLoan(harness.approver, detail.loan.id),
  );
  expect(inspection.operation?.status).toBe("uncertain");
  expect(inspection.inspection_checks).toEqual(["core-read"]);
  expect(inspection.history).toEqual(pending.history);
  expect(inspection.financial_view_stale).toBe(true);
  expect(JSON.stringify(inspection)).not.toContain(
    "invented-private-diagnostic-marker",
  );
  expect(
    (
      await harness.denied(
        inspectOriginalLoan(harness.customer, detail.loan.id),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await harness.denied(
        actOnLoan(
          harness.approver,
          {
            id: detail.loan.id,
            version: pending.loan.version,
            action: "disburse",
            note: "New unsafe attempt",
          },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(403);
  await harness.run(financialView(harness.bank(), true));
  expect(
    (await harness.run(savedLoanDetail(harness.customer, detail.loan.id)))
      .financial_view_stale,
  ).toBe(true);
  harness.saveCore(original);
  harness.time += 1000;
  harness.writerFailure = undefined;
  const confirmed = await harness.run(
    inspectOriginalLoan(harness.approver, detail.loan.id),
  );
  expect(confirmed.loan.status).toBe("active");
  expect(confirmed.financial_view_stale).toBe(false);
  expect(harness.balanceMinor).toBe(1700000);
  expect(
    harness.dispatches.filter((i) => i.action === "disburse"),
  ).toHaveLength(1);
});

test("confirmed posting and failed balance synchronization remain separate and saved Core refresh never changes workflow", async () => {
  const detail = await harness.approved();
  harness.failCoreReads = true;
  const active = await harness.act(detail, "disburse", harness.approver);
  expect(active.core?.snapshot.statement).toBeUndefined();
  expect(
    (await harness.denied(savedLoanStatement(harness.customer, active.loan.id)))
      .status,
  ).toBe(409);
  expect(active.loan.status).toBe("active");
  expect(active.financial_view_stale).toBe(true);
  expect(
    (await harness.run(refreshLoanCoreView(harness.customer, active.loan.id)))
      .core?.stale,
  ).toBe(true);
  harness.failCoreReads = false;
  const holding = harness.coreState.get(`of-loan-${active.loan.id}`);
  if (!holding) throw new Error("Missing invented active holding");
  harness.coreState.set(`of-loan-${active.loan.id}`, {
    ...holding,
    loan: {
      ...holding.loan,
      statement: inventedLoanStatement(holding.loan),
    },
  });
  harness.time += 1000;
  const fresh = await harness.run(
    refreshLoanCoreView(harness.customer, active.loan.id),
  );
  expect(fresh.loan.version).toBe(active.loan.version);
  expect(fresh.core?.stale).toBe(false);
  expect(fresh.core?.snapshot.statement?.transactions).toHaveLength(1);
  expect(harness.coreReads).toContain("owned-loan-statement");
  const reads = harness.coreReads.length;
  const file = await harness.run(
    savedLoanStatement(harness.customer, active.loan.id),
  );
  expect(fresh.loan.core_id).toBe(file.core_id);
  expect(file.csv).toContain('"Disbursement"');
  expect(file.csv).toContain('"Total repaid","0.00"');
  expect(harness.coreReads).toHaveLength(reads);
  harness.time += 300001;
  expect(
    (await harness.run(savedLoanStatement(harness.approver, active.loan.id)))
      .csv,
  ).toContain('"Stale saved observation"');
  expect(harness.coreReads).toHaveLength(reads);
  expect(
    (
      await harness.denied(
        savedLoanStatement(
          { ...harness.customer, bank_id: "another-bank" },
          active.loan.id,
        ),
      )
    ).status,
  ).toBe(404);
  harness.failCoreReads = true;
  const retained = await harness.run(
    refreshLoanCoreView(harness.customer, active.loan.id),
  );
  expect(retained.core?.stale).toBe(true);
  expect(retained.core?.snapshot.statement?.transactions).toHaveLength(1);
  harness.failCoreReads = false;
  await harness.run(financialView(harness.bank(), true));
  expect(
    (await harness.run(savedLoanDetail(harness.customer, active.loan.id)))
      .financial_view_stale,
  ).toBe(false);
  expect(
    harness.dispatches.filter((i) => i.action === "disburse"),
  ).toHaveLength(1);
});
