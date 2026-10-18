import { Effect, Schema } from "effect";
import { BankingError } from "../../platform/banking-workspace/domain/banking";
import {
  customerSeedStatus,
  inspectCustomerSeed,
  prepareCustomerManifest,
  resumeCustomerSeed,
} from "./customer-provisioning";

export const CustomerAdminCommand = Schema.Struct({
  action: Schema.Literal("status", "prepare", "resume", "inspect"),
  branchId: Schema.String.pipe(Schema.pattern(/^[a-zA-Z0-9_-]{1,100}$/)),
  customerId: Schema.String.pipe(Schema.maxLength(100)),
  start: Schema.Number.pipe(Schema.int(), Schema.between(1, 100)),
  limit: Schema.Number.pipe(Schema.int(), Schema.between(1, 10)),
  maxStages: Schema.Number.pipe(Schema.int(), Schema.between(1, 5)),
});
export const runCustomerAdmin = (command: typeof CustomerAdminCommand.Type) =>
  Effect.gen(function* () {
    if (command.action === "prepare")
      return yield* prepareCustomerManifest(command.branchId);
    if (command.action === "resume")
      return yield* resumeCustomerSeed(
        command.branchId,
        command.start,
        command.limit,
        command.maxStages,
      );
    if (command.action === "inspect") {
      const status = yield* customerSeedStatus(command.branchId);
      if (!status.customers.some((row) => row.id === command.customerId))
        return yield* Effect.fail(
          new BankingError({
            message: "Inspect a manifest customer in the original branch.",
            status: 404,
          }),
        );
      return yield* inspectCustomerSeed(command.customerId);
    }
    return yield* customerSeedStatus(command.branchId);
  });
