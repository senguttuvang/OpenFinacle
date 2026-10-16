import { expect, test } from "bun:test";
import { Effect, Schema } from "effect";
import { parseJsonRequest } from "../src/adapters/request-json";

const start = Schema.Struct({
  journey: Schema.optional(Schema.Literal("new", "existing")),
});
const request = (body?: string) =>
  new Request("https://demo.test/api/session", {
    method: "POST",
    ...(body === undefined ? {} : { body }),
  });

test("session initialization accepts absent and empty bodies only when explicitly enabled", async () => {
  expect(
    await Effect.runPromise(parseJsonRequest(request(), start, true)),
  ).toEqual({});
  expect(
    await Effect.runPromise(parseJsonRequest(request(""), start, true)),
  ).toEqual({});
  expect(
    await Effect.runPromise(parseJsonRequest(request("  "), start, true)),
  ).toEqual({});
  expect(
    await Effect.runPromise(
      parseJsonRequest(request(), start).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 400, message: "Send valid JSON." });
});
test("session journey JSON is validated and malformed requests remain rejected", async () => {
  expect(
    await Effect.runPromise(
      parseJsonRequest(request('{"journey":"existing"}'), start, true),
    ),
  ).toEqual({ journey: "existing" });
  expect(
    await Effect.runPromise(
      parseJsonRequest(request('{"journey":"invalid"}'), start, true).pipe(
        Effect.flip,
      ),
    ),
  ).toMatchObject({ status: 400 });
  expect(
    await Effect.runPromise(
      parseJsonRequest(request("{"), start, true).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 400, message: "Send valid JSON." });
  expect(
    await Effect.runPromise(
      parseJsonRequest(request(" ".repeat(20001)), start, true).pipe(
        Effect.flip,
      ),
    ),
  ).toMatchObject({ status: 413 });
});
