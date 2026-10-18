import type { Page } from "@playwright/test";
import { Effect } from "effect";
import {
  type ReplacementDetail,
  type ReplacementTerms,
  replacementActions,
  replacementTransition,
} from "../../src/platform/cards/domain/card-replacements";
import {
  allowedCardActions,
  type Card,
  type CardDetail,
  cardTransition,
} from "../../src/platform/cards/domain/cards";
import { savedWorkspace } from "./workspace";

export const replacementWorkspace = async (page: Page) => {
  const data = savedWorkspace();
  const timestamp = "2026-10-17T09:00:00Z";
  const sourceId = "demo-debit:synthetic-workspace";
  const requestId = "44444444-1234-4567-8901-123456789abc";
  const initial: Card = {
    id: sourceId,
    bank_id: data.bank.id,
    suffix: "4242",
    status: "active",
    version: 0,
    updated_at: timestamp,
    settings: {
      atm: true,
      pos: true,
      online: false,
      contactless: false,
      international: false,
      daily_limit: 25000,
    },
  };
  const cards = new Map<string, Card>([[sourceId, initial]]);
  const histories = new Map<string, CardDetail["history"]>();
  let saved: ReplacementDetail["replacement"] | null = null;
  let history: ReplacementDetail["history"] = [];
  let activationPosts = 0;
  let financialWrites = 0;
  const keys = new Set<string>();
  const cardKeys = new Map<string, string>();
  const addCardEvent = (
    card: Card,
    actor: string,
    action: string,
    note: string,
  ) => {
    histories.set(card.id, [
      ...(histories.get(card.id) ?? []),
      {
        id: `${card.id}:${card.version}`,
        card_id: card.id,
        actor,
        action,
        note,
        status: card.status,
        settings: card.settings,
        version: card.version,
        created_at: timestamp,
      },
    ]);
  };
  addCardEvent(initial, "system", "issued", "Synthetic original instrument");
  const current = (key: string | null = null): ReplacementDetail | null => {
    if (!saved) return null;
    const source = cards.get(saved.terms.source_card_id);
    const card = saved.card_id ? (cards.get(saved.card_id) ?? null) : null;
    if (!source) throw new Error("Missing synthetic source");
    return {
      replacement: saved,
      source,
      card,
      history,
      actions: replacementActions(saved, card, data.role),
      confirmed_key: key,
    };
  };
  const cardDetail = (id: string, key: string | null = null): CardDetail => {
    const card = cards.get(id);
    if (!card) throw new Error("Missing synthetic instrument");
    return {
      card,
      history: histories.get(id) ?? [],
      actions: allowedCardActions(card, data.role),
      confirmed_key: key,
    };
  };
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const key = request.headers()["idempotency-key"] ?? "";
    if (url.pathname === "/api/session/role") {
      data.role = request.postDataJSON().role;
      return route.fulfill({ json: { role: data.role } });
    }
    if (
      url.pathname === "/api/card-replacements" &&
      request.method() === "POST"
    ) {
      if (keys.has(key)) return route.fulfill({ json: current(key) });
      const terms = request.postDataJSON() as ReplacementTerms;
      saved = {
        id: requestId,
        bank_id: data.bank.id,
        terms: { ...terms, address: terms.address.trim() },
        status: "submitted",
        maker: null,
        checker: null,
        card_id: null,
        version: 0,
        created_at: timestamp,
        updated_at: timestamp,
      };
      history = [
        {
          id: "submit",
          actor: "customer",
          action: "submit",
          note: "Synthetic replacement application",
          status: "submitted",
          version: 0,
          created_at: timestamp,
        },
      ];
      keys.add(key);
      return route.fulfill({ json: current(key) });
    }
    if (url.pathname === "/api/card-replacements/action") {
      const input = request.postDataJSON();
      if (input.action === "activate") activationPosts++;
      if (keys.has(key)) return route.fulfill({ json: current(key) });
      const detail = current();
      if (!detail || !saved) throw new Error("Missing synthetic application");
      const next = Effect.runSync(
        replacementTransition(detail, data.role, input, timestamp),
      );
      if (next.block_source) {
        const blocked = {
          ...detail.source,
          status: "blocked" as const,
          version: detail.source.version + 1,
        };
        cards.set(blocked.id, blocked);
        addCardEvent(
          blocked,
          "approver",
          "block",
          "Retired by independent replacement issuance",
        );
      }
      if (next.card) {
        cards.set(next.card.id, next.card);
        addCardEvent(
          next.card,
          data.role,
          input.action === "issue" ? "issued" : "activate",
          input.note,
        );
      }
      saved = {
        ...saved,
        status: next.status,
        maker: next.maker,
        checker: next.checker,
        card_id: next.card_id,
        version: saved.version + 1,
        updated_at: timestamp,
      };
      history = [
        ...history,
        {
          id: input.action,
          actor: data.role,
          action: input.action,
          note: input.note,
          status: next.status,
          version: saved.version,
          created_at: timestamp,
        },
      ];
      keys.add(key);
      return input.action === "activate"
        ? route.abort("failed")
        : route.fulfill({ json: current(key) });
    }
    if (url.pathname === "/api/card-replacements") {
      const key = url.searchParams.get("key");
      if (key && !keys.has(key))
        return route.fulfill({
          status: 404,
          json: { error: "No saved replacement instruction" },
        });
      return route.fulfill({
        json:
          key || url.searchParams.has("id")
            ? current(key)
            : { replacements: saved ? [saved] : [] },
      });
    }
    if (url.pathname === "/api/cards/action") {
      const input = request.postDataJSON();
      const card = cards.get(input.id);
      if (!card) throw new Error("Unknown synthetic card");
      const next = Effect.runSync(cardTransition(card, data.role, input));
      const changed = {
        ...card,
        ...next,
        version: card.version + 1,
        updated_at: timestamp,
      };
      cards.set(changed.id, changed);
      addCardEvent(changed, data.role, input.action, input.note);
      cardKeys.set(key, changed.id);
      return route.fulfill({ json: cardDetail(changed.id, key) });
    }
    if (url.pathname === "/api/cards") {
      const key = url.searchParams.get("key");
      const id = key ? cardKeys.get(key) : url.searchParams.get("id");
      return route.fulfill({
        json: id ? cardDetail(id, key) : { cards: [...cards.values()] },
      });
    }
    if (url.pathname === "/api/commands" && request.method() === "POST")
      financialWrites++;
    return route.fulfill({
      json: url.pathname === "/api/dashboard" ? data : {},
    });
  });
  return {
    sourceId,
    requestId,
    activationPosts: () => activationPosts,
    financialWrites: () => financialWrites,
    cards: () => [...cards.values()],
  };
};
