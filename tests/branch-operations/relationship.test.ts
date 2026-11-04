import { expect, test } from "bun:test";
import { Effect, Layer, Schema } from "effect";
import { Core } from "../../src/platform/banking-workspace/domain/ports";
import { branchCustomer } from "../../src/platform/branch-operations/application/branch-day";
import { relationshipEnquiry } from "../../src/platform/branch-operations/application/relationship";
import { RelationshipEnquiry } from "../../src/platform/branch-operations/domain/relationship";
import { createHarness } from "../customers/customer-banking.harness";

const harness = createHarness();
const setup = async () => {
  const { h, source, recipientId } = await harness.twoCustomers();
  const officer = { ...source, role: "officer" as const };
  const { customer } = await harness.run(
    h,
    branchCustomer(officer, recipientId),
  );
  const calls: string[] = [];
  const client = {
    id: customer.client_id,
    accountNo: `CLIENT-${customer.client_id}`,
    displayName: customer.display_name,
    status: { id: 300, value: "Active" },
    legalForm: { id: 1, value: "Person" },
    officeId: 1,
    officeName: "Synthetic office",
    active: true,
  };
  const savings: {
    id: number;
    accountNo: string;
    status: { id: number; value: string };
    currency: { code: string; decimalPlaces: number };
    accountBalance: number;
    availableBalance?: number;
  } = {
    id: customer.account_id,
    accountNo: customer.account_no,
    status: { id: 300, value: "Active" },
    currency: { code: "INR", decimalPlaces: 2 },
    accountBalance: 1000,
    availableBalance: 0,
  };
  const charge = {
    id: 7,
    name: "Recorded fee",
    currency: { code: "INR", decimalPlaces: 2 },
    amount: 12,
    amountOutstanding: 3,
    paid: false,
  };
  const layer = Layer.succeed(Core, {
    request: <T>(method: string, path: string) => {
      if (method !== "GET")
        return Effect.die("Customer enquiry dispatched a financial write");
      calls.push(path);
      let result: unknown;
      if (path === `clients/${customer.client_id}`) result = client;
      else if (path === `clients/${customer.client_id}/accounts`)
        result = { savingsAccounts: [savings] };
      else if (path === `clients/${customer.client_id}/documents`)
        result = [
          { id: 3, name: "Sample metadata", fileName: "demo.pdf", size: 8 },
        ];
      else if (path === `savingsaccounts/${customer.account_id}/charges`)
        result = [charge];
      else return Effect.die("Unexpected enquiry path");
      return Effect.succeed(result as T);
    },
  });
  const read = () =>
    harness.run(
      h,
      relationshipEnquiry(officer, recipientId).pipe(Effect.provide(layer)),
    );
  return {
    h,
    source,
    officer,
    recipientId,
    customer,
    calls,
    client,
    savings,
    charge,
    layer,
    read,
  };
};
test("customer 360 preserves zero available balance, separate sources and owned document metadata without object keys", async () => {
  const f = await setup();
  f.h.db.run(
    "INSERT INTO documents(id,bank_id,name,kind,object_key,size) VALUES(?,?,?,?,?,?)",
    [
      "owned-doc",
      f.customer.bank_id,
      "Demo identity",
      "identity",
      "private-owned",
      8,
    ],
  );
  f.h.db.run(
    "INSERT INTO documents(id,bank_id,name,kind,object_key,size) VALUES(?,?,?,?,?,?)",
    [
      "foreign-doc",
      "other",
      "Foreign identity",
      "identity",
      "private-foreign",
      8,
    ],
  );
  const evidence = await f.read();
  expect(evidence.client).toMatchObject({
    id: f.customer.client_id,
    legalForm: { value: "Person" },
  });
  expect(evidence.selectedSavings?.availableBalance).toBe(0);
  expect(evidence.selectedSavings?.accountBalance).toBe(1000);
  expect(evidence.applicationDocuments.map((d) => d.id)).toEqual(["owned-doc"]);
  expect(Object.keys(evidence.applicationDocuments[0])).not.toContain(
    "object_key",
  );
  expect(evidence.coreDocuments?.[0].name).toBe("Sample metadata");
  expect(evidence.charges?.[0].amountOutstanding).toBe(3);
  expect(evidence.nominee).toBeNull();
  expect(Schema.decodeUnknownEither(RelationshipEnquiry)(evidence)._tag).toBe(
    "Right",
  );
  expect(f.calls).toHaveLength(4);
  delete f.savings.availableBalance;
  const missing = await f.read();
  expect(missing.selectedSavings?.availableBalance).toBeUndefined();
  expect(missing.selectedSavings?.accountBalance).toBe(1000);
});
test("branch and registered-client ownership are checked before returning a native portfolio", async () => {
  const f = await setup();
  expect(
    await harness.run(
      f.h,
      relationshipEnquiry(f.source, f.recipientId).pipe(
        Effect.provide(f.layer),
        Effect.flip,
      ),
    ),
  ).toMatchObject({ status: 403 });
  expect(
    await harness.run(
      f.h,
      relationshipEnquiry(f.officer, "outside-branch").pipe(
        Effect.provide(f.layer),
        Effect.flip,
      ),
    ),
  ).toMatchObject({ status: 404 });
  expect(f.calls).toEqual([]);
  f.client.id++;
  expect(
    await harness.run(
      f.h,
      relationshipEnquiry(f.officer, f.recipientId).pipe(
        Effect.provide(f.layer),
        Effect.flip,
      ),
    ),
  ).toMatchObject({ status: 503 });
  expect(f.calls).toHaveLength(1);
});
test("portfolio account mismatch fails closed while absent optional evidence cannot invent an available balance", async () => {
  const f = await setup();
  f.savings.accountNo = "FOREIGN";
  expect(
    await harness.run(
      f.h,
      relationshipEnquiry(f.officer, f.recipientId).pipe(
        Effect.provide(f.layer),
        Effect.flip,
      ),
    ),
  ).toMatchObject({ status: 503 });
  f.savings.accountNo = f.customer.account_no;
  f.savings.currency.code = "USD";
  expect(
    await harness.run(
      f.h,
      relationshipEnquiry(f.officer, f.recipientId).pipe(
        Effect.provide(f.layer),
        Effect.flip,
      ),
    ),
  ).toMatchObject({ status: 503 });
  const absent = Layer.succeed(Core, {
    request: <T>() => Effect.succeed({} as T),
  });
  const evidence = await harness.run(
    f.h,
    relationshipEnquiry(f.officer, f.recipientId).pipe(Effect.provide(absent)),
  );
  expect(evidence.client).toBeNull();
  expect(evidence.portfolio).toBeNull();
  expect(evidence.selectedSavings).toBeNull();
  expect(evidence.errors.some((e) => e.source === "Core client")).toBe(true);
});

test("invalid portfolio monetary evidence withholds that source while preserving other Customer360 sources", async () => {
  const f = await setup();
  f.savings.accountBalance = 1.001;
  const value = await f.read();
  expect(value.portfolio).toBeNull();
  expect(value.selectedSavings).toBeNull();
  expect(value.errors).toContainEqual({
    source: "Core portfolio",
    message: "Core portfolio is unavailable or incomplete.",
  });
  expect(value.client?.id).toBe(f.customer.client_id);
  expect(value.coreDocuments?.[0].id).toBe(3);
  expect(value.charges?.[0].amount).toBe(12);
  expect(value.profile).not.toBeNull();
  f.savings.accountBalance = -12.34;
  const valid = await f.read();
  expect(valid.selectedSavings?.accountBalance).toBe(-12.34);
  expect(valid.selectedSavings?.availableBalance).toBe(0);
});
test("invalid native charge amount/precision withholds charges without erasing the valid portfolio or zero available balance", async () => {
  const f = await setup();
  f.charge.amountOutstanding = 3.001;
  const value = await f.read();
  expect(value.charges).toBeNull();
  expect(value.errors).toContainEqual({
    source: "Core charges",
    message: "Core charges is unavailable or incomplete.",
  });
  expect(value.selectedSavings?.availableBalance).toBe(0);
  expect(value.client?.id).toBe(f.customer.client_id);
  expect(value.coreDocuments?.[0].id).toBe(3);
  f.charge.amountOutstanding = 0;
  f.charge.currency.decimalPlaces = 3;
  expect((await f.read()).charges).toBeNull();
  f.charge.currency.decimalPlaces = 2;
  expect((await f.read()).charges?.[0].amountOutstanding).toBe(0);
});
