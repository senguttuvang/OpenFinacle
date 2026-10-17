import { Effect } from "effect";
import { BankingError, type Role, type ServiceRequest } from "./banking";
import type { ServiceDefinition } from "./services";

type CaseStatus =
  | "open"
  | "in_progress"
  | "needs_information"
  | "awaiting_approval"
  | "fulfilled"
  | "rejected"
  | "cancelled";
type DeliveryStatus =
  | "none"
  | "pending"
  | "dispatched"
  | "ready_for_collection"
  | "delivered"
  | "cancelled"
  | "not_recorded";
export const caseActions = [
  "start",
  "request_information",
  "provide_information",
  "submit_for_approval",
  "fulfil",
  "return_for_review",
  "reject",
  "cancel",
  "record_delivery",
] as const;
export type CaseAction = (typeof caseActions)[number];
export interface ServiceCase extends ServiceRequest {
  status: CaseStatus;
  payload: string;
  submitted_payload: string;
  version: number;
  request_key: string | null;
  outcome_note: string;
  updated_by: string;
  updated_at: string;
  delivery_status: DeliveryStatus;
  profile_patch?: string | null;
}
export interface CaseEvent {
  id: string;
  request_id: string;
  actor: string;
  from_status: string | null;
  to_status: string;
  note: string;
  detail: string;
  payload: string;
  delivery_status: DeliveryStatus;
  created_at: string;
}
export interface CaseDetail {
  request: ServiceCase;
  history: CaseEvent[];
  actions: CaseAction[];
}

export const allowedCaseActions = (
  record: ServiceCase,
  definition: ServiceDefinition,
  role: Role,
) =>
  caseActions.filter((action): boolean => {
    const status = record.status;
    switch (action) {
      case "start":
        return role === "officer" && status === "open";
      case "request_information":
        return role === "officer" && ["open", "in_progress"].includes(status);
      case "provide_information":
        return role === "customer" && status === "needs_information";
      case "submit_for_approval":
        return (
          role === "officer" && status === "in_progress" && definition.approval
        );
      case "fulfil":
        return definition.approval
          ? role === "approver" && status === "awaiting_approval"
          : role === "officer" && status === "in_progress";
      case "return_for_review":
        return role === "approver" && status === "awaiting_approval";
      case "reject":
        return (
          (role === "officer" &&
            ["open", "in_progress", "needs_information"].includes(status)) ||
          (role === "approver" && status === "awaiting_approval")
        );
      case "cancel":
        return (
          role === "customer" && ["open", "needs_information"].includes(status)
        );
      case "record_delivery":
        return (
          role === "officer" &&
          status === "fulfilled" &&
          ["dispatched", "ready_for_collection"].includes(
            record.delivery_status,
          )
        );
      default:
        return false;
    }
  });

export const caseTransition = (
  record: ServiceCase,
  definition: ServiceDefinition,
  role: Role,
  action: CaseAction,
  note: string,
  fields: Readonly<Record<string, string>>,
) =>
  Effect.gen(function* () {
    const reject = (message: string, status = 409) =>
      Effect.fail(new BankingError({ message, status }));
    if (!allowedCaseActions(record, definition, role).includes(action))
      return yield* reject(
        "This action is not permitted for your role and the current case state.",
        403,
      );
    const reason = note.trim();
    if (reason.length > 500)
      return yield* reject("Keep the case note within 500 characters.", 400);
    if (
      [
        "request_information",
        "provide_information",
        "return_for_review",
        "reject",
        "fulfil",
        "cancel",
      ].includes(action) &&
      reason.length < 5
    )
      return yield* reject(
        "Enter a case note of at least five characters.",
        400,
      );
    let status = record.status;
    let delivery = record.delivery_status;
    switch (action) {
      case "start":
        status = "in_progress";
        break;
      case "request_information":
        status = "needs_information";
        break;
      case "provide_information":
        status = "open";
        break;
      case "submit_for_approval":
        status = "awaiting_approval";
        break;
      case "fulfil":
        status = "fulfilled";
        delivery =
          definition.delivery === "physical"
            ? fields.delivery === "Collect at branch"
              ? "ready_for_collection"
              : "dispatched"
            : "none";
        break;
      case "return_for_review":
        status = "in_progress";
        break;
      case "reject":
        status = "rejected";
        delivery = definition.delivery === "physical" ? "cancelled" : "none";
        break;
      case "cancel":
        status = "cancelled";
        delivery = definition.delivery === "physical" ? "cancelled" : "none";
        break;
      case "record_delivery":
        delivery = "delivered";
        break;
    }
    return {
      status,
      delivery_status: delivery,
      note: reason || action.replaceAll("_", " "),
    };
  });
