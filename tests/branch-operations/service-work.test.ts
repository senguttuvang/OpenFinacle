import { expect, test } from "bun:test";
import { branchDayFixture } from "../../src/demo/branch/branch-day-fixture";
import {
  branchServiceWork,
  hasUnverifiedDelivery,
  isOpenServiceRequest,
} from "../../src/platform/branch-operations/domain/service-work";

test("daily service work separates unknown/open workflow states from unverified terminal delivery", () => {
  const day = branchDayFixture();
  const relationship = day.relationships[0];
  relationship.requests = [
    ["open", "open", "none"],
    ["approval", "awaiting_approval", "pending"],
    ["dispatched", "fulfilled", "dispatched"],
    ["missing", "fulfilled", undefined],
    ["legacy", "unrecognised_legacy_status", undefined],
    ["no-delivery", "fulfilled", "none"],
    ["delivered", "fulfilled", "delivered"],
    ["cancelled-delivery", "fulfilled", "cancelled"],
    ["rejected", "rejected", "pending"],
    ["cancelled", "cancelled", "not_recorded"],
  ].map(([id, status, delivery_status]) => ({
    id: id as string,
    bank_id: relationship.customer.bank_id,
    kind: "chequebook",
    detail: "Synthetic workflow",
    status: status as string,
    delivery_status,
    created_at: "2026-11-04",
  }));
  for (const other of day.relationships.slice(1)) other.requests = [];
  expect(branchServiceWork(day).map(({ request }) => request.id)).toEqual([
    "open",
    "approval",
    "dispatched",
    "missing",
    "legacy",
  ]);
  expect(relationship.requests.filter(isOpenServiceRequest)).toHaveLength(3);
  expect(relationship.requests.filter(hasUnverifiedDelivery)).toHaveLength(2);
});
