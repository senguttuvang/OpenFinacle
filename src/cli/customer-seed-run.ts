import { Effect, Schema } from "effect";

const Status = Schema.Struct({
  branch_id: Schema.String,
  customers: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      ordinal: Schema.Number.pipe(Schema.int(), Schema.between(1, 100)),
    }),
  ),
  operations: Schema.Array(
    Schema.Struct({
      seed_id: Schema.String,
      stage: Schema.String,
      status: Schema.Literal("executing", "uncertain", "confirmed", "failed"),
    }),
  ),
  registered_customers: Schema.Array(Schema.Struct({ id: Schema.String })),
});
const decode = (input: unknown, branch: string) =>
  Schema.decodeUnknown(Status)(input).pipe(
    Effect.filterOrFail(
      (value) => value.branch_id === branch,
      () => new Error("The seed status belongs to a different branch."),
    ),
    Effect.mapError(
      () =>
        new Error(
          "The original branch seed status could not be verified. Inspect it before advancing.",
        ),
    ),
  );
export const runCustomerSeed = <R>(
  call: (command: unknown) => Effect.Effect<unknown, Error, R>,
  branchId: string,
  stageBudget: number,
  customerBudget: number,
  perRequestStages: number,
  secondsBudget = 300,
) => {
  if (
    !Number.isSafeInteger(secondsBudget) ||
    secondsBudget < 1 ||
    secondsBudget > 7200
  )
    return Effect.fail(
      new Error(
        "Choose an overall --seconds-budget between1 and7200. Timeout stops the run for original-stage inspection.",
      ),
    );
  return Effect.gen(function* () {
    if (
      ![stageBudget, customerBudget, perRequestStages].every(
        Number.isSafeInteger,
      ) ||
      stageBudget < 1 ||
      stageBudget > 495 ||
      customerBudget < 1 ||
      customerBudget > 99 ||
      perRequestStages < 1 ||
      perRequestStages > 5
    )
      return yield* Effect.fail(
        new Error(
          "Use --stage-budget 1–495, --customer-budget 1–99 and --max-stages 1–5. Budgets bound the entire run; uncertain originals stop it.",
        ),
      );
    const command = {
      branchId,
      customerId: "",
      start: 1,
      limit: 1,
      maxStages: perRequestStages,
    };
    let status = yield* call({ ...command, action: "status" }).pipe(
      Effect.flatMap((value) => decode(value, branchId)),
    );
    if (status.customers.length < 99)
      status = yield* call({ ...command, action: "prepare" }).pipe(
        Effect.flatMap((value) => decode(value, branchId)),
      );
    if (
      status.customers.length !== 99 ||
      new Set(status.customers.map((row) => row.id)).size !== 99 ||
      new Set(status.customers.map((row) => row.ordinal)).size !== 99 ||
      status.customers.some((row) => row.ordinal > 99)
    )
      return yield* Effect.fail(
        new Error(
          "The complete 99-person additive manifest could not be verified. Inspect preparation before advancing any Core stage.",
        ),
      );
    let advanced = 0,
      completed = 0,
      requests = 0;
    while (advanced < stageBudget && completed < customerBudget) {
      if (
        status.operations.some((operation) => operation.status !== "confirmed")
      )
        return yield* Effect.fail(
          new Error(
            "An original seed stage is executing, uncertain or failed. Inspect that original; the run stopped without retrying or moving to another identity.",
          ),
        );
      const registered = new Set(
        status.registered_customers.map((row) => row.id),
      );
      const next = status.customers.find((row) => !registered.has(row.id));
      if (!next) break;
      const before = status.operations.filter(
        (operation) => operation.status === "confirmed",
      ).length;
      const previousRegistered = registered.size;
      status = yield* call({
        ...command,
        action: "resume",
        start: next.ordinal,
        maxStages: Math.min(perRequestStages, stageBudget - advanced),
      }).pipe(Effect.flatMap((value) => decode(value, branchId)));
      requests++;
      if (
        status.operations.some((operation) => operation.status !== "confirmed")
      )
        return yield* Effect.fail(
          new Error(
            "A seed stage is unresolved. Inspect its saved original reference; no operation was retried.",
          ),
        );
      const delta =
        status.operations.filter(
          (operation) => operation.status === "confirmed",
        ).length - before;
      const newCustomers =
        status.registered_customers.length - previousRegistered;
      if (
        delta < 0 ||
        delta > Math.min(perRequestStages, stageBudget - advanced) ||
        newCustomers < 0 ||
        newCustomers > 1 ||
        (delta === 0 && newCustomers === 0)
      )
        return yield* Effect.fail(
          new Error(
            "The original seed run did not prove bounded forward progress. Inspect its status before continuing.",
          ),
        );
      advanced += delta;
      completed += newCustomers;
    }
    return {
      branch_id: branchId,
      advanced_stages: advanced,
      completed_customers: completed,
      http_progress_requests: requests,
      registered_customers: status.registered_customers.length,
      target_customers: status.customers.length + 1,
      complete: status.registered_customers.length === status.customers.length,
    };
  }).pipe(
    Effect.timeoutFail({
      duration: `${secondsBudget} seconds`,
      onTimeout: () =>
        new Error(
          "The overall seed time budget expired. Inspect the original saved stage before resuming; no request was retried.",
        ),
    }),
  );
};
