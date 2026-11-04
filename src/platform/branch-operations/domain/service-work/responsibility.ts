import { Schema } from "effect";

const identifier = Schema.NonEmptyString;
const version = Schema.Number.pipe(
  Schema.int(),
  Schema.nonNegative(),
  Schema.filter(Number.isSafeInteger),
);
export const ResponsibilityKey = Schema.String.pipe(
  Schema.pattern(/^[a-zA-Z0-9_-]{8,100}$/),
);
const CaseOwner = Schema.NullOr(
  Schema.Literal("teller", "checker", "manager", "accountant"),
);
export const ResponsibilityCommand = Schema.Struct({
  version: version.pipe(Schema.lessThan(Number.MAX_SAFE_INTEGER)),
  owner: CaseOwner,
  note: Schema.String.pipe(
    Schema.minLength(5),
    Schema.maxLength(500),
    Schema.filter((value) => [...value.trim()].length >= 5),
  ),
});
export type ResponsibilityCommand = typeof ResponsibilityCommand.Type;
export const ResponsibilityEvent = Schema.Struct({
  id: identifier,
  branchId: identifier,
  customerId: identifier,
  requestId: identifier,
  key: ResponsibilityKey,
  actor: Schema.Literal("officer", "approver"),
  owner: CaseOwner,
  note: ResponsibilityCommand.fields.note,
  expectedVersion: ResponsibilityCommand.fields.version,
  version: version.pipe(Schema.greaterThan(0)),
  createdAt: Schema.String.pipe(
    Schema.filter(
      (v) => Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v,
    ),
  ),
}).pipe(
  Schema.filter(
    (v) => v.version === v.expectedVersion + 1 && v.note === v.note.trim(),
  ),
);
export type ResponsibilityEvent = typeof ResponsibilityEvent.Type;
export const ResponsibilityDetail = Schema.Struct({
  source: Schema.Literal("application_workflow"),
  branchId: identifier,
  customerId: identifier,
  requestId: identifier,
  observedAt: version,
  latest: Schema.NullOr(ResponsibilityEvent),
  history: Schema.Array(ResponsibilityEvent).pipe(Schema.maxItems(200)),
  historyComplete: Schema.Boolean,
  confirmedEvent: Schema.NullOr(ResponsibilityEvent),
}).pipe(
  Schema.filter((v) => {
    const owned = (e: ResponsibilityEvent) =>
      e.branchId === v.branchId &&
      e.customerId === v.customerId &&
      e.requestId === v.requestId;
    if (
      (v.latest && !owned(v.latest)) ||
      (v.confirmedEvent && !owned(v.confirmedEvent))
    )
      return false;
    if (
      new Set(v.history.map((e) => e.id)).size !== v.history.length ||
      new Set(v.history.map((e) => e.key)).size !== v.history.length
    )
      return false;
    if (
      !v.history.every(
        (e, i) =>
          owned(e) &&
          e.version === i + 1 &&
          (i === 0 ? e.owner !== null : e.owner !== v.history[i - 1].owner),
      )
    )
      return false;
    if (!v.latest)
      return v.historyComplete && !v.history.length && !v.confirmedEvent;
    const last = v.history.at(-1);
    if (!last) return false;
    if (v.confirmedEvent && v.confirmedEvent.version > v.latest.version)
      return false;
    if (
      v.latest.version > last.version &&
      v.history.some((e) => e.id === v.latest?.id || e.key === v.latest?.key)
    )
      return false;
    if (v.confirmedEvent) {
      const corroborated =
        v.confirmedEvent.version === v.latest.version
          ? v.latest
          : v.history.find((e) => e.version === v.confirmedEvent?.version);
      if (
        corroborated &&
        JSON.stringify(corroborated) !== JSON.stringify(v.confirmedEvent)
      )
        return false;
    }
    if (v.historyComplete)
      return (
        JSON.stringify(last) === JSON.stringify(v.latest) &&
        (!v.confirmedEvent ||
          v.history.some(
            (e) => JSON.stringify(e) === JSON.stringify(v.confirmedEvent),
          ))
      );
    return v.history.length === 200 && v.latest.version > last.version;
  }),
);
export type ResponsibilityDetail = typeof ResponsibilityDetail.Type;
