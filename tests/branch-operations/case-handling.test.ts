import { expect, test } from "bun:test";
import { Effect } from "effect";
import { branchCustomer } from "../../src/platform/branch-operations/application/branch-day";
import { customerProfile } from "../../src/platform/customers/application/profile";
import { submitServiceCase } from "../../src/platform/service-requests/application/service-cases";
import type {
  CaseAction,
  CaseDetail,
} from "../../src/platform/service-requests/domain/service-cases";
import { branchRoutes } from "../../src/runtime/http/routes/branch-routes";
import { createHarness } from "../customers/customer-banking.harness";

const harness = createHarness();
test("branch officer and checker handle a different customer's case without changing financial records or bypassing versions", async () => {
  const { h, source, recipientId } = await harness.twoCustomers();
  const officer = { ...source, role: "officer" as const },
    checker = { ...source, role: "approver" as const };
  const { scoped, customer } = await harness.run(
    h,
    branchCustomer(officer, recipientId),
  );
  const created = await harness.run(
    h,
    submitServiceCase(
      { ...scoped, role: "customer" },
      "email_change",
      {
        email: "branch.case@example.test",
        explanation: "Synthetic branch scoped maintenance",
      },
      "branch-owned-case-key",
    ),
  );
  const posts = h.calls.filter((c) => c.method === "POST").length;
  const action = (
    role: typeof officer | typeof checker,
    id: string,
    version: number,
    kind: CaseAction,
    customerId = recipientId,
  ) =>
    branchRoutes(
      new Request(
        `https://example.test/api/branch/service-case/action?customerId=${customerId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            version,
            action: kind,
            note: "Synthetic case reviewed for this owned customer",
          }),
        },
      ),
      role,
    );
  const read = async (effect: ReturnType<typeof action>) => {
    const response = await harness.run(h, effect);
    if (!response) throw new Error("Missing response");
    return (await response.json()) as CaseDetail;
  };
  const started = await read(
    action(officer, created.request.id, created.request.version, "start"),
  );
  expect(started.request.status).toBe("in_progress");
  expect(
    await harness.run(
      h,
      action(
        checker,
        created.request.id,
        started.request.version,
        "start",
      ).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 403 });
  const submitted = await read(
    action(
      officer,
      created.request.id,
      started.request.version,
      "submit_for_approval",
    ),
  );
  expect(
    await harness.run(
      h,
      action(
        officer,
        created.request.id,
        submitted.request.version,
        "fulfil",
      ).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 403 });
  const fulfilled = await read(
    action(checker, created.request.id, submitted.request.version, "fulfil"),
  );
  expect(fulfilled.request).toMatchObject({
    bank_id: customer.bank_id,
    status: "fulfilled",
    delivery_status: "none",
  });
  expect(fulfilled.history).toHaveLength(4);
  expect(
    (await harness.run(h, customerProfile(scoped))).profile.fields.email,
  ).toBe("branch.case@example.test");
  expect(
    await harness.run(
      h,
      action(
        checker,
        created.request.id,
        submitted.request.version,
        "fulfil",
      ).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 409 });
  expect(
    await harness.run(
      h,
      action(officer, created.request.id, 0, "start", "foreign-customer").pipe(
        Effect.flip,
      ),
    ),
  ).toMatchObject({ status: 404 });
  const foreign = await harness.run(
    h,
    submitServiceCase(
      source,
      "email_change",
      { email: "foreign@example.test", explanation: "Other scope" },
      "branch-foreign-case-key",
    ),
  );
  expect(
    await harness.run(
      h,
      action(officer, foreign.request.id, 0, "start").pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 404 });
  expect(
    await harness.run(
      h,
      branchRoutes(
        new Request(
          `https://example.test/api/branch/service-case/action?customerId=${recipientId}`,
          { method: "POST", body: "{}" },
        ),
        source,
      ).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 403 });
  expect(h.calls.filter((c) => c.method === "POST")).toHaveLength(posts);
});
