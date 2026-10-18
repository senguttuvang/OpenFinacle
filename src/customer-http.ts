import { Effect, Schema } from "effect";
import { parseJsonRequest } from "./adapters/request-json";
import { customerDashboard } from "./application/customer-dashboard";
import {
  customerDirectory,
  selectCustomerScope,
  selectedCustomer,
} from "./application/customer-registry";
import {
  confirmCustomerTransfer,
  customerTransferHistory,
  inspectCustomerTransfer,
  reviewCustomerTransfer,
} from "./application/customer-transfers";
import { BankingError, type Session } from "./domain/banking";
import {
  CustomerId,
  CustomerSelection,
  TransferConfirmation,
  TransferReview,
} from "./domain/customer-registry";
import { Store } from "./domain/ports";

// Called only after the owning router's demo-mode and same-origin checks.
export const customerRoute = (
  request: Request,
  session: Session | null,
  hash: (value: string) => Effect.Effect<string, BankingError>,
) =>
  Effect.gen(function* () {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/api/customers" && request.method === "GET")
      return Response.json({
        customers: yield* customerDirectory(url.searchParams.get("q") ?? ""),
      });
    if (path === "/api/customer-selection" && request.method === "POST") {
      const input = yield* parseJsonRequest(
        request,
        CustomerSelection,
        false,
        true,
      );
      const token = crypto.randomUUID() + crypto.randomUUID();
      const next = yield* selectCustomerScope(
        input.customerId,
        yield* hash(token),
        session,
      );
      const store = yield* Store;
      const saved = yield* store.one<{
        synced_at: number;
        invalidated_at: number;
      }>(
        "SELECT synced_at,invalidated_at FROM financial_snapshots WHERE bank_id=?",
        next.bank_id,
      );
      return Response.json(
        {
          dashboard: yield* customerDashboard(
            next,
            !saved || saved.invalidated_at > saved.synced_at,
          ),
        },
        {
          headers: {
            "Set-Cookie": `of_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=31536000`,
          },
        },
      );
    }
    if (!session)
      return yield* Effect.fail(
        new BankingError({
          message: "Select a registered customer first.",
          status: 401,
        }),
      );
    const expected = request.headers.get("X-Customer-Scope");
    if (expected !== session.bank_id)
      return yield* Effect.fail(
        new BankingError({
          message:
            "Customer selection changed. Reload before continuing this operation.",
          status: 409,
        }),
      );
    if (path === "/api/customers/recipients" && request.method === "GET")
      return Response.json({
        customers: yield* customerDirectory("", session),
      });
    if (path === "/api/customers/current" && request.method === "GET")
      return Response.json({ customer: yield* selectedCustomer(session) });
    if (path === "/api/customer-transfers/history" && request.method === "GET")
      return Response.json({
        transfers: yield* customerTransferHistory(session),
      });
    if (
      path === "/api/customer-transfers/review" &&
      request.method === "POST"
    ) {
      const input = yield* parseJsonRequest(
        request,
        TransferReview,
        false,
        true,
      );
      return Response.json(
        yield* reviewCustomerTransfer(session, input.recipientId, input.amount),
      );
    }
    if (
      path === "/api/customer-transfers/confirm" &&
      request.method === "POST"
    ) {
      const input = yield* parseJsonRequest(
        request,
        TransferConfirmation,
        false,
        true,
      );
      return Response.json(
        yield* confirmCustomerTransfer(session, input.offerId, input.key),
      );
    }
    if (
      path === "/api/customer-transfers/inspect" &&
      request.method === "POST"
    ) {
      const input = yield* parseJsonRequest(
        request,
        Schema.Union(
          Schema.Struct({ commandId: CustomerId }),
          TransferConfirmation,
        ),
        false,
        true,
      );
      let id: string;
      if ("commandId" in input) id = input.commandId;
      else {
        const store = yield* Store;
        const original = yield* store.one<{ id: string }>(
          "SELECT c.id FROM commands c JOIN customer_transfers t ON t.command_id=c.id WHERE c.bank_id=? AND c.key=? AND t.offer_id=?",
          session.bank_id,
          input.key,
          input.offerId,
        );
        if (!original)
          return yield* Effect.fail(
            new BankingError({
              message:
                "The original transfer has not been found. Do not confirm it again; inspect your saved instructions.",
              status: 409,
            }),
          );
        id = original.id;
      }
      return Response.json(yield* inspectCustomerTransfer(session, id));
    }
    return yield* Effect.fail(
      new BankingError({ message: "Customer route not found.", status: 404 }),
    );
  });
