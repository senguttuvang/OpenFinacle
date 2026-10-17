import { expect, test } from "bun:test";
import { Effect } from "effect";
import {
  serviceDefinition,
  validateServiceFields,
} from "../src/domain/services";

const definition = (code: string) => {
  const result = serviceDefinition(code);
  if (!result) throw new Error(`Missing test service ${code}`);
  return result;
};
const validate = (code: string, values: Record<string, string>) =>
  Effect.runPromise(
    Effect.either(validateServiceFields(definition(code), values)),
  );

test("service inputs are normalized and arbitrary hidden fields are rejected", async () => {
  expect(
    await validate("address_change", {
      address: " 14 Example Lane ",
      city: " Chennai ",
      pincode: "600020",
    }),
  ).toMatchObject({
    _tag: "Right",
    right: { address: "14 Example Lane", city: "Chennai", pincode: "600020" },
  });
  expect(
    await validate("address_change", {
      address: "Example Lane",
      city: "Chennai",
      pincode: "600020",
      status: "fulfilled",
    }),
  ).toMatchObject({ _tag: "Left", left: { status: 400 } });
  expect(serviceDefinition("not_a_service")).toBeUndefined();
});

test("delivery and chequebook size must be actual catalogue choices", async () => {
  expect(
    await validate("chequebook", {
      leaves: "25",
      delivery: "Collect at branch",
    }),
  ).toMatchObject({
    _tag: "Right",
    right: { leaves: "25", delivery: "Collect at branch" },
  });
  for (const fields of [
    { leaves: "999", delivery: "Collect at branch" },
    { leaves: "25", delivery: "" },
    { leaves: "25", delivery: "unlisted" },
  ])
    expect(await validate("chequebook", fields)).toMatchObject({
      _tag: "Left",
      left: { status: 400 },
    });
});

test("statement periods validate calendar dates and dependent order", async () => {
  expect(
    await validate("statement_email", { from: "2024-02-29", to: "2024-03-01" }),
  ).toMatchObject({ _tag: "Right" });
  for (const [from, to] of [
    ["2025-02-29", "2025-03-01"],
    ["2026-03-01", "2026-02-01"],
    ["2026-13-01", "2026-13-02"],
    ["2026-01-01T00:00:00Z", "2026-02-01"],
  ])
    expect(await validate("statement_email", { from, to })).toMatchObject({
      _tag: "Left",
      left: { status: 400 },
    });
});

test("service fields enforce formats and length without echoing rejected values", async () => {
  const invalid = "not-an-email-private-value";
  const result = await validate("email_change", {
    email: invalid,
    explanation: "Please review this update",
  });
  expect(result).toMatchObject({
    _tag: "Left",
    left: { message: "Enter a valid email address." },
  });
  expect(JSON.stringify(result)).not.toContain(invalid);
  expect(
    await validate("address_change", {
      address: "Example Lane",
      city: "Chennai",
      pincode: "012345",
    }),
  ).toMatchObject({ _tag: "Left" });
  expect(
    await validate("credit_card_query", {
      topic: "Payment",
      explanation: "x".repeat(501),
    }),
  ).toMatchObject({ _tag: "Left" });
  expect(
    await validate("atm_cash_query", {
      reference: "<script>",
      date: "2026-10-01",
      explanation: "Synthetic enquiry",
    }),
  ).toMatchObject({ _tag: "Left" });
});
