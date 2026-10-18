import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { Effect } from "effect";
import { verifySqliteScript } from "../src/cli/sqlite-script";
import { verifyWorkflowDump } from "../src/cli/workflow-release";

test("0015 is additive to the current banking schema and planning state plus immutable audit survive SQL dump/restore", async () => {
  const files: string[] = [];
  for await (const path of new Bun.Glob("migrations/*.sql").scan("."))
    files.push(path);
  const previous = (
    await Promise.all(
      files
        .sort()
        .filter((path) => !path.endsWith("0015_planning.sql"))
        .map((path) => Bun.file(path).text()),
    )
  ).join("\n");
  const migration = await Bun.file("migrations/0015_planning.sql").text();
  const db = new Database(":memory:");
  db.exec(previous);
  db.run(
    "INSERT INTO banks(id,status,journey) VALUES('restore-planning-only','ready','existing')",
  );
  db.run(
    "INSERT INTO settings(key,value) VALUES('preserved-banking-marker','before-planning')",
  );
  const tables = db
    .query(
      "SELECT name,sql FROM sqlite_schema WHERE type='table' ORDER BY name",
    )
    .all();
  db.exec(migration);
  expect(
    db
      .query(
        "SELECT name,sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'planning_%' ORDER BY name",
      )
      .all(),
  ).toEqual(tables);
  expect(
    db
      .query("SELECT value FROM settings WHERE key='preserved-banking-marker'")
      .get(),
  ).toEqual({ value: "before-planning" });
  const state = JSON.stringify({
    household: "synthetic-nila",
    version: 0,
    budgets: { Dining: 12300 },
  });
  db.run(
    "INSERT INTO planning_events(id,bank_id,household_id,command_key,payload,actor,action,state,version,created_at) VALUES('event','restore-planning-only','synthetic-nila','original-command','original-input','customer','initialize',?,0,'2026-10-18')",
    [state],
  );
  expect(() => db.run("DELETE FROM planning_events")).toThrow("immutable");
  // sqlite3 creates the actual SQL export; the release verifier restores that exact export in safe mode.
  const child = Bun.spawn(["sqlite3", "-batch", ":memory:"], {
    stdin: new Blob([
      previous,
      "\n",
      migration,
      "\nINSERT INTO banks(id,status,journey) VALUES('restore-planning-only','ready','existing');\n",
      `INSERT INTO planning_events(id,bank_id,household_id,command_key,payload,actor,action,state,version,created_at) VALUES('event','restore-planning-only','synthetic-nila','original-command','original-input','customer','initialize','${state}',0,'2026-10-18');\n.dump\n`,
    ]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, dump] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
  ]);
  expect(code).toBe(0);
  await Effect.runPromise(verifyWorkflowDump(dump));
  await Effect.runPromise(
    verifySqliteScript(dump, [
      "banks",
      "planning_households",
      "planning_events",
    ]),
  );
  const restored = new Database(":memory:");
  restored.exec(dump);
  expect(
    restored.query("SELECT state,version FROM planning_households").get(),
  ).toEqual({ state, version: 0 });
  expect(
    restored.query("SELECT command_key,payload FROM planning_events").get(),
  ).toEqual({ command_key: "original-command", payload: "original-input" });
  expect(() =>
    restored.run("UPDATE planning_events SET payload='changed'"),
  ).toThrow("immutable");
  expect(restored.query("PRAGMA foreign_key_check").all()).toEqual([]);
  db.close();
  restored.close();
});
