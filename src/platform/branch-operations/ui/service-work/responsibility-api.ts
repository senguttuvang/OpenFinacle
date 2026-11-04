import { Effect, Schema } from "effect";
import { BankingError } from "../../../banking-workspace/domain/banking";
import { api } from "../../../banking-workspace/ui/api";
import {
  ResponsibilityCommand,
  ResponsibilityDetail,
  ResponsibilityKey,
} from "../../domain/service-work/responsibility";

export interface ResponsibilityScope {
  branchId: string;
  customerId: string;
  requestId: string;
}
export const PendingResponsibility = Schema.Struct({
  branchId: Schema.NonEmptyString,
  customerId: Schema.NonEmptyString,
  requestId: Schema.NonEmptyString,
  key: ResponsibilityKey,
  actor: Schema.Literal("officer", "approver"),
  command: ResponsibilityCommand,
});
export type PendingResponsibility = typeof PendingResponsibility.Type;
export const matchesResponsibilityScope = (
  scope: ResponsibilityScope,
  pending: PendingResponsibility,
) =>
  scope.branchId === pending.branchId &&
  scope.customerId === pending.customerId &&
  scope.requestId === pending.requestId;
const invalid = () =>
  new BankingError({
    message:
      "Responsibility response could not be verified. Inspect the original reference before retrying.",
    status: 503,
    uncertain: true,
  });
const decode = (
  scope: ResponsibilityScope,
  value: unknown,
  pending?: PendingResponsibility,
) =>
  Schema.decodeUnknown(ResponsibilityDetail)(value).pipe(
    Effect.filterOrFail(
      (v) =>
        v.branchId === scope.branchId &&
        v.customerId === scope.customerId &&
        v.requestId === scope.requestId &&
        (!pending ||
          (matchesResponsibilityScope(scope, pending) &&
            !!v.confirmedEvent &&
            v.confirmedEvent.key === pending.key &&
            v.confirmedEvent.actor === pending.actor &&
            v.confirmedEvent.expectedVersion === pending.command.version &&
            v.confirmedEvent.owner === pending.command.owner &&
            v.confirmedEvent.note === pending.command.note.trim())),
      invalid,
    ),
    Effect.mapError(invalid),
  );
export const readResponsibilityApi = (
  scope: ResponsibilityScope,
  pending?: PendingResponsibility,
) =>
  pending && !matchesResponsibilityScope(scope, pending)
    ? Effect.fail(invalid())
    : api<unknown>(
        `/branch/service-responsibility?customerId=${encodeURIComponent(scope.customerId)}&id=${encodeURIComponent(scope.requestId)}${pending ? `&key=${encodeURIComponent(pending.key)}` : ""}`,
      ).pipe(Effect.flatMap((value) => decode(scope, value, pending)));
export const saveResponsibilityApi = (
  scope: ResponsibilityScope,
  pending: PendingResponsibility,
) =>
  !matchesResponsibilityScope(scope, pending)
    ? Effect.fail(invalid())
    : api<unknown>("/branch/service-responsibility", {
        customerId: scope.customerId,
        requestId: scope.requestId,
        key: pending.key,
        command: pending.command,
      }).pipe(Effect.flatMap((value) => decode(scope, value, pending)));
