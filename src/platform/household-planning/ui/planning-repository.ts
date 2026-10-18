import { Effect, Schema } from "effect";
import { useEffect, useState } from "react";
import { api, setApiCustomerScope } from "../../banking-workspace/ui/api";
import type { PlanningHousehold } from "../domain/planning";
import {
  initialPlanningState,
  PlanningError,
  PlanningState,
  type PlanningState as State,
  transitionPlanningState,
  validatePlanningState,
} from "../domain/planning-state";
import { loadPlanningDevice, savePlanningDevice } from "./planning-device";

const sourceKey = "openfinacle-planning-source";
const ContextReply = Schema.Struct({
  relationship: Schema.NonEmptyString,
  readOnly: Schema.Boolean,
  role: Schema.Literal("customer", "officer"),
});
const ReadReply = Schema.Struct({
  state: Schema.Unknown,
  relationship: Schema.NonEmptyString,
  readOnly: Schema.Boolean,
  history: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      action: Schema.String,
      actor: Schema.String,
      version: Schema.Number,
      created_at: Schema.String,
    }),
  ),
});
const CommandReply = Schema.Struct({
  state: Schema.Unknown,
  relationship: Schema.NonEmptyString,
  confirmedKey: Schema.NonEmptyString,
});
const Pending = Schema.Struct({
  schema: Schema.Literal(1),
  relationship: Schema.NonEmptyString,
  household: Schema.NonEmptyString,
  key: Schema.String.pipe(Schema.pattern(/^[a-zA-Z0-9_-]{8,100}$/)),
  action: Schema.Literal("initialize", "save"),
  input: PlanningState,
});
type Pending = typeof Pending.Type;
type History = typeof ReadReply.Type.history;
const storageKey = (relationship: string, household: string) =>
  `openfinacle-planning-command-v1:${relationship}:${household}`;
const storage = <A>(operation: () => A) =>
  Effect.try({
    try: operation,
    catch: () =>
      new PlanningError({
        message:
          "Planning command storage is unavailable. Enable device storage before sending edits; original references must survive reload.",
        status: 503,
      }),
  });
const remote = <A, I>(
  schema: Schema.Schema<A, I>,
  path: string,
  body?: unknown,
  key?: string,
) =>
  api<unknown>(path, body, key).pipe(
    Effect.mapError(
      (e) => new PlanningError({ message: e.message, status: e.status }),
    ),
    Effect.flatMap((value) =>
      Schema.decodeUnknown(schema)(value).pipe(
        Effect.mapError(
          () =>
            new PlanningError({
              message:
                "The planning response could not be verified. Preserve the original command and inspect it before retrying.",
              status: 503,
            }),
        ),
      ),
    ),
  );
const path = (household: string, relationship: string, suffix = "") =>
  `/planning${suffix}?household=${encodeURIComponent(household)}&relationship=${encodeURIComponent(relationship)}`;
const read = (household: string, relationship: string) =>
  remote(ReadReply, path(household, relationship)).pipe(
    Effect.flatMap((reply) =>
      validatePlanningState(reply.state, household).pipe(
        Effect.flatMap((state) =>
          reply.relationship === relationship
            ? Effect.succeed({ ...reply, state })
            : Effect.fail(
                new PlanningError({
                  message:
                    "The response belongs to another relationship. Open the intended planning context again.",
                  status: 409,
                }),
              ),
        ),
      ),
    ),
  );
const confirm = (pending: Pending, reply: typeof CommandReply.Type) =>
  Effect.gen(function* () {
    const state = yield* validatePlanningState(reply.state, pending.household);
    const expected = {
      ...pending.input,
      version: pending.action === "save" ? pending.input.version + 1 : 0,
    };
    if (
      reply.relationship !== pending.relationship ||
      reply.confirmedKey !== pending.key ||
      JSON.stringify(state) !== JSON.stringify(expected)
    )
      return yield* Effect.fail(
        new PlanningError({
          message:
            "The saved response does not match the original relationship, command or input snapshot. Keep this reference for inspection.",
          status: 409,
        }),
      );
    yield* storage(() =>
      localStorage.removeItem(
        storageKey(pending.relationship, pending.household),
      ),
    );
    return state;
  });
export function usePlanningRepository(
  household: PlanningHousehold,
  sharedOnly = false,
) {
  const [mode, setModeValue] = useState<"device" | "shared">(
    sharedOnly ? "shared" : "device",
  );
  const [state, setState] = useState<State>(() =>
    initialPlanningState(household),
  );
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [relationship, setRelationship] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [retryAllowed, setRetryAllowed] = useState(false);
  const [missing, setMissing] = useState(false);
  const [history, setHistory] = useState<History>([]);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (sharedOnly) return;
    const result = Effect.runSync(
      Effect.either(storage(() => localStorage.getItem(sourceKey))),
    );
    if (result._tag === "Right" && result.right === "shared")
      setModeValue("shared");
  }, [sharedOnly]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: context changes deliberately clear feedback without clearing it on a status refresh.
  useEffect(() => {
    setNotice("");
  }, [household.id, mode]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload deliberately invalidates the verified server snapshot.
  useEffect(() => {
    let active = true;
    setReady(false);
    setError("");
    setRelationship("");
    setMissing(false);
    setPending(null);
    setRetryAllowed(false);
    setHistory([]);
    const load =
      mode === "device"
        ? loadPlanningDevice(household).pipe(
            Effect.map((value) => ({
              state: value,
              relationship: "",
              readOnly: false,
              pending: null as Pending | null,
              history: [] as History,
            })),
          )
        : Effect.gen(function* () {
            const context = yield* remote(ContextReply, "/planning/context");
            if (!active) return yield* Effect.interrupt;
            setApiCustomerScope(context.relationship);
            if (active) {
              setRelationship(context.relationship);
              setReadOnly(context.readOnly);
            }
            const raw = context.readOnly
              ? null
              : yield* storage(() =>
                  localStorage.getItem(
                    storageKey(context.relationship, household.id),
                  ),
                );
            const retained =
              raw === null
                ? null
                : yield* Schema.decodeUnknown(Schema.parseJson(Pending), {
                    onExcessProperty: "error",
                  })(raw).pipe(
                    Effect.mapError(
                      () =>
                        new PlanningError({
                          message:
                            "The retained planning command is unreadable or from an unsupported version. It was preserved; do not send another edit.",
                          status: 409,
                        }),
                    ),
                  );
            if (
              retained &&
              (retained.household !== household.id ||
                retained.relationship !== context.relationship)
            )
              return yield* Effect.fail(
                new PlanningError({
                  message:
                    "The retained command belongs to another context. Preserve it and open its original relationship.",
                  status: 409,
                }),
              );
            return {
              ...(yield* read(household.id, context.relationship).pipe(
                Effect.tapError((failure) =>
                  Effect.sync(() => {
                    if (active && failure.status === 404 && !context.readOnly) {
                      setMissing(true);
                      setPending(retained);
                    }
                  }),
                ),
              )),
              pending: retained,
            };
          });
    void Effect.runPromise(Effect.either(load)).then((result) => {
      if (!active) return;
      if (result._tag === "Left") {
        setError(result.left.message);
      } else {
        setState(result.right.state);
        setRelationship(result.right.relationship);
        setReadOnly(result.right.readOnly);
        setPending(result.right.pending);
        setHistory(result.right.history);
        setReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, [household, mode, reload]);
  const setMode = (value: "device" | "shared") => {
    if (sharedOnly && value !== "shared") return;
    const result = Effect.runSync(
      Effect.either(storage(() => localStorage.setItem(sourceKey, value))),
    );
    setModeValue(value);
    if (result._tag === "Left")
      setError(
        "The source choice applies for this visit. Device storage must work before any shared edit can be sent.",
      );
  };
  const submit = async (command: Pending) => {
    setBusy(true);
    setRetryAllowed(false);
    setError("");
    const result = await Effect.runPromise(
      Effect.either(
        remote(
          CommandReply,
          path(
            command.household,
            command.relationship,
            command.action === "initialize" ? "/initialize" : "",
          ),
          command.action === "save" ? command.input : {},
          command.key,
        ).pipe(Effect.flatMap((reply) => confirm(command, reply))),
      ),
    );
    setBusy(false);
    if (result._tag === "Left") {
      setError(
        `${result.left.message} Original command retained: ${command.key}. Inspect its status before retrying.`,
      );
      return false;
    }
    setState(result.right);
    setReady(true);
    setMissing(false);
    setPending(null);
    setNotice(
      `Saved on the planning server · household version ${result.right.version}`,
    );
    setReload((n) => n + 1);
    return true;
  };
  const prepare = async (input: State, action: Pending["action"]) => {
    if (busy || pending || readOnly) {
      setError(
        "Planning edits are locked during a retained command or read-only review.",
      );
      return false;
    }
    const checked = Effect.runSync(
      Effect.either(
        action === "save"
          ? transitionPlanningState(state, input)
          : validatePlanningState(input, household.id),
      ),
    );
    if (checked._tag === "Left") {
      setError(checked.left.message);
      return false;
    }
    const command: Pending = {
      schema: 1,
      relationship,
      household: household.id,
      key: crypto.randomUUID(),
      action,
      input,
    };
    const stored = Effect.runSync(
      Effect.either(
        storage(() =>
          localStorage.setItem(
            storageKey(relationship, household.id),
            JSON.stringify(command),
          ),
        ),
      ),
    );
    if (stored._tag === "Left") {
      setError(stored.left.message);
      return false;
    }
    setPending(command);
    return await submit(command);
  };
  const persist = async (proposed: State): Promise<boolean> => {
    if (!ready || busy || pending || readOnly) {
      setError(
        "Open a verified customer-owned planning context with no pending command before editing.",
      );
      return false;
    }
    if (mode === "shared") return await prepare(proposed, "save");
    const result = Effect.runSync(
      Effect.either(savePlanningDevice(state, proposed)),
    );
    if (result._tag === "Left") {
      setError(result.left.message);
      return false;
    }
    setState(result.right);
    setNotice(
      `Saved on this device · household version ${result.right.version}`,
    );
    setError("");
    return true;
  };
  const inspect = async () => {
    if (!pending || busy) return;
    setBusy(true);
    setError("");
    const result = await Effect.runPromise(
      Effect.either(
        remote(
          CommandReply,
          `${path(pending.household, pending.relationship, "/command")}&key=${encodeURIComponent(pending.key)}`,
        ).pipe(Effect.flatMap((reply) => confirm(pending, reply))),
      ),
    );
    setBusy(false);
    if (result._tag === "Left") {
      setError(result.left.message);
      setRetryAllowed(result.left.status === 404);
      return;
    }
    setPending(null);
    setState(result.right);
    setNotice(`Original command confirmed · version ${result.right.version}`);
    setReload((n) => n + 1);
  };
  const discard = () => {
    if (!pending || !retryAllowed || busy) return;
    const result = Effect.runSync(
      Effect.either(
        storage(() =>
          localStorage.removeItem(
            storageKey(pending.relationship, pending.household),
          ),
        ),
      ),
    );
    if (result._tag === "Left") {
      setError(result.left.message);
      return;
    }
    setPending(null);
    setRetryAllowed(false);
    setReload((n) => n + 1);
  };
  return {
    state,
    ready,
    busy,
    error,
    notice,
    relationship,
    readOnly,
    pending,
    retryAllowed,
    missing,
    history,
    mode,
    setMode,
    persist,
    inspect,
    discard,
    refresh: () => setReload((n) => n + 1),
    setup: () => prepare(initialPlanningState(household), "initialize"),
    retry: () =>
      pending && retryAllowed && !busy
        ? submit(pending)
        : Promise.resolve(false),
    canEdit: ready && !busy && !pending && !readOnly,
  };
}
