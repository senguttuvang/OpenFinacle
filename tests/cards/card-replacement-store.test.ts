import { expect, test } from "bun:test";
import {
  actOnCardReplacement,
  cardReplacementDetail,
  cardReplacementForKey,
  listCardReplacements,
  submitCardReplacement,
} from "../../src/platform/cards/application/card-replacements";
import {
  cardDetail,
  cardForKey,
  changeCard,
  listCards,
} from "../../src/platform/cards/application/cards";
import { type ReplacementCommand } from "../../src/platform/cards/domain/card-replacements";
import { createHarness } from "./card-replacement-store.harness";

const harness = await createHarness();
test("independent issuance preserves the blocked source and distinct held card; ordered delivery enables activation and normal controls", async () => {
  const issued = await harness.issue();
  const id = issued.card?.id;
  if (!id) throw new Error("Expected issued card");
  expect(issued.source).toMatchObject({ status: "blocked", version: 1 });
  expect(issued.card).toMatchObject({
    status: "held",
    activation_required: true,
    replacement_id: "example-replacement",
    version: 0,
  });
  expect((await harness.run(listCards(harness.customer))).cards).toHaveLength(
    2,
  );
  expect(
    (await harness.run(cardDetail(harness.customer, harness.sourceId))).history,
  ).toHaveLength(2);
  expect(
    (await harness.run(cardDetail(harness.customer, id))).history,
  ).toHaveLength(1);
  expect(
    await harness.denied(
      changeCard(
        harness.customer,
        { id, version: 0, action: "resume", note: "Attempt early activation" },
        "early-resume-key",
      ),
    ),
  ).toMatchObject({ status: 403 });
  expect(() =>
    harness.db.run(
      "UPDATE replacement_cards SET activation_required=0 WHERE id=?",
      [id],
    ),
  ).toThrow("immutable command");
  await harness.act("dispatch", "officer");
  await harness.act("deliver", "officer");
  const active = await harness.act("activate", "customer");
  expect(active.card).toMatchObject({
    status: "active",
    activation_required: false,
    version: 1,
    settings: { atm: false, online: false },
  });
  expect(active.history).toHaveLength(6);
  const held = await harness.run(
    changeCard(
      harness.customer,
      { id, version: 1, action: "hold", note: "Synthetic temporary hold" },
      "new-card-hold-key",
    ),
  );
  expect(held.card.status).toBe("held");
  expect(
    (await harness.run(cardForKey(harness.customer, "new-card-hold-key"))).card
      .id,
  ).toBe(id);
  expect(
    await harness.denied(
      cardDetail({ ...harness.customer, bank_id: "other" }, id),
    ),
  ).toMatchObject({ status: 404 });
  expect(
    (
      await harness.run(
        changeCard(
          harness.customer,
          {
            id,
            version: 2,
            action: "resume",
            note: "Synthetic resume after hold",
          },
          "new-card-resume-key",
        ),
      )
    ).card.status,
  ).toBe("active");
  expect(
    (await harness.run(cardDetail(harness.customer, harness.sourceId))).actions,
  ).toEqual([]);
  expect(harness.db.query("SELECT COUNT(*) AS n FROM commands").get()).toEqual({
    n: 0,
  });
  const before = harness.db.serialize();
  await harness.run(listCards(harness.customer));
  await harness.detail();
  expect(harness.db.serialize()).toEqual(before);
});

test("issuance audit failure rolls back source block, new instrument, request projection, keys and histories", async () => {
  harness.submit();
  await harness.act("recommend", "officer");
  harness.db.exec(
    "CREATE TRIGGER fail_issue_audit BEFORE INSERT ON audit WHEN NEW.action='card-replacement.issue' BEGIN SELECT RAISE(ABORT,'Injected issue audit failure'); END",
  );
  await expect(harness.act("issue", "approver")).rejects.toThrow(
    "Injected issue audit failure",
  );
  expect((await harness.detail()).replacement).toMatchObject({
    status: "recommended",
    version: 1,
    card_id: null,
  });
  expect(
    (await harness.run(cardDetail(harness.customer, harness.sourceId))).card,
  ).toMatchObject({
    status: "active",
    version: 0,
  });
  expect((await harness.run(listCards(harness.customer))).cards).toHaveLength(
    1,
  );
  expect(
    harness.db
      .query(
        "SELECT COUNT(*) AS n FROM card_replacement_events WHERE action='issue'",
      )
      .get(),
  ).toEqual({ n: 0 });
  harness.db.exec("DROP TRIGGER fail_issue_audit");
  const issued = await harness.act("issue", "approver");
  expect(issued.replacement.status).toBe("issued");
  expect(() => harness.submit("second-source-request")).toThrow(
    "duplicate replacement submission",
  );
  expect((await harness.run(listCards(harness.customer))).cards).toHaveLength(
    2,
  );
});

test("concurrent source changes abort issuance before side effects and activation audit failure leaves the delivered card held", async () => {
  harness.submit();
  await harness.act("recommend", "officer");
  await expect(
    harness.act("issue", "approver", "example-replacement", () =>
      harness.run(
        changeCard(
          harness.customer,
          {
            id: harness.sourceId,
            version: 0,
            action: "hold",
            note: "Concurrent source security hold",
          },
          "concurrent-source-key",
        ),
      ),
    ),
  ).rejects.toThrow("Source card changed");
  expect((await harness.detail()).replacement).toMatchObject({
    status: "recommended",
    version: 1,
  });
  expect((await harness.run(listCards(harness.customer))).cards).toHaveLength(
    1,
  );
  const issued = await harness.act("issue", "approver");
  expect(issued.source).toMatchObject({ status: "blocked", version: 2 });
  await harness.act("dispatch", "officer");
  await harness.act("deliver", "officer");
  harness.db.exec(
    "CREATE TRIGGER fail_activation_audit BEFORE INSERT ON audit WHEN NEW.action='card-replacement.activate' BEGIN SELECT RAISE(ABORT,'Injected activation failure'); END",
  );
  await expect(harness.act("activate", "customer")).rejects.toThrow(
    "Injected activation failure",
  );
  expect((await harness.detail()).replacement).toMatchObject({
    status: "delivered",
    version: 4,
  });
  expect((await harness.detail()).card).toMatchObject({
    status: "held",
    activation_required: true,
    version: 0,
  });
  harness.db.exec("DROP TRIGGER fail_activation_audit");
  expect((await harness.act("activate", "customer")).card?.status).toBe(
    "active",
  );
});

test("protectively blocked replacements cannot activate and may have exactly one later successor with immutable histories", async () => {
  const issued = await harness.issue();
  const id = issued.card?.id;
  if (!id) throw new Error("Expected issued card");
  await harness.run(
    changeCard(
      harness.customer,
      {
        id,
        version: 0,
        action: "block",
        note: "Synthetic replacement reported lost",
      },
      "new-card-block-key",
    ),
  );
  await harness.act("dispatch", "officer");
  await harness.act("deliver", "officer");
  expect((await harness.detail()).actions).toEqual([]);
  await expect(harness.act("activate", "customer")).rejects.toThrow(
    "not permitted",
  );
  harness.submit("next-generation", {
    ...harness.terms,
    source_card_id: id,
    source_version: 1,
    reason: "lost",
  });
  await harness.act("recommend", "officer", "next-generation");
  const next = await harness.act("issue", "approver", "next-generation");
  expect(next.card?.id).not.toBe(id);
  expect((await harness.run(listCards(harness.customer))).cards).toHaveLength(
    3,
  );
  expect(
    (await harness.run(cardDetail(harness.customer, id))).card.status,
  ).toBe("blocked");
  expect(() => harness.db.run("DELETE FROM card_replacement_events")).toThrow(
    "immutable",
  );
  expect(() => harness.db.run("DELETE FROM replacement_cards")).toThrow(
    "immutable",
  );
  expect(() =>
    harness.db.run(
      "UPDATE card_replacements SET terms='{}' WHERE id='example-replacement'",
    ),
  ).toThrow("immutable command");
});

test("card references reconcile across both stores and SQL refuses a conflicting legacy command key", async () => {
  await harness.run(
    changeCard(
      harness.customer,
      {
        id: harness.sourceId,
        version: 0,
        action: "hold",
        note: "Initial synthetic source hold",
      },
      "shared-card-command-key",
    ),
  );
  harness.submit("cross-key-request", { ...harness.terms, source_version: 1 });
  await harness.act("recommend", "officer", "cross-key-request");
  const issued = await harness.act("issue", "approver", "cross-key-request");
  const id = issued.card?.id;
  if (!id) throw new Error("Expected issued card");
  expect(
    (await harness.run(cardForKey(harness.customer, "shared-card-command-key")))
      .card.id,
  ).toBe(harness.sourceId);
  expect(
    await harness.denied(
      changeCard(
        harness.customer,
        {
          id,
          version: 0,
          action: "block",
          note: "Conflicting synthetic block",
        },
        "shared-card-command-key",
      ),
    ),
  ).toMatchObject({ status: 409 });
  expect(() =>
    harness.db.run(
      "INSERT INTO replacement_card_events(id,bank_id,card_id,command_key,command_payload,actor,action,note,status,settings,version,created_at) SELECT 'collision',bank_id,id,'shared-card-command-key','{}','customer','block','Conflicting synthetic SQL block','blocked',settings,version+1,? FROM replacement_cards WHERE id=?",
      [harness.timestamp, id],
    ),
  ).toThrow("reference conflict");
  expect(
    (await harness.run(cardDetail(harness.customer, id))).card,
  ).toMatchObject({
    status: "held",
    version: 0,
  });
});

test("application commands share owned current state and replay original inputs after source retirement", async () => {
  expect(
    (await harness.run(listCardReplacements(harness.customer))).replacements,
  ).toEqual([]);
  const officer = { ...harness.customer, role: "officer" as const };
  const approver = { ...harness.customer, role: "approver" as const };
  const submitted = await harness.run(
    submitCardReplacement(harness.customer, harness.terms, "app-submit-key"),
  );
  const id = submitted.replacement.id;
  const input = (
    action: ReplacementCommand["action"],
    version: number,
  ): ReplacementCommand => ({
    id,
    version,
    action,
    note: "Reviewed synthetic command",
    ...(action === "issue" ? { source_version: 0 } : {}),
    ...(action === "activate" ? { card_version: 0 } : {}),
  });
  expect(
    await harness.denied(
      submitCardReplacement(
        harness.customer,
        harness.terms,
        "duplicate-source-key",
      ),
    ),
  ).toMatchObject({ status: 409 });
  expect(
    await harness.denied(
      cardReplacementDetail({ ...harness.customer, bank_id: "other" }, id),
    ),
  ).toMatchObject({ status: 404 });
  await harness.run(
    actOnCardReplacement(officer, input("recommend", 0), "app-recommend-key"),
  );
  expect(
    await harness.denied(
      actOnCardReplacement(officer, input("issue", 1), "self-issue-key"),
    ),
  ).toMatchObject({ status: 403 });
  const issued = await harness.run(
    actOnCardReplacement(approver, input("issue", 1), "app-issue-key"),
  );
  expect(issued.card).toMatchObject({
    status: "held",
    activation_required: true,
  });
  expect(
    (
      await harness.run(
        submitCardReplacement(
          harness.customer,
          { ...harness.terms, address: ` ${harness.terms.address} ` },
          "app-submit-key",
        ),
      )
    ).replacement.id,
  ).toBe(id);
  expect(
    (
      await harness.run(
        actOnCardReplacement(approver, input("issue", 1), "app-issue-key"),
      )
    ).replacement.version,
  ).toBe(2);
  expect(
    await harness.denied(
      actOnCardReplacement(
        approver,
        { ...input("issue", 1), note: "Different original payload" },
        "app-issue-key",
      ),
    ),
  ).toMatchObject({ status: 409 });
  expect(
    await harness.denied(
      cardReplacementForKey(
        { ...harness.customer, bank_id: "other" },
        "app-issue-key",
      ),
    ),
  ).toMatchObject({ status: 404 });
  await harness.run(
    actOnCardReplacement(officer, input("dispatch", 2), "app-dispatch-key"),
  );
  await harness.run(
    actOnCardReplacement(officer, input("deliver", 3), "app-deliver-key"),
  );
  const active = await harness.run(
    actOnCardReplacement(
      harness.customer,
      input("activate", 4),
      "app-activate-key",
    ),
  );
  expect(active).toMatchObject({
    replacement: { status: "activated", version: 5 },
    source: { status: "blocked" },
    card: { status: "active", activation_required: false },
  });
  expect(active.history).toHaveLength(6);
  expect(
    (
      await harness.run(
        cardReplacementForKey(harness.customer, "app-submit-key"),
      )
    ).confirmed_key,
  ).toBe("app-submit-key");
  expect((await harness.run(cardReplacementDetail(officer, id))).card).toEqual(
    active.card,
  );
  expect(harness.db.query("SELECT COUNT(*) AS n FROM commands").get()).toEqual({
    n: 0,
  });
});

test("a lost store acknowledgement reconciles once while a pre-write failure leaves no request or key", async () => {
  harness.writeFailure = "before";
  expect(
    await harness.denied(
      submitCardReplacement(
        harness.customer,
        harness.terms,
        "failed-write-key",
      ),
    ),
  ).toMatchObject({ status: 503 });
  expect(
    await harness.denied(
      cardReplacementForKey(harness.customer, "failed-write-key"),
    ),
  ).toMatchObject({ status: 404 });
  expect(
    (await harness.run(listCardReplacements(harness.customer))).replacements,
  ).toEqual([]);
  harness.writeFailure = "after";
  const saved = await harness.run(
    submitCardReplacement(harness.customer, harness.terms, "lost-ack-key"),
  );
  expect(saved.confirmed_key).toBe("lost-ack-key");
  expect(saved.history).toHaveLength(1);
  expect(
    (await harness.run(listCardReplacements(harness.customer))).replacements,
  ).toHaveLength(1);
  expect(
    (
      await harness.run(
        submitCardReplacement(harness.customer, harness.terms, "lost-ack-key"),
      )
    ).replacement.id,
  ).toBe(saved.replacement.id);
  expect(
    harness.db.query("SELECT COUNT(*) AS n FROM card_replacement_events").get(),
  ).toEqual({ n: 1 });
});
