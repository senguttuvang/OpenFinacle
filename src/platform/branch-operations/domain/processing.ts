import { Schema } from "effect";
import { CoreDateEvidence } from "./core-account";

const text = Schema.String.pipe(Schema.maxLength(300));
export const CoreScheduler = Schema.Struct({ active: Schema.Boolean });
export const CoreJobs = Schema.Array(
  Schema.Struct({
    jobId: Schema.Number.pipe(Schema.int(), Schema.positive()),
    displayName: text,
    active: Schema.Boolean,
    currentlyRunning: Schema.Boolean,
    nextRunTime: Schema.optional(text),
    lastRunHistory: Schema.optional(
      Schema.NullOr(
        Schema.Struct({
          jobRunStartTime: Schema.optional(text),
          jobRunEndTime: Schema.optional(text),
          status: text,
        }),
      ),
    ),
  }),
).pipe(
  Schema.maxItems(500),
  Schema.filter(
    (jobs) => new Set(jobs.map((j) => j.jobId)).size === jobs.length,
  ),
);
export const CoreBusinessDates = Schema.Array(
  Schema.Struct({
    type: text,
    date: CoreDateEvidence,
  }),
).pipe(
  Schema.maxItems(50),
  Schema.filter(
    (rows) => new Set(rows.map((r) => r.type)).size === rows.length,
  ),
);
export const ProcessingEvidence = Schema.Struct({
  branchId: Schema.String,
  observedAt: Schema.Number.pipe(Schema.finite()),
  scheduler: Schema.NullOr(CoreScheduler),
  jobs: Schema.NullOr(CoreJobs),
  businessDates: Schema.NullOr(CoreBusinessDates),
  errors: Schema.Array(Schema.String),
});
export type ProcessingEvidence = typeof ProcessingEvidence.Type;
