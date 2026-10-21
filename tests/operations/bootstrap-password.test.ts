import { expect, test } from "bun:test";
import {
  bootstrapPasswordAcceptable,
  createBootstrapPassword,
} from "../../src/operations/cli/bootstrap-password";

test("bootstrap secrets comply with the active core password policy", () => {
  expect(
    bootstrapPasswordAcceptable("aabbccdd-1234-4567-8901-abcdef123456Aa9!"),
  ).toBe(false);
  expect(
    Array.from({ length: 100 }, () => createBootstrapPassword()).every(
      bootstrapPasswordAcceptable,
    ),
  ).toBe(true);
});
