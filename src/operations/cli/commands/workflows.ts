import { Command, Options } from "@effect/cli";
import { Console, Effect } from "effect";
import { backupWorkflows, migrateWorkflows } from "../workflow-release";

export const workflows = Command.make("workflows").pipe(
  Command.withSubcommands([
    Command.make("backup", {}, () =>
      backupWorkflows.pipe(
        Effect.flatMap((directory) =>
          Console.log(`Verified workflow backup: ${directory}`),
        ),
      ),
    ),
    Command.make(
      "migrate",
      { directory: Options.text("backup-directory") },
      ({ directory }) =>
        migrateWorkflows(directory).pipe(
          Effect.flatMap(() =>
            Console.log(
              "Workflow migrations applied to the verified existing target. Keep the additive schema during application rollback.",
            ),
          ),
        ),
    ),
  ]),
);
