import { expect, test } from "bun:test";
import { branchDayFixture } from "../../src/demo/branch/branch-day-fixture";
import {
  filterInstructions,
  filterRelationships,
  relationshipWork,
} from "../../src/platform/branch-operations/domain/work-filters";

const fixture = () => {
  const day = branchDayFixture();
  const [first, second] = day.relationships;
  first.commands[0].status = "uncertain";
  second.commands[0].status = "posted";
  second.commands[0].core_id = 387;
  first.requests = [
    {
      id: "delivery-case",
      bank_id: first.customer.bank_id,
      kind: "chequebook",
      status: "fulfilled",
      detail: "Awaiting recorded delivery",
      created_at: "2026-11-04",
      delivery_status: "awaiting_dispatch",
    },
  ];
  second.requests = [
    {
      id: "delivered-case",
      bank_id: second.customer.bank_id,
      kind: "chequebook",
      status: "fulfilled",
      detail: "Delivery recorded",
      created_at: "2026-11-04",
      delivery_status: "delivered",
    },
  ];
  day.responsibilities = [
    {
      command_id: first.commands[0].id,
      owner: "manager",
      version: 1,
      updated_at: "2026-11-04",
    },
  ];
  return day;
};
test("directory combines loaded work, product and case-insensitive text without changing source coverage", () => {
  const day = fixture();
  const before = JSON.stringify(day);
  expect(
    filterRelationships(day, "  MIRA  ", "instructions", "1").map(
      (r) => r.customer.id,
    ),
  ).toEqual(["customer-0"]);
  expect(filterRelationships(day, "Northstar", "instructions", "all")).toEqual(
    [],
  );
  expect(filterRelationships(day, "", "services", "all")).toHaveLength(1);
  expect(relationshipWork(day.relationships[1])).toEqual({
    instructions: 0,
    services: 0,
  });
  expect(filterRelationships(day, "", "all", "all")).toHaveLength(2);
  expect(JSON.stringify(day)).toBe(before);
});
test("missing Core evidence remains an unavailable relationship and cannot match a known product", () => {
  const day = fixture();
  day.relationships[1].account = null;
  expect(
    filterRelationships(day, "", "core", "all").map((r) => r.customer.id),
  ).toEqual(["customer-1"]);
  expect(filterRelationships(day, "", "core", "1")).toEqual([]);
  expect(filterRelationships(day, "", "all", "unknown")).toHaveLength(1);
});
test("instruction state, owner and Core-reference filters compose over original customer records", () => {
  const day = fixture();
  const before = JSON.stringify(day);
  expect(
    filterInstructions(day, "mira", "unresolved", "manager")[0].command.id,
  ).toBe("instruction-0");
  expect(filterInstructions(day, "mira", "pending", "manager")).toEqual([]);
  expect(
    filterInstructions(day, " 387 ", "posted", "unassigned")[0].customer.id,
  ).toBe("customer-1");
  expect(filterInstructions(day, "instruction-1", "all", "manager")).toEqual(
    [],
  );
  expect(filterInstructions(day, "387", "posted", "all", "customer-0")).toEqual(
    [],
  );
  expect(
    filterInstructions(day, "387", "posted", "all", "customer-1"),
  ).toHaveLength(1);
  expect(JSON.stringify(day)).toBe(before);
});
test("all uncertain, executing and failed instructions remain unresolved while rejected/posted do not", () => {
  const day = fixture();
  for (const status of [
    "pending",
    "executing",
    "uncertain",
    "failed",
    "posted",
    "rejected",
  ] as const) {
    day.relationships[0].commands[0].status = status;
    expect(
      filterInstructions(day, "instruction-0", "unresolved", "all").length,
    ).toBe(["posted", "rejected"].includes(status) ? 0 : 1);
  }
});
