import { expect, test } from "bun:test";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("real payee CLI preserves bounded JSON through a process pipe and verifies source before reading credentials", async () => {
  const directory = await mkdtemp(join(tmpdir(), "finacle-payee-cli-"));
  const execute = async (args: string[]) => {
    const child = Bun.spawn(args, {
      cwd: directory,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { code, stdout, stderr };
  };
  const cli = resolve("src/cli/main.ts");
  let revision = "";
  let reads = 0;
  let writes = 0;
  const server = Bun.serve({
    hostname: "localhost",
    port: 0,
    fetch: (request) => {
      const path = new URL(request.url).pathname;
      if (path === "/api/health") {
        reads++;
        return Response.json({ revision });
      }
      if (path === "/api/admin/demo/payees") {
        writes++;
        expect(request.headers.get("Authorization")).toBe(
          "Bearer invented-payee-test-token",
        );
        return Response.json({
          summary: {
            frozen_owners: 101,
            owners: 101,
            complete: 101,
            min_active: 5,
            max_active: 15,
          },
          progress: { membershipsAdded: 0, ownersCompleted: 0 },
          owners: [],
        });
      }
      throw new Error("Unexpected CLI route");
    },
  });
  try {
    expect((await execute(["git", "init", "--quiet"])).code).toBe(0);
    expect(
      (
        await execute([
          "git",
          "remote",
          "add",
          "origin",
          "https://github.com/senguttuvang/OpenFinacle.git",
        ])
      ).code,
    ).toBe(0);
    expect(
      (
        await execute([
          "git",
          "-c",
          "user.name=Fixture",
          "-c",
          "user.email=fixture@example.test",
          "commit",
          "--quiet",
          "--allow-empty",
          "-m",
          "Fixture",
        ])
      ).code,
    ).toBe(0);
    const sha = (await execute(["git", "rev-parse", "HEAD"])).stdout.trim();
    // A missing credential file must remain unread until the remote revision matches.
    const mismatch = await execute([
      "bun",
      cli,
      "payees",
      "--url",
      `http://localhost:${server.port}`,
      "--branch-id",
      "branch",
      "--secrets-file",
      join(directory, "missing.vars"),
    ]);
    expect(mismatch.code).not.toBe(0);
    expect(mismatch.stderr + mismatch.stdout).toContain("deployed revision");
    expect(writes).toBe(0);
    revision = sha;
    const secrets = join(
      tmpdir(),
      `finacle-payee-fixture-${crypto.randomUUID()}.vars`,
    );
    await Bun.write(secrets, 'ADMIN_TOKEN="invented-payee-test-token"\n');
    await chmod(secrets, 0o600);
    try {
      const child = Bun.spawn(
        [
          "bun",
          cli,
          "payees",
          "--url",
          `http://localhost:${server.port}`,
          "--branch-id",
          "branch",
          "--secrets-file",
          secrets,
        ],
        { cwd: directory, stdin: "ignore", stdout: "pipe", stderr: "pipe" },
      );
      const piped = Bun.spawn(["cat"], {
        stdin: child.stdout,
        stdout: "pipe",
        stderr: "pipe",
      });
      const [code, pipeCode, stdout, stderr] = await Promise.all([
        child.exited,
        piped.exited,
        new Response(piped.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect(code).toBe(0);
      expect(pipeCode).toBe(0);
      expect(stderr).toBe("");
      expect(stdout.trim().split("\n")).toHaveLength(1);
      expect(JSON.parse(stdout)).toMatchObject({
        revision: sha,
        result: {
          summary: { frozen_owners: 101, complete: 101 },
          progress: { membershipsAdded: 0, ownersCompleted: 0 },
        },
      });
      expect(stdout).not.toContain("invented-payee-test-token");
      expect(reads).toBe(2);
      expect(writes).toBe(1);
    } finally {
      await rm(secrets, { force: true });
    }
  } finally {
    server.stop(true);
    await rm(directory, { recursive: true, force: true });
  }
});
