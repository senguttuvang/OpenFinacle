import { Context, type Effect } from "effect";
import type { BankingError } from "./banking";
export interface CoreService {
  request: <T>(
    method: string,
    path: string,
    body?: unknown,
    key?: string,
  ) => Effect.Effect<T, BankingError>;
}
export const Core = Context.GenericTag<CoreService>("OpenFinacle/Core");
export interface StoreService {
  all: <T>(
    sql: string,
    ...values: (string | number | null)[]
  ) => Effect.Effect<T[], BankingError>;
  one: <T>(
    sql: string,
    ...values: (string | number | null)[]
  ) => Effect.Effect<T | null, BankingError>;
  run: (
    sql: string,
    ...values: (string | number | null)[]
  ) => Effect.Effect<number, BankingError>;
}
export const Store = Context.GenericTag<StoreService>("OpenFinacle/Store");
