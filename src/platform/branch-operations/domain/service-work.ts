import type { BranchDay, BranchRelationship } from "./branch-day";
export type BranchServiceRequest = BranchRelationship["requests"][number];
const terminalServiceStates = new Set([
  "fulfilled",
  "rejected",
  "cancelled",
  "resolved",
  "closed",
]);
export const isOpenServiceRequest = (request: BranchServiceRequest) =>
  !terminalServiceStates.has(request.status);
export const hasUnverifiedDelivery = (request: BranchServiceRequest) =>
  request.status === "fulfilled" &&
  !["none", "delivered", "cancelled"].includes(
    request.delivery_status ?? "not_returned",
  );
export const branchServiceWork = (day: BranchDay) =>
  day.relationships.flatMap(({ customer, requests }) =>
    requests
      .filter(
        (request) =>
          isOpenServiceRequest(request) || hasUnverifiedDelivery(request),
      )
      .map((request) => ({ customer, request })),
  );
