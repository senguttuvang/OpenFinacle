import { expect, test } from "bun:test";
import source from "../../specs/010-icici-navigation/source-inventory.json" with {
  type: "json",
};
import { retailMenu } from "../../src/platform/navigation/domain/retail-navigation";

test("menu preserves the settled authenticated visible hierarchy and order", () => {
  expect(
    retailMenu.map((family) => ({
      label: family.label,
      children: family.items.map((item) => item.label),
    })),
  ).toEqual(
    source.families.map((family) => ({
      label: family.label,
      children: family.children.map((child) => child.label),
    })),
  );
  expect(retailMenu).toHaveLength(9);
  expect(retailMenu.flatMap((family) => family.items)).toHaveLength(44);
  for (const family of source.families)
    expect(family.scrollHeight).toBe(family.clientHeight);
});

test("every item has a unique stable ID and an explicit internal destination", () => {
  const all = retailMenu.flatMap((family) => family.items);
  expect(new Set([...retailMenu, ...all].map((item) => item.id)).size).toBe(53);
  for (const item of all) {
    expect(["workspace", "unavailable"]).toContain(item.destination.kind);
    expect(JSON.stringify(item.destination)).not.toMatch(
      /https?:|icici|api\//i,
    );
  }
  const deposits = retailMenu.find((family) => family.id === "deposits");
  if (!deposits) throw Error("Deposit family missing");
  expect(deposits.items.slice(0, 2).map((item) => item.destination)).toEqual([
    { kind: "workspace", view: "deposits", section: "fixed" },
    { kind: "workspace", view: "deposits", section: "recurring" },
  ]);
});

test("unimplemented bank products cannot impersonate supported banking", () => {
  for (const id of [
    "credit-cards",
    "wire-transfer",
    "mutual-funds",
    "term-life",
    "cibil",
    "smart-lock",
    "pay-bills",
  ]) {
    expect(
      retailMenu
        .flatMap((family) => family.items)
        .find((item) => item.id === id)?.destination.kind,
    ).toBe("unavailable");
  }
  expect(
    retailMenu
      .flatMap((family) => family.items)
      .find((item) => item.id === "funds-transfer")?.destination,
  ).toEqual({ kind: "workspace", view: "transfer" });
});
