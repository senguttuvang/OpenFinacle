import { afterEach, expect, test } from "bun:test";
import { Effect, Schema } from "effect";
import {
  CustomerAdminCommand,
  runCustomerAdmin,
} from "../src/application/customer-admin";
import { runCustomerSeed } from "../src/cli/customer-seed-run";
import { customerHarness } from "./fixtures/customer-banking";

const fixtures: ReturnType<typeof customerHarness>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.db.close();
});
const setup = () => {
  const h = customerHarness();
  fixtures.push(h);
  const commands: (typeof CustomerAdminCommand.Type)[] = [];
  const call = (input: unknown) =>
    Schema.decodeUnknown(CustomerAdminCommand)(input).pipe(
      Effect.flatMap((command) => {
        commands.push(command);
        return runCustomerAdmin(command);
      }),
      Effect.provide(h.layer),
      Effect.mapError(
        () =>
          new Error("Original admin request failed; inspect its saved status."),
      ),
    );
  return { h, call, commands };
};
test("native seed run advances bounded known-success HTTP stages then resumes to100 without duplicated funding", async () => {
  const { h, call, commands } = setup();
  const first = await Effect.runPromise(
    runCustomerSeed(call, "branch", 2, 2, 1),
  );
  expect(first).toMatchObject({
    advanced_stages: 2,
    completed_customers: 0,
    target_customers: 100,
    complete: false,
  });
  const rest = await Effect.runPromise(
    runCustomerSeed(call, "branch", 493, 99, 5),
  );
  expect(rest).toMatchObject({
    advanced_stages: 493,
    completed_customers: 99,
    registered_customers: 99,
    target_customers: 100,
    complete: true,
  });
  expect(
    commands
      .filter((command) => command.action === "resume")
      .every(
        (command) =>
          command.limit === 1 &&
          command.maxStages >= 1 &&
          command.maxStages <= 5,
      ),
  ).toBe(true);
  expect(h.calls.filter((call) => call.method === "POST")).toHaveLength(495);
  const repeated = await Effect.runPromise(
    runCustomerSeed(call, "branch", 495, 99, 5),
  );
  expect(repeated).toMatchObject({
    advanced_stages: 0,
    http_progress_requests: 0,
    complete: true,
  });
  expect(h.calls.filter((call) => call.method === "POST")).toHaveLength(495);
});
test("native runner stops on lost original response and refuses any automatic retry on resume", async () => {
  const { h, call, commands } = setup();
  h.loseResponse("clients");
  await Effect.runPromise(
    runCustomerSeed(call, "branch", 10, 2, 1).pipe(Effect.flip),
  );
  const requests = commands.filter(
    (command) => command.action === "resume",
  ).length;
  const error = await Effect.runPromise(
    runCustomerSeed(call, "branch", 10, 2, 1).pipe(Effect.flip),
  );
  expect(error.message).toContain("original seed stage");
  expect(
    commands.filter((command) => command.action === "resume"),
  ).toHaveLength(requests);
  expect(h.calls.filter((call) => call.method === "POST")).toHaveLength(1);
});
test("native runner enforces its overall time budget without retrying a hung request", async () => {
  let calls = 0;
  const call = () =>
    Effect.sync(() => {
      calls++;
    }).pipe(Effect.zipRight(Effect.never));
  const error = await Effect.runPromise(
    runCustomerSeed(call, "branch", 5, 1, 1, 1).pipe(Effect.flip),
  );
  expect(error.message).toContain("overall seed time budget expired");
  expect(calls).toBe(1);
});
