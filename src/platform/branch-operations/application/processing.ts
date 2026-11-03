import { Clock, Effect, Schema } from "effect";
import type { Session } from "../../banking-workspace/domain/banking";
import { Core } from "../../banking-workspace/domain/ports";
import {
  CoreBusinessDates,
  CoreJobs,
  CoreScheduler,
  type ProcessingEvidence,
} from "../domain/processing";
import { branchCustomer } from "./branch-day";

export const readProcessing = (session: Session, customerId: string) =>
  Effect.gen(function* () {
    const { branch } = yield* branchCustomer(session, customerId);
    const core = yield* Core;
    const errors: string[] = [];
    const read = <A, I>(
      name: string,
      path: string,
      schema: Schema.Schema<A, I>,
    ) =>
      core.request<unknown>("GET", path).pipe(
        Effect.flatMap(Schema.decodeUnknown(schema)),
        Effect.catchAll(() => {
          errors.push(
            `${name} is unavailable or invalid. No completion can be established from this source.`,
          );
          return Effect.succeed(null);
        }),
      );
    const [scheduler, jobs, businessDates] = yield* Effect.all(
      [
        read("Core scheduler", "scheduler", CoreScheduler),
        read("Core jobs", "jobs", CoreJobs),
        read("Core business dates", "businessdate", CoreBusinessDates),
      ],
      { concurrency: 3 },
    );
    return {
      branchId: branch,
      observedAt: yield* Clock.currentTimeMillis,
      scheduler,
      jobs,
      businessDates,
      errors,
    } satisfies ProcessingEvidence;
  });
