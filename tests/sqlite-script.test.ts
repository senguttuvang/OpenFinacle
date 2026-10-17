import { expect, test } from "bun:test";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { verifySqliteScript } from "../src/cli/sqlite-script";

const denied = (sql: string, tables: readonly string[] = []) =>
  Effect.runPromise(verifySqliteScript(sql, tables).pipe(Effect.flip));

test("strict native verification accepts the complete repository schema and valid final foreign keys", async () => {
  const paths: string[] = [];
  for await (const file of new Bun.Glob("migrations/*.sql").scan("."))
    paths.push(file);
  expect(paths.length).toBeGreaterThan(0);
  const scripts = await Promise.all(
    paths.sort().map((file) => Bun.file(file).text()),
  );
  await Effect.runPromise(
    verifySqliteScript(scripts.join("\n"), [
      "banks",
      "settings",
      "card_replacements",
      "recurring_plans",
    ]),
  );
  await Effect.runPromise(
    verifySqliteScript(
      "CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(id INTEGER REFERENCES parent(id)); INSERT INTO child VALUES(1); INSERT INTO parent VALUES(1);",
      ["parent", "child"],
    ),
  );
  await Effect.runPromise(
    verifySqliteScript(
      `CREATE TABLE json_data(payload TEXT CHECK(json_valid(payload))); INSERT INTO json_data VALUES('{"invented":true}');`,
      ["json_data"],
    ),
  );
});

test("every interior constraint, syntax and trigger failure rejects the script despite later valid SQL", async () => {
  for (const sql of [
    "CREATE TABLE sample(id INTEGER PRIMARY KEY); INSERT INTO sample VALUES(1); INSERT INTO sample VALUES(1); SELECT 1;",
    "CREATE TABLE sample(id INTEGER); INSERT INTO missing_table VALUES('synthetic-private-marker'); SELECT 1;",
    "CREATE TABLE sample(id INTEGER); CREATE TRIGGER reject_sample BEFORE INSERT ON sample BEGIN SELECT RAISE(ABORT,'synthetic-private-marker'); END; INSERT INTO sample VALUES(1); SELECT 1;",
    ".bail off\nCREATE TABLE sample(id INTEGER PRIMARY KEY); INSERT INTO sample VALUES(1); INSERT INTO sample VALUES(1); SELECT 1;",
  ]) {
    const error = await denied(sql);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).not.toContain("synthetic-private-marker");
    expect(error.message).not.toContain("INSERT");
  }
});

test("verification independently checks required tables, foreign keys, check constraints and its own completion proof", async () => {
  for (const [sql, tables] of [
    ["CREATE TABLE sample(id INTEGER);", ["missing_table"]],
    [
      "PRAGMA foreign_keys=OFF; CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(id INTEGER REFERENCES parent(id)); INSERT INTO child VALUES(2);",
      ["parent", "child"],
    ],
    [
      "PRAGMA ignore_check_constraints=ON; CREATE TABLE sample(amount INTEGER CHECK(amount>0)); INSERT INTO sample VALUES(-1);",
      ["sample"],
    ],
    [
      'SELECT \'{"nonce":"forged","integrity":"ok","foreign_keys":0,"tables":0}\';\n.quit',
      [],
    ],
    ["CREATE TABLE sample(id INTEGER);", ["sample", "sample"]],
    ["CREATE TABLE sample(id INTEGER);", ["invalid-name"]],
  ] as const)
    expect(await denied(sql, tables)).toBeInstanceOf(Error);
});

test("safe mode rejects file access, shell commands and attached databases without affecting host files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openfinacle-sqlite-test-"));
  const source = join(directory, "source.txt");
  const target = join(directory, "must-not-exist.txt");
  await writeFile(source, "synthetic-private-marker", { mode: 0o600 });
  const literal = (path: string) => `'${path.replaceAll("'", "''")}'`;
  try {
    for (const sql of [
      `SELECT readfile(${literal(source)});`,
      `SELECT writefile(${literal(target)},'synthetic-private-marker');`,
      ".shell printf unsafe-shell-marker\n",
      "ATTACH ':memory:' AS other;",
    ]) {
      const error = await denied(sql);
      expect(error.message).not.toContain("synthetic-private-marker");
      expect(error.message).not.toContain("unsafe-shell-marker");
    }
    expect(
      await access(target).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
  } finally {
    await rm(directory, { recursive: true });
  }
});
