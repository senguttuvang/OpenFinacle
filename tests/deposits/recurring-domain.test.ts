import { expect, test } from "bun:test";
import { Effect, Schema } from "effect";
import {
  installmentState,
  normalizeRecurringTerms,
  RecurringCommand,
  RecurringDetail,
  RecurringInstallment,
  RecurringPlan,
  RecurringTerms,
  recurringActions,
  recurringMaturityMinor,
  recurringSchedule,
  recurringTransition,
} from "../../src/platform/deposits/domain/recurring-deposits";

const terms: RecurringTerms = {
  product: "demo-recurring",
  amount: 1000,
  months: 6,
  day: 15,
  label: "Example goal",
  nominee: null,
};
const timestamp = "2026-10-17T09:00:00Z";
const plan: RecurringPlan = {
  id: "recurring-example",
  bank_id: "synthetic-bank",
  terms,
  status: "submitted",
  maker: null,
  checker: null,
  activated_at: null,
  maturity_date: null,
  maturity_minor: null,
  allocated_count: 0,
  allocated_minor: 0,
  version: 0,
  created_at: timestamp,
  updated_at: timestamp,
};
const detail = (
  status: RecurringPlan["status"] = "submitted",
): RecurringDetail => ({
  plan: {
    ...plan,
    status,
    maker: status === "recommended" || status === "active" ? "officer" : null,
    checker: status === "active" ? "approver" : null,
    activated_at: status === "active" ? timestamp : null,
    maturity_date: status === "active" ? "2027-04-17" : null,
    maturity_minor: status === "active" ? 610500 : null,
  },
  installments:
    status === "active"
      ? recurringSchedule(terms, timestamp).map((item) => ({
          ...item,
          allocated_at: null,
          state: installmentState(item.due_date, null, "2026-10-17"),
        }))
      : [],
  history: [],
  actions: [],
  confirmed_key: null,
});
const command = (
  action: RecurringCommand["action"],
  period?: number,
): RecurringCommand => ({
  id: plan.id,
  version: 0,
  action,
  note: "Synthetic reviewed instruction",
  ...(period === undefined ? {} : { period }),
});
const denied = <A, E>(task: Effect.Effect<A, E>) =>
  Effect.runPromise(task.pipe(Effect.flip));

test("recurring terms reject unsupported amounts, terms, dates, extra fields and nominee data", () => {
  for (const input of [
    { ...terms, amount: 400 },
    { ...terms, amount: 550 },
    { ...terms, amount: 100100 },
    { ...terms, months: 5 },
    { ...terms, months: 7 },
    { ...terms, months: 123 },
    { ...terms, months: 6.5 },
    { ...terms, day: 0 },
    { ...terms, day: 29 },
    { ...terms, rate: 15 },
    { ...terms, nominee: { name: "X", relationship: "parent" } },
  ])
    expect(
      Schema.decodeUnknownEither(RecurringTerms, { onExcessProperty: "error" })(
        input,
      )._tag,
    ).toBe("Left");
  expect(
    Schema.decodeUnknownEither(RecurringTerms)({
      ...terms,
      amount: 500,
      months: 120,
      day: 28,
    })._tag,
  ).toBe("Right");
  expect(
    Schema.decodeUnknownEither(RecurringPlan)({ ...plan, allocated_minor: -1 })
      ._tag,
  ).toBe("Left");
  expect(
    Schema.decodeUnknownEither(RecurringCommand)({
      ...command("allocate", 1),
      version: -1,
    })._tag,
  ).toBe("Left");
});
test("schedule fixes the first Indian banking date, selected later days and a deterministic simple-interest illustration", () => {
  const schedule = recurringSchedule(
    { ...terms, day: 28 },
    "2023-12-31T19:00:00Z",
  );
  expect(schedule).toHaveLength(6);
  expect(schedule.map((item) => item.due_date)).toEqual([
    "2024-01-01",
    "2024-02-28",
    "2024-03-28",
    "2024-04-28",
    "2024-05-28",
    "2024-06-28",
  ]);
  expect(schedule.map((item) => item.period)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(schedule.every((item) => item.amount_minor === 100000)).toBe(true);
  expect(recurringMaturityMinor(terms)).toBe(610500);
  expect(recurringMaturityMinor({ ...terms, amount: 500, months: 6 })).toBe(
    305250,
  );
  expect(recurringMaturityMinor({ ...terms, months: 12 })).toBe(1239000);
});
test("nominee/goal normalization preserves canonical command identity and rejects blank adult names", async () => {
  expect(
    await Effect.runPromise(
      normalizeRecurringTerms({
        ...terms,
        label: "  Example goal  ",
        nominee: { name: "  Example Parent  ", relationship: "parent" },
      }),
    ),
  ).toMatchObject({
    label: "Example goal",
    nominee: { name: "Example Parent", relationship: "parent" },
  });
  expect(
    await denied(
      normalizeRecurringTerms({
        ...terms,
        nominee: { name: "   ", relationship: "parent" },
      }),
    ),
  ).toMatchObject({ status: 400 });
});
test("independent recommendation/activation creates an explicit schedule and never allocates implicitly", async () => {
  const submitted = detail();
  expect(recurringActions(submitted.plan, [], "customer")).toEqual(["cancel"]);
  expect(recurringActions(submitted.plan, [], "officer")).toEqual([
    "recommend",
    "reject",
  ]);
  expect(
    await denied(
      recurringTransition(
        submitted,
        "approver",
        command("activate"),
        timestamp,
      ),
    ),
  ).toMatchObject({ status: 403 });
  const recommendation = await Effect.runPromise(
    recurringTransition(submitted, "officer", command("recommend"), timestamp),
  );
  expect(recommendation).toMatchObject({
    status: "recommended",
    maker: "officer",
    checker: null,
    schedule: null,
    activated_at: null,
  });
  const recommended = detail("recommended");
  expect(
    recurringActions({ ...recommended.plan, maker: null }, [], "approver"),
  ).toEqual([]);
  expect(
    await denied(
      recurringTransition(
        recommended,
        "officer",
        command("activate"),
        timestamp,
      ),
    ),
  ).toMatchObject({ status: 403 });
  const activated = await Effect.runPromise(
    recurringTransition(
      recommended,
      "approver",
      command("activate"),
      timestamp,
    ),
  );
  expect(activated).toMatchObject({
    status: "active",
    maker: "officer",
    checker: "approver",
    activated_at: timestamp,
    maturity_date: "2027-04-17",
    maturity_minor: 610500,
  });
  expect(activated.schedule).toHaveLength(6);
  expect(recommended.plan.allocated_count).toBe(0);
  expect(recommended.installments).toEqual([]);
});
test("due/missed/upcoming are clock-derived read states and allocated periods retain their history", () => {
  expect(installmentState("2026-10-17", null, "2026-10-16")).toBe("upcoming");
  expect(installmentState("2026-10-17", null, "2026-10-17")).toBe("due");
  expect(installmentState("2026-10-17", null, "2026-10-18")).toBe("missed");
  expect(installmentState("2026-10-17", timestamp, "2026-10-18")).toBe(
    "allocated",
  );
  expect(
    Schema.decodeUnknownEither(RecurringInstallment)({
      period: 1,
      due_date: "2026-10-17",
      amount_minor: 100000,
      allocated_at: null,
      state: "missed",
    })._tag,
  ).toBe("Right");
});
test("only the customer may allocate the earliest due period, without changing original terms or activation", async () => {
  const active = detail("active");
  expect(
    recurringActions(active.plan, active.installments, "customer"),
  ).toEqual(["allocate"]);
  expect(recurringActions(active.plan, active.installments, "officer")).toEqual(
    [],
  );
  expect(
    await denied(
      recurringTransition(active, "officer", command("allocate", 1), timestamp),
    ),
  ).toMatchObject({ status: 403 });
  expect(
    await denied(
      recurringTransition(
        active,
        "customer",
        command("allocate", 2),
        timestamp,
      ),
    ),
  ).toMatchObject({ status: 409 });
  expect(
    await denied(
      recurringTransition(active, "customer", command("allocate"), timestamp),
    ),
  ).toMatchObject({ status: 400 });
  const next = await Effect.runPromise(
    recurringTransition(active, "customer", command("allocate", 1), timestamp),
  );
  expect(next).toEqual({
    status: "active",
    maker: "officer",
    checker: "approver",
    activated_at: timestamp,
    maturity_date: "2027-04-17",
    maturity_minor: 610500,
    schedule: null,
  });
  const later = {
    ...active,
    installments: active.installments.map((item, index) =>
      index === 0
        ? { ...item, state: "allocated" as const, allocated_at: timestamp }
        : item,
    ),
  };
  expect(recurringActions(later.plan, later.installments, "customer")).toEqual(
    [],
  );
  expect(active.plan.terms).toEqual(terms);
  expect(Schema.decodeUnknownEither(RecurringDetail)(active)._tag).toBe(
    "Right",
  );
});
test("stale/terminal/irrelevant commands fail explicitly; rejection/cancellation never activate or schedule", async () => {
  expect(
    await denied(
      recurringTransition(
        detail(),
        "officer",
        { ...command("recommend"), version: 1 },
        timestamp,
      ),
    ),
  ).toMatchObject({ status: 409 });
  expect(
    await denied(
      recurringTransition(
        detail(),
        "officer",
        command("recommend", 1),
        timestamp,
      ),
    ),
  ).toMatchObject({ status: 400 });
  expect(
    await denied(
      recurringTransition(
        detail(),
        "officer",
        { ...command("recommend"), note: "     " },
        timestamp,
      ),
    ),
  ).toMatchObject({ status: 400 });
  for (const status of ["cancelled", "rejected"] as const) {
    const closed = detail(status);
    expect(recurringActions(closed.plan, [], "customer")).toEqual([]);
    expect(
      await denied(
        recurringTransition(closed, "approver", command("activate"), timestamp),
      ),
    ).toMatchObject({ status: 403 });
  }
  expect(
    await Effect.runPromise(
      recurringTransition(detail(), "customer", command("cancel"), timestamp),
    ),
  ).toMatchObject({ status: "cancelled", activated_at: null, schedule: null });
  expect(
    await Effect.runPromise(
      recurringTransition(
        detail("recommended"),
        "approver",
        command("reject"),
        timestamp,
      ),
    ),
  ).toMatchObject({
    status: "rejected",
    checker: "approver",
    activated_at: null,
    schedule: null,
  });
});
