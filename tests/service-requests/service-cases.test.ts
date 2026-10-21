import { expect, test } from "bun:test";
import {
  listServiceCases,
  serviceCase,
  serviceCaseForKey,
  submitServiceCase,
} from "../../src/platform/service-requests/application/service-cases";
import { createHarness } from "./service-cases.harness";

const harness = await createHarness();
test("case submission is persistent and idempotent without duplicate history or audit", async () => {
  const first = await harness.run(harness.submit());
  const repeat = await harness.run(harness.submit());
  expect(repeat.request.id).toBe(first.request.id);
  expect(
    (
      await harness.run(
        serviceCaseForKey(harness.customer, "case-request-key-one"),
      )
    ).request.id,
  ).toBe(first.request.id);
  expect(
    await harness.denied(
      serviceCaseForKey(
        { ...harness.customer, bank_id: "other-bank" },
        "case-request-key-one",
      ),
    ),
  ).toMatchObject({ status: 404 });
  expect(first.request).toMatchObject({
    status: "open",
    version: 0,
    delivery_status: "pending",
    kind: "chequebook",
  });
  expect(
    first.history.map((e) => ({ actor: e.actor, to: e.to_status })),
  ).toEqual([{ actor: "customer", to: "open" }]);
  expect(
    harness.db.query("SELECT COUNT(*) AS n FROM service_requests").get(),
  ).toEqual({
    n: 1,
  });
  expect(harness.db.query("SELECT COUNT(*) AS n FROM audit").get()).toEqual({
    n: 1,
  });
  expect(
    await harness.denied(
      harness.submit("chequebook", { ...harness.cheque, leaves: "50" }),
    ),
  ).toMatchObject({ status: 409 });
  expect(
    (await harness.run(serviceCase(harness.customer, first.request.id)))
      .history,
  ).toHaveLength(1);
});

test("only customers with an opened account and valid fields can create a case", async () => {
  expect(
    await harness.denied(
      submitServiceCase(
        harness.officer,
        "chequebook",
        harness.cheque,
        "officer-request-key",
      ),
    ),
  ).toMatchObject({ status: 403 });
  expect(
    await harness.denied(
      submitServiceCase(
        { ...harness.customer, bank_id: "unopened" },
        "chequebook",
        harness.cheque,
        "unopened-request-key",
      ),
    ),
  ).toMatchObject({ status: 409 });
  expect(
    await harness.denied(harness.submit("not-a-service", {})),
  ).toMatchObject({
    status: 400,
  });
  expect(
    await harness.denied(harness.submit("chequebook", harness.cheque, "")),
  ).toMatchObject({
    status: 400,
  });
  expect(
    await harness.denied(
      harness.submit("address_change", {
        ...harness.address,
        status: "fulfilled",
      }),
    ),
  ).toMatchObject({ status: 400 });
  expect(
    harness.db.query("SELECT COUNT(*) AS n FROM service_requests").get(),
  ).toEqual({
    n: 0,
  });
});

test("routine requests progress through processing, fulfilment and separate delivery", async () => {
  const { request } = await harness.run(harness.submit());
  expect(
    await harness.denied(harness.action(harness.officer, request.id, "fulfil")),
  ).toMatchObject({
    status: 403,
  });
  expect(
    (await harness.run(harness.action(harness.officer, request.id, "start")))
      .request,
  ).toMatchObject({ status: "in_progress", version: 1 });
  expect(
    await harness.denied(
      harness.action(harness.customer, request.id, "fulfil"),
    ),
  ).toMatchObject({
    status: 403,
  });
  const completed = await harness.run(
    harness.action(harness.officer, request.id, "fulfil"),
  );
  expect(completed.request).toMatchObject({
    status: "fulfilled",
    delivery_status: "ready_for_collection",
    version: 2,
  });
  const delivered = await harness.run(
    harness.action(harness.officer, request.id, "record_delivery"),
  );
  expect(delivered.request).toMatchObject({
    status: "fulfilled",
    delivery_status: "delivered",
    version: 3,
  });
  expect(delivered.history.map((e) => e.delivery_status)).toEqual([
    "pending",
    "pending",
    "ready_for_collection",
    "delivered",
  ]);
  expect(
    await harness.denied(
      harness.action(harness.officer, request.id, "record_delivery"),
    ),
  ).toMatchObject({ status: 403 });
  expect(
    await harness.denied(
      harness.action(harness.customer, request.id, "cancel"),
    ),
  ).toMatchObject({
    status: 403,
  });
});

test("sensitive maintenance requires independent approval and supports return for review", async () => {
  const { request } = await harness.run(
    harness.submit("address_change", harness.address),
  );
  await harness.run(harness.action(harness.officer, request.id, "start"));
  expect(
    await harness.denied(harness.action(harness.officer, request.id, "fulfil")),
  ).toMatchObject({
    status: 403,
  });
  expect(
    await harness.denied(
      harness.action(harness.approver, request.id, "fulfil"),
    ),
  ).toMatchObject({
    status: 403,
  });
  await harness.run(
    harness.action(harness.officer, request.id, "submit_for_approval"),
  );
  expect(
    (await harness.run(serviceCase(harness.officer, request.id))).actions,
  ).toEqual([]);
  expect(
    (await harness.run(serviceCase(harness.approver, request.id))).actions,
  ).toEqual(["fulfil", "return_for_review", "reject"]);
  expect(
    await harness.denied(harness.action(harness.officer, request.id, "fulfil")),
  ).toMatchObject({
    status: 403,
  });
  expect(
    await harness.denied(
      harness.action(harness.customer, request.id, "fulfil"),
    ),
  ).toMatchObject({
    status: 403,
  });
  await harness.run(
    harness.action(
      harness.approver,
      request.id,
      "return_for_review",
      "Review the supplied address proof",
    ),
  );
  expect(harness.row(request.id).status).toBe("in_progress");
  await harness.run(
    harness.action(harness.officer, request.id, "submit_for_approval"),
  );
  const completed = await harness.run(
    harness.action(harness.approver, request.id, "fulfil"),
  );
  expect(completed.request).toMatchObject({
    status: "fulfilled",
    version: 5,
    updated_by: "approver",
    delivery_status: "none",
  });
  expect(completed.history.map((e) => e.actor)).toEqual([
    "customer",
    "officer",
    "officer",
    "approver",
    "officer",
    "approver",
  ]);
});

test("information requests preserve original submission identity and revised field history", async () => {
  const { request } = await harness.run(
    harness.submit("address_change", harness.address),
  );
  await harness.run(
    harness.action(
      harness.officer,
      request.id,
      "request_information",
      "Please confirm your revised address",
    ),
  );
  expect(
    await harness.denied(
      harness.action(
        harness.officer,
        request.id,
        "provide_information",
        "Updated details",
        harness.address,
      ),
    ),
  ).toMatchObject({ status: 403 });
  const revised = { ...harness.address, address: "28 Example Avenue" };
  const updated = await harness.run(
    harness.action(
      harness.customer,
      request.id,
      "provide_information",
      "Address corrected as requested",
      revised,
    ),
  );
  expect(updated.request.status).toBe("open");
  expect(JSON.parse(updated.request.payload)).toEqual(revised);
  expect(JSON.parse(updated.request.submitted_payload)).toEqual(
    harness.address,
  );
  expect(updated.request.detail).toContain("28 Example Avenue");
  expect(JSON.parse(updated.history[0].payload)).toEqual(harness.address);
  expect(JSON.parse(updated.history[2].payload)).toEqual(revised);
  expect(
    (await harness.run(harness.submit("address_change", harness.address)))
      .request.id,
  ).toBe(request.id);
  expect(
    await harness.denied(harness.submit("address_change", revised)),
  ).toMatchObject({
    status: 409,
  });
});

test("case ownership, terminal state and version guards prevent unauthorized changes", async () => {
  const { request } = await harness.run(harness.submit());
  const foreign = { ...harness.customer, bank_id: "other-bank" };
  expect(await harness.denied(serviceCase(foreign, request.id))).toMatchObject({
    status: 404,
  });
  expect(
    await harness.denied(
      harness.action(
        { ...harness.officer, bank_id: "other-bank" },
        request.id,
        "start",
      ),
    ),
  ).toMatchObject({ status: 404 });
  expect(
    (await harness.run(listServiceCases(foreign, 0, ""))).requests,
  ).toEqual([]);
  expect(
    await harness.denied(
      harness.action(harness.officer, request.id, "reject", "no"),
    ),
  ).toMatchObject({ status: 400 });
  expect(
    await harness.denied(
      harness.action(
        harness.officer,
        request.id,
        "start",
        "Valid note",
        undefined,
        -1,
      ),
    ),
  ).toMatchObject({ status: 400 });
  await harness.run(harness.action(harness.officer, request.id, "start"));
  expect(
    await harness.denied(
      harness.action(
        harness.officer,
        request.id,
        "request_information",
        "Provide more information",
        undefined,
        0,
      ),
    ),
  ).toMatchObject({ status: 409 });
  await harness.run(
    harness.action(
      harness.officer,
      request.id,
      "reject",
      "The request is not eligible",
    ),
  );
  expect(harness.row(request.id).status).toBe("rejected");
  expect(
    await harness.denied(harness.action(harness.officer, request.id, "start")),
  ).toMatchObject({
    status: 403,
  });
  expect(
    (await harness.run(serviceCase(harness.customer, request.id))).history,
  ).toHaveLength(3);
});

test("customers can cancel eligible requests without leaving a pending delivery", async () => {
  const { request } = await harness.run(harness.submit());
  expect(
    await harness.denied(
      harness.action(harness.customer, request.id, "cancel", "x".repeat(501)),
    ),
  ).toMatchObject({ status: 400 });
  const cancelled = await harness.run(
    harness.action(
      harness.customer,
      request.id,
      "cancel",
      "This request is no longer needed",
    ),
  );
  expect(cancelled.request).toMatchObject({
    status: "cancelled",
    delivery_status: "cancelled",
    version: 1,
  });
  expect(
    await harness.denied(harness.action(harness.officer, request.id, "start")),
  ).toMatchObject({
    status: 403,
  });
  expect(cancelled.history).toHaveLength(2);
});

test("a competing writer between read and update is not overwritten", async () => {
  const { request } = await harness.run(harness.submit());
  harness.interfere = () =>
    harness.db.run(
      "UPDATE service_requests SET status='in_progress',version=version+1,updated_by='officer',outcome_note='Another operator started processing' WHERE id=?",
      [request.id],
    );
  expect(
    await harness.denied(harness.action(harness.officer, request.id, "start")),
  ).toMatchObject({
    status: 409,
  });
  expect(harness.row(request.id)).toMatchObject({
    status: "in_progress",
    version: 1,
    outcome_note: "Another operator started processing",
  });
  expect(
    (await harness.run(serviceCase(harness.customer, request.id))).history,
  ).toHaveLength(2);
});

test("failure to append history rolls back the case transition and audit", async () => {
  const { request } = await harness.run(harness.submit());
  harness.db.exec(
    "CREATE TRIGGER fail_case_history BEFORE INSERT ON service_case_events WHEN NEW.to_status='in_progress' BEGIN SELECT RAISE(ABORT,'Injected history failure'); END;",
  );
  expect(
    await harness.denied(harness.action(harness.officer, request.id, "start")),
  ).toMatchObject({
    status: 503,
  });
  expect(harness.row(request.id)).toMatchObject({ status: "open", version: 0 });
  expect(
    (await harness.run(serviceCase(harness.customer, request.id))).history,
  ).toHaveLength(1);
  expect(harness.db.query("SELECT COUNT(*) AS n FROM audit").get()).toEqual({
    n: 1,
  });
});

test("storage rejects unversioned managed writes and changes to submission identity", async () => {
  const { request } = await harness.run(harness.submit());
  expect(() =>
    harness.db.run(
      "UPDATE service_requests SET status='fulfilled' WHERE id=?",
      [request.id],
    ),
  ).toThrow("Managed service cases require a versioned update");
  expect(() =>
    harness.db.run(
      "UPDATE service_requests SET submitted_payload='{}',version=version+1 WHERE id=?",
      [request.id],
    ),
  ).toThrow("The service case submission identity is immutable");
  expect(harness.row(request.id)).toMatchObject({ status: "open", version: 0 });
  expect(
    (await harness.run(serviceCase(harness.customer, request.id))).history,
  ).toHaveLength(1);
});

test("request listing is scoped, paginated and treats search wildcards literally", async () => {
  for (let i = 0; i < 27; i++)
    await harness.run(
      harness.submit("chequebook", harness.cheque, `request-page-key-${i}`),
    );
  const page = await harness.run(listServiceCases(harness.customer, 0, ""));
  expect(page).toMatchObject({ total: 27, limit: 25, offset: 0 });
  expect(page.requests).toHaveLength(25);
  const reference = `SR-${page.requests[0].id.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
  expect(
    (
      await harness.run(listServiceCases(harness.customer, 0, reference))
    ).requests.map((record) => record.id),
  ).toEqual([page.requests[0].id]);
  expect(
    (
      await harness.run(
        listServiceCases(harness.customer, 0, reference.toLowerCase(), true),
      )
    ).total,
  ).toBe(1);
  expect(
    (
      await harness.run(
        listServiceCases(
          { ...harness.customer, bank_id: "other-bank" },
          0,
          reference,
        ),
      )
    ).total,
  ).toBe(0);
  expect(
    (await harness.run(listServiceCases(harness.customer, 0, "--"))).total,
  ).toBe(0);
  expect(
    (await harness.run(listServiceCases(harness.customer, 0, "SR-%"))).total,
  ).toBe(0);
  expect(
    (await harness.run(listServiceCases(harness.customer, 25, ""))).requests,
  ).toHaveLength(2);
  expect(
    (await harness.run(listServiceCases(harness.customer, 0, "cheque"))).total,
  ).toBe(27);
  await harness.run(
    harness.submit(
      "email_change",
      { email: "sample@example.test", explanation: "Synthetic email update" },
      "non-delivery-request",
    ),
  );
  const deliveries = await harness.run(
    listServiceCases(harness.customer, 0, "", true),
  );
  expect(deliveries.total).toBe(27);
  expect(
    deliveries.requests.every((record) => record.delivery_status === "pending"),
  ).toBe(true);
  expect(
    (await harness.run(listServiceCases(harness.customer, 25, "", true)))
      .requests,
  ).toHaveLength(2);
  expect(
    (await harness.run(listServiceCases(harness.customer, 0, "email", true)))
      .total,
  ).toBe(0);
  expect(
    (await harness.run(listServiceCases(harness.customer, 0, "%"))).total,
  ).toBe(0);
  expect(
    (await harness.run(listServiceCases(harness.customer, 0, "_"))).total,
  ).toBe(1);
  expect(
    await harness.denied(listServiceCases(harness.customer, -1, "")),
  ).toMatchObject({
    status: 400,
  });
});
