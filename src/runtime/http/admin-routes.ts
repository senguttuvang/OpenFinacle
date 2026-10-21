import { getContainer } from "@cloudflare/containers";
import { Effect, Schema } from "effect";
import {
  CustomerAdminCommand,
  runCustomerAdmin,
} from "../../demo/customers/customer-admin";
import { runLoanPilot } from "../../demo/lending/loan-pilot";
import { runRepaymentPilot } from "../../demo/lending/loan-repayment-pilot";
import { previewDemoLoan } from "../../demo/scenarios/demo-loan-quote";
import { prepareScenario } from "../../demo/scenarios/demo-scenarios";
import { bootstrap } from "../../platform/banking-workspace/application/banking";
import { financialView } from "../../platform/banking-workspace/application/financial-view";
import type { Bank } from "../../platform/banking-workspace/domain/banking";
import { Store } from "../../platform/banking-workspace/domain/ports";
import {
  advanceLoanSetup,
  inspectLoanSetup,
  loanSetupStatus,
} from "../../platform/lending/application/loan-setup";
import { LoanPilotCommand } from "../../platform/lending/domain/origination/loan-pilot";
import { LoanSetupCommand } from "../../platform/lending/domain/origination/loan-setup";
import { LoanTerms } from "../../platform/lending/domain/origination/loans";
import { RepaymentPilotCommand } from "../../platform/lending/domain/repayments/loan-repayment-pilot";
import { runPayeeAdmin } from "../../platform/payments/application/customer-payee-admin";
import { PayeeAdminCommand } from "../../platform/payments/domain/customer-payees";
import type { Environment } from "./environment";
import { failure, io } from "./request-context";
import { parseJsonRequest as parse } from "./request-json";
export const admin_routes = (request: Request, env: Environment) =>
  Effect.gen(function* () {
    const url = new URL(request.url);
    const path = url.pathname;
    const store = yield* Store;
    if (request.headers.get("Authorization") !== `Bearer ${env.ADMIN_TOKEN}`)
      return yield* Effect.fail(failure("Unauthorised.", 401));
    if (path.startsWith("/api/admin/demo/") && env.DEMO_MODE !== "true")
      return yield* Effect.fail(
        failure("Synthetic scenarios are disabled outside demo mode.", 403),
      );
    if (path === "/api/admin/demo/prepare" && request.method === "POST") {
      const input = yield* parse(
        request,
        Schema.Struct({
          journey: Schema.Literal("new", "existing"),
          restart: Schema.optional(Schema.Boolean),
        }),
      );
      return Response.json(
        yield* prepareScenario(input.journey, input.restart),
      );
    }
    if (path === "/api/admin/demo/loans/setup" && request.method === "GET")
      return Response.json(yield* loanSetupStatus());
    if (path === "/api/admin/demo/payees" && request.method === "POST")
      return Response.json(
        yield* runPayeeAdmin(
          yield* parse(request, PayeeAdminCommand, false, true),
        ),
      );
    if (path === "/api/admin/demo/customers" && request.method === "POST")
      return Response.json(
        yield* runCustomerAdmin(
          yield* parse(request, CustomerAdminCommand, false, true),
        ),
      );
    if (path === "/api/admin/demo/loans/inspect" && request.method === "POST") {
      yield* parse(
        request,
        Schema.Record({ key: Schema.String, value: Schema.Never }),
        false,
        true,
      );
      return Response.json(yield* inspectLoanSetup());
    }
    if (path === "/api/admin/demo/loans/advance" && request.method === "POST")
      return Response.json(
        yield* advanceLoanSetup(
          yield* parse(request, LoanSetupCommand, false, true),
        ),
      );
    if (path === "/api/admin/demo/loans/quote" && request.method === "POST") {
      const input = yield* parse(
        request,
        Schema.Struct({ terms: LoanTerms }),
        false,
        true,
      );
      return Response.json(yield* previewDemoLoan(input.terms));
    }
    if (path === "/api/admin/demo/loans/pilot" && request.method === "POST")
      return Response.json(
        yield* runLoanPilot(
          yield* parse(request, LoanPilotCommand, false, true),
        ),
      );
    if (
      path === "/api/admin/demo/loans/repayments" &&
      request.method === "POST"
    ) {
      if (new URL(request.url).search)
        return yield* Effect.fail(
          failure(
            "Repayment pilot selectors belong in the original request only.",
            400,
          ),
        );
      return Response.json(
        yield* runRepaymentPilot(
          yield* parse(request, RepaymentPilotCommand, false, true),
        ),
      );
    }
    if (path === "/api/admin/demo/backfill" && request.method === "POST") {
      const input = yield* parse(
        request,
        Schema.Struct({ bankId: Schema.optional(Schema.String) }),
        true,
      );
      if (!input.bankId)
        return Response.json({
          banks: yield* store.all<{ id: string }>(
            "SELECT id FROM banks WHERE status='ready' ORDER BY created_at",
          ),
        });
      const bank = yield* store.one<Bank>(
        "SELECT * FROM banks WHERE id=? AND status='ready'",
        input.bankId,
      );
      if (!bank)
        return yield* Effect.fail(failure("Ready workspace not found.", 404));
      yield* financialView(bank, true);
      return Response.json({ refreshed: true });
    }
    if (path === "/api/admin/telemetry-probe" && request.method === "POST") {
      return yield* Effect.die(
        new Error("OpenFinacle controlled telemetry probe"),
      );
    }
    if (path === "/api/admin/stop-core" && request.method === "POST") {
      yield* io(() => getContainer(env.CORE, "banking").stop());
      return Response.json({ stopped: true });
    }
    if (path.startsWith("/api/admin/core/")) {
      const headers = new Headers(request.headers);
      headers.set(
        "Authorization",
        request.headers.get("X-Core-Authorization") ||
          `Basic ${btoa(`mifos:${env.CORE_PASSWORD}`)}`,
      );
      headers.delete("X-Core-Authorization");
      headers.set("Fineract-Platform-TenantId", "default");
      return yield* io(() =>
        getContainer(env.CORE, "banking").fetch(
          new Request(
            `http://core/${path.slice("/api/admin/core/".length)}${url.search}`,
            {
              method: request.method,
              headers,
              ...(request.method === "GET"
                ? {}
                : ({ body: request.body, duplex: "half" } as RequestInit)),
            },
          ),
        ),
      );
    }
    if (path === "/api/admin/bootstrap" && request.method === "POST")
      return Response.json(yield* bootstrap);
    return yield* Effect.fail(failure("Admin route not found.", 404));
  });
