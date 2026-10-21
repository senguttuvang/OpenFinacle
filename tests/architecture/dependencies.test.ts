import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("the active architecture contract rejects reverse dependencies and framework-bound domain models", async () => {
  const root = await mkdtemp(join(tmpdir(), "openfinacle-architecture-"));
  try {
    const contract = await readFile("arch-contract.yaml", "utf8");
    await writeFile(join(root, "arch-contract.yaml"), contract);
    await mkdir(join(root, "src/platform/cards/domain"), { recursive: true });
    await mkdir(join(root, "src/platform/cards/ui"), { recursive: true });
    await writeFile(
      join(root, "src/platform/cards/ui/card.ts"),
      'export const card = "card";\n',
    );
    await writeFile(
      join(root, "src/platform/cards/domain/card.ts"),
      'import {card} from "../ui/card"; import {useState} from "react"; export const invalidModel = () => useState(card);\n',
    );
    const child = Bun.spawn(
      [
        resolve("node_modules/.bin/arch-contract"),
        "check",
        "--no-baseline",
        "--format",
        "json",
      ],
      {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect({ status, stderr }).toEqual({ status: 1, stderr: "" });
    const report = JSON.parse(stdout);
    expect(JSON.stringify(report)).toContain("layer-boundary");
    expect(JSON.stringify(report)).toContain(
      "domain-independent-of-frameworks",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
