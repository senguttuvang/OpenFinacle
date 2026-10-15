import { expect, test } from "bun:test";
import { coreCommandKey } from "../src/adapters/core-command-key";

test("long provisioning keys remain stable, distinct and within the core storage limit", async () => {
  const prefix = "12345678-1234-4234-8234-123456789012-recipient-";
  const first = await coreCommandKey(`${prefix}client`);
  expect(first.length).toBeLessThanOrEqual(50);
  expect(await coreCommandKey(`${prefix}client`)).toBe(first);
  expect(await coreCommandKey(`${prefix}activate`)).not.toBe(first);
  expect(await coreCommandKey("12345678-1234-4234-8234-123456789012")).toBe(
    "12345678-1234-4234-8234-123456789012",
  );
});
