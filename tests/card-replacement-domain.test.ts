import { expect, test } from "bun:test";
import { Effect, Schema } from "effect";
import type { BankingError } from "../src/domain/banking";
import {
  type Replacement,
  ReplacementCommand,
  ReplacementDetail,
  ReplacementEvent,
  ReplacementTerms,
  replacementActions,
  replacementCard,
  replacementTerms,
  replacementTransition,
} from "../src/domain/card-replacements";
import { allowedCardActions, type Card } from "../src/domain/cards";

const timestamp = "2026-10-17T09:00:00Z";
const source: Card = {
  id: "demo-debit:synthetic",
  bank_id: "synthetic",
  suffix: "4242",
  status: "active",
  version: 4,
  updated_at: timestamp,
  settings: {
    atm: true,
    pos: true,
    online: true,
    contactless: true,
    international: true,
    daily_limit: 80000,
  },
};
const terms: ReplacementTerms = {
  source_card_id: source.id,
  source_version: 4,
  reason: "damaged",
  address: "12 Example Lane, Example Town 600001",
};
const request: Replacement = {
  id: "example-replacement",
  bank_id: source.bank_id,
  terms,
  status: "submitted",
  version: 0,
  maker: null,
  checker: null,
  card_id: null,
  created_at: timestamp,
  updated_at: timestamp,
};
const detail = (
  overrides: Partial<Replacement> = {},
  card: Card | null = null,
): ReplacementDetail => ({
  replacement: { ...request, ...overrides },
  source,
  card,
  history: [],
  actions: [],
  confirmed_key: null,
});
const command = (
  action: ReplacementCommand["action"],
  version = 0,
): ReplacementCommand => ({
  id: request.id,
  version,
  action,
  note: "Reviewed synthetic instruction",
  ...(action === "issue" ? { source_version: source.version } : {}),
  ...(action === "activate" ? { card_version: 0 } : {}),
});
const denied = <A>(task: Effect.Effect<A, BankingError>) =>
  Effect.runPromise(Effect.flip(task));

test("replacement terms require the customer, current owned source and explicit lost-card pre-block", async () => {
  expect(
    await Effect.runPromise(
      replacementTerms(
        { ...terms, address: `  ${terms.address}  ` },
        source,
        "customer",
      ),
    ),
  ).toEqual(terms);
  expect(
    await denied(replacementTerms(terms, source, "officer")),
  ).toMatchObject({ status: 403 });
  expect(
    await denied(
      replacementTerms(
        { ...terms, source_card_id: "other" },
        source,
        "customer",
      ),
    ),
  ).toMatchObject({ status: 404 });
  expect(
    await denied(
      replacementTerms({ ...terms, source_version: 3 }, source, "customer"),
    ),
  ).toMatchObject({ status: 409 });
  expect(
    await denied(
      replacementTerms({ ...terms, reason: "lost" }, source, "customer"),
    ),
  ).toMatchObject({ status: 409 });
  expect(
    await Effect.runPromise(
      replacementTerms(
        { ...terms, reason: "lost" },
        { ...source, status: "blocked" },
        "customer",
      ),
    ),
  ).toMatchObject({ reason: "lost" });
  expect(
    await denied(
      replacementTerms(
        { ...terms, address: "           " },
        source,
        "customer",
      ),
    ),
  ).toMatchObject({ status: 400 });
});

test("independent issuance creates a distinct held instrument with safe controls; delivery precedes customer activation", async () => {
  const recommended = await Effect.runPromise(
    replacementTransition(detail(), "officer", command("recommend"), timestamp),
  );
  expect(recommended).toMatchObject({
    status: "recommended",
    maker: "officer",
    checker: null,
    card: null,
    block_source: false,
  });
  const awaiting = detail({
    status: "recommended",
    maker: "officer",
    version: 1,
  });
  expect(
    await denied(
      replacementTransition(
        awaiting,
        "officer",
        command("issue", 1),
        timestamp,
      ),
    ),
  ).toMatchObject({ status: 403 });
  const issued = await Effect.runPromise(
    replacementTransition(awaiting, "approver", command("issue", 1), timestamp),
  );
  expect(issued).toMatchObject({
    status: "issued",
    checker: "approver",
    block_source: true,
  });
  expect(issued.card).toMatchObject({
    id: `replacement:${request.id}`,
    bank_id: source.bank_id,
    status: "held",
    version: 0,
    settings: {
      atm: false,
      pos: false,
      online: false,
      contactless: false,
      international: false,
      daily_limit: 25000,
    },
  });
  expect(issued.card?.id).not.toBe(source.id);
  if (!issued.card) throw new Error("Expected the newly issued product");
  expect(replacementCard(request, timestamp)).toEqual(issued.card);
  const pending = detail(
    {
      status: "issued",
      maker: "officer",
      checker: "approver",
      card_id: issued.card.id,
      version: 2,
    },
    issued.card,
  );
  expect(
    replacementActions(pending.replacement, pending.card, "customer"),
  ).toEqual([]);
  expect(
    await denied(
      replacementTransition(
        pending,
        "customer",
        command("activate", 2),
        timestamp,
      ),
    ),
  ).toMatchObject({ status: 403 });
  expect(
    (
      await Effect.runPromise(
        replacementTransition(
          pending,
          "officer",
          command("dispatch", 2),
          timestamp,
        ),
      )
    ).status,
  ).toBe("dispatched");
  const dispatched = {
    ...pending,
    replacement: {
      ...pending.replacement,
      status: "dispatched" as const,
      version: 3,
    },
  };
  expect(
    (
      await Effect.runPromise(
        replacementTransition(
          dispatched,
          "officer",
          command("deliver", 3),
          timestamp,
        ),
      )
    ).status,
  ).toBe("delivered");
  const delivered = {
    ...pending,
    replacement: {
      ...pending.replacement,
      status: "delivered" as const,
      version: 4,
    },
  };
  expect(
    replacementActions(delivered.replacement, delivered.card, "officer"),
  ).toEqual([]);
  const activated = await Effect.runPromise(
    replacementTransition(
      delivered,
      "customer",
      command("activate", 4),
      timestamp,
    ),
  );
  expect(activated).toMatchObject({
    status: "activated",
    block_source: false,
    card: {
      status: "active",
      version: 1,
      settings: { atm: false, online: false },
    },
  });
  expect(
    allowedCardActions({ ...source, status: "blocked" }, "customer"),
  ).toEqual([]);
});

test("reviewed request/source/card versions and relationship identities cannot be bypassed", async () => {
  const awaiting = detail({
    status: "recommended",
    maker: "officer",
    version: 1,
  });
  expect(
    await denied(
      replacementTransition(
        awaiting,
        "approver",
        command("issue", 0),
        timestamp,
      ),
    ),
  ).toMatchObject({ status: 409 });
  expect(
    await denied(
      replacementTransition(
        awaiting,
        "approver",
        { ...command("issue", 1), source_version: 3 },
        timestamp,
      ),
    ),
  ).toMatchObject({ status: 409 });
  expect(
    await denied(
      replacementTransition(
        awaiting,
        "approver",
        { ...command("issue", 1), source_version: undefined },
        timestamp,
      ),
    ),
  ).toMatchObject({ status: 400 });
  expect(
    await denied(
      replacementTransition(
        awaiting,
        "approver",
        { ...command("issue", 1), card_version: 0 },
        timestamp,
      ),
    ),
  ).toMatchObject({ status: 400 });
  expect(
    await denied(
      replacementTransition(
        { ...awaiting, source: { ...source, bank_id: "foreign" } },
        "approver",
        command("issue", 1),
        timestamp,
      ),
    ),
  ).toMatchObject({ status: 503 });
  expect(
    await denied(
      replacementTransition(
        awaiting,
        "approver",
        { ...command("issue", 1), id: "foreign" },
        timestamp,
      ),
    ),
  ).toMatchObject({ status: 404 });
  const card = replacementCard(request, timestamp);
  const delivered = detail(
    {
      status: "delivered",
      card_id: card.id,
      version: 4,
      maker: "officer",
      checker: "approver",
    },
    card,
  );
  expect(
    await denied(
      replacementTransition(
        delivered,
        "customer",
        { ...command("activate", 4), card_version: 1 },
        timestamp,
      ),
    ),
  ).toMatchObject({ status: 409 });
  expect(
    await denied(
      replacementTransition(
        {
          ...delivered,
          replacement: { ...delivered.replacement, checker: null },
        },
        "customer",
        command("activate", 4),
        timestamp,
      ),
    ),
  ).toMatchObject({ status: 503 });
  expect(
    replacementActions(
      delivered.replacement,
      { ...card, status: "blocked" },
      "customer",
    ),
  ).toEqual([]);
  expect(
    await denied(
      replacementTransition(
        { ...delivered, card: { ...card, status: "blocked" } },
        "customer",
        command("activate", 4),
        timestamp,
      ),
    ),
  ).toMatchObject({ status: 403 });
});

test("terminal decisions and invalid schema fields cannot introduce another lifecycle action", async () => {
  for (const status of ["rejected", "cancelled", "activated"] as const)
    for (const role of ["customer", "officer", "approver"] as const)
      expect(replacementActions({ ...request, status }, null, role)).toEqual(
        [],
      );
  expect(
    (
      await Effect.runPromise(
        replacementTransition(
          detail(),
          "customer",
          command("cancel"),
          timestamp,
        ),
      )
    ).status,
  ).toBe("cancelled");
  expect(
    (
      await Effect.runPromise(
        replacementTransition(
          detail(),
          "officer",
          command("reject"),
          timestamp,
        ),
      )
    ).status,
  ).toBe("rejected");
  expect(
    await denied(
      replacementTransition(
        detail(),
        "officer",
        { ...command("recommend"), note: "     " },
        timestamp,
      ),
    ),
  ).toMatchObject({ status: 400 });
  expect(() =>
    Schema.decodeUnknownSync(ReplacementTerms)({ ...terms, reason: "upgrade" }),
  ).toThrow();
  expect(() =>
    Schema.decodeUnknownSync(ReplacementCommand)({
      ...command("recommend"),
      action: "set_pin",
    }),
  ).toThrow();
  expect(() =>
    Schema.decodeUnknownSync(ReplacementCommand)({
      ...command("recommend"),
      version: -1,
    }),
  ).toThrow();
  expect(
    Schema.decodeUnknownSync(ReplacementDetail)(detail()).replacement.id,
  ).toBe(request.id);
  expect(
    Schema.decodeUnknownSync(ReplacementEvent)({
      id: "example",
      actor: "customer",
      action: "submit",
      status: "submitted",
      note: "Synthetic request",
      version: 0,
      created_at: timestamp,
    }).status,
  ).toBe("submitted");
});
