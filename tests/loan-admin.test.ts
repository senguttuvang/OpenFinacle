import { expect, test } from "bun:test";
import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { loanAdminOrigin, loanAdminToken } from "../src/cli/loan-admin";

test("loan administration accepts only exact own origins without URL credentials, paths or query data", async () => {
  for (const [input, output] of [
    ["https://openfinacle.plts.in", "https://openfinacle.plts.in"],
    ["http://localhost:8794", "http://localhost:8794"],
  ])
    expect(await Effect.runPromise(loanAdminOrigin(input))).toBe(output);
  for (const input of [
    "https://openfinacle.plts.in.evil.test",
    "http://openfinacle.plts.in",
    "https://openfinacle.plts.in:444",
    "https://name:password@openfinacle.plts.in",
    "https://openfinacle.plts.in/path",
    "https://openfinacle.plts.in?token=anything",
    "https://openfinacle.plts.in#fragment",
    "https://localhost",
    "file:///tmp/source",
    "invalid",
  ])
    expect(
      await Effect.runPromise(loanAdminOrigin(input).pipe(Effect.flip)),
    ).toBeInstanceOf(Error);
});

test("administrative token loading requires one valid entry in an owned protected regular file and suppresses secret diagnostics", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "openfinacle-loan-admin-test-"),
  );
  const path = join(directory, "secrets");
  const link = join(directory, "link");
  const secret = "independently-invented-test-token";
  try {
    await writeFile(path, `ADMIN_TOKEN=${JSON.stringify(secret)}\n`, {
      mode: 0o600,
    });
    expect(await Effect.runPromise(loanAdminToken(path))).toBe(secret);
    await chmod(path, 0o644);
    expect(
      await Effect.runPromise(loanAdminToken(path).pipe(Effect.flip)),
    ).toBeInstanceOf(Error);
    await chmod(path, 0o600);
    await symlink(path, link);
    expect(
      await Effect.runPromise(loanAdminToken(link).pipe(Effect.flip)),
    ).toBeInstanceOf(Error);
    for (const content of [
      "",
      `ADMIN_TOKEN=${secret}`,
      'ADMIN_TOKEN=""',
      'ADMIN_TOKEN="one"\nADMIN_TOKEN="two"',
    ]) {
      await writeFile(path, content);
      const error = await Effect.runPromise(
        loanAdminToken(path).pipe(Effect.flip),
      );
      expect(error.message).not.toContain(secret);
      expect(error).toBeInstanceOf(Error);
    }
  } finally {
    await rm(directory, { recursive: true });
  }
});
