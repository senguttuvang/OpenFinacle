import { expect, test } from "bun:test";
import { Effect } from "effect";
import { branchCustomer } from "../../src/platform/branch-operations/application/branch-day";
import { branchRoutes } from "../../src/runtime/http/routes/branch-routes";
import { createHarness } from "../customers/customer-banking.harness";

const harness = createHarness();
test("branch service timeline preserves customer ownership and exposes only permitted staff actions", async () => {
  const { h, source, recipientId } = await harness.twoCustomers();
  const officer = { ...source, role: "officer" as const };
  const { customer } = await harness.run(
    h,
    branchCustomer(officer, recipientId),
  );
  h.db.run(
    "INSERT INTO service_requests(id,bank_id,kind,detail,status,request_key) VALUES(?,?,?,?,?,?)",
    [
      "owned-case",
      customer.bank_id,
      "address_change",
      "Saved synthetic request",
      "open",
      "owned-stable-request-key",
    ],
  );
  h.db.run(
    "INSERT INTO service_requests(id,bank_id,kind,detail,status,request_key) VALUES(?,?,?,?,?,?)",
    [
      "foreign-case",
      source.bank_id,
      "address_change",
      "Private foreign request",
      "open",
      "foreign-stable-request-key",
    ],
  );
  const read = (customerId: string, id: string, session = officer) =>
    branchRoutes(
      new Request(
        `https://example.test/api/branch/service-case?customerId=${customerId}&id=${id}`,
      ),
      session,
    );
  const response = await harness.run(h, read(recipientId, "owned-case"));
  expect(response?.status).toBe(200);
  expect(await response?.json()).toMatchObject({
    request: { id: "owned-case", detail: "Saved synthetic request" },
    actions: ["start", "request_information", "reject"],
  });
  expect(
    await harness.run(h, read(recipientId, "foreign-case").pipe(Effect.flip)),
  ).toMatchObject({ status: 404 });
  expect(
    await harness.run(
      h,
      read("foreign-customer", "foreign-case").pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 404 });
  expect(
    await harness.run(
      h,
      branchRoutes(
        new Request(
          `https://example.test/api/branch/service-case?customerId=${recipientId}&id=owned-case`,
        ),
        source,
      ).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 403 });
});
