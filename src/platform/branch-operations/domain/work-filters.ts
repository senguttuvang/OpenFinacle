import {
  type BranchDay,
  type BranchRelationship,
  unresolvedStatuses,
} from "./branch-day";
import { hasUnverifiedDelivery, isOpenServiceRequest } from "./service-work";

export const relationshipWork = (relationship: BranchRelationship) => ({
  instructions: relationship.commands.filter((c) =>
    unresolvedStatuses.has(c.status),
  ).length,
  services: relationship.requests.filter(
    (r) => isOpenServiceRequest(r) || hasUnverifiedDelivery(r),
  ).length,
});
export const productKey = (relationship: BranchRelationship) =>
  relationship.account?.savingsProductId === undefined
    ? "unknown"
    : String(relationship.account.savingsProductId);
export const filterRelationships = (
  day: BranchDay,
  query: string,
  work: string,
  product: string,
) =>
  day.relationships.filter((r) => {
    const text =
      `${r.customer.display_name} ${r.customer.reference} ${r.customer.account_no}`.toLowerCase();
    const counts = relationshipWork(r);
    return (
      text.includes(query.trim().toLowerCase()) &&
      (product === "all" || productKey(r) === product) &&
      (work === "all" ||
        (work === "instructions" && counts.instructions > 0) ||
        (work === "services" && counts.services > 0) ||
        (work === "core" && !r.account))
    );
  });
export const branchInstructionRows = (day: BranchDay) => {
  const owners = new Map(
    day.responsibilities.map((r) => [r.command_id, r.owner]),
  );
  return day.relationships.flatMap(({ customer, commands }) =>
    commands.map((command) => ({
      customer,
      command,
      owner: owners.get(command.id) ?? "unassigned",
    })),
  );
};
export const filterInstructions = (
  day: BranchDay,
  query: string,
  state: string,
  owner: string,
  customerId = "",
) =>
  branchInstructionRows(day).filter((row) => {
    const { customer, command } = row;
    const text =
      `${customer.display_name} ${customer.reference} ${customer.account_no} ${command.id} ${command.core_id ?? ""} ${command.description} ${command.error ?? ""}`.toLowerCase();
    return (
      text.includes(query.trim().toLowerCase()) &&
      (state === "all" ||
        (state === "unresolved"
          ? unresolvedStatuses.has(command.status)
          : command.status === state)) &&
      (owner === "all" || row.owner === owner) &&
      (!customerId || row.customer.id === customerId)
    );
  });
