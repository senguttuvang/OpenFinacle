import { describe, expect, test } from "bun:test";
import {
  capabilityPublicViolations,
  moduleSpecifiers,
} from "../../src/operations/architecture/imports";
import {
  rootInventory,
  sourceInventory,
} from "../../src/operations/architecture/inventory";
import {
  rootViolations,
  structureViolations,
} from "../../src/operations/architecture/structure";

const source = (path: string, content = "export {};\n") => ({ path, content });

describe("repository architecture contract", () => {
  test("owns every root entry", async () =>
    expect(rootViolations(await rootInventory(process.cwd()))).toEqual([]));
  test("keeps authored files within capability, naming and size budgets", async () =>
    expect(structureViolations(await sourceInventory(process.cwd()))).toEqual(
      [],
    ));
  test("crosses capabilities only through declared public surfaces", async () =>
    expect(
      capabilityPublicViolations(await sourceInventory(process.cwd())),
    ).toEqual([]));
  test("rejects root spill and unknown business owners", () => {
    expect(
      rootViolations([{ name: "random-helper.ts", directory: false }]),
    ).toHaveLength(1);
    expect(
      structureViolations([
        source("src/scratch.ts"),
        source("src/platform/unowned/domain/model.ts"),
      ]),
    ).toHaveLength(3);
  });
  test("rejects oversized routes, source files and crowded directories", () => {
    expect(
      structureViolations([source("app/page.tsx", "x\n".repeat(121))]),
    ).toHaveLength(1);
    expect(
      structureViolations([
        source("src/platform/cards/domain/cards.ts", "x\n".repeat(701)),
      ]),
    ).toHaveLength(1);
    expect(
      structureViolations(
        Array.from({ length: 16 }, (_, i) =>
          source(`src/platform/cards/domain/card-${i}.ts`),
        ),
      ),
    ).toHaveLength(1);
  });
  test("rejects generic folders and implementation inside route directories", () => {
    expect(
      structureViolations([
        source("src/platform/cards/helpers/format.ts"),
        source("app/cards.tsx"),
      ]),
    ).toHaveLength(2);
  });
  test("checks dynamic imports, exports and type imports and rejects new private entrypoints", () => {
    const consumer = source(
      "src/platform/payments/application/transfer.ts",
      'export {x} from "../../cards/domain/private-card"; const load=()=>import("../../cards/domain/private-card"); type X=import("../../cards/domain/private-card").X;',
    );
    const target = source("src/platform/cards/domain/private-card.ts");
    expect(moduleSpecifiers(consumer)).toHaveLength(3);
    expect(capabilityPublicViolations([consumer, target])).toHaveLength(3);
  });
});
