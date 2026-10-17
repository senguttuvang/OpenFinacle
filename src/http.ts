import { getContainer } from "@cloudflare/containers";
import { Effect, Layer, Schema } from "effect";
import { coreLayer } from "./adapters/core";
import type { Environment } from "./adapters/environment";
import { loanCatalogueLayer } from "./adapters/loan-catalogue";
import { loanEngineLayer } from "./adapters/loan-engine";
import { parseJsonRequest as parse } from "./adapters/request-json";
import { storeLayer } from "./adapters/store";
import { reportFailure } from "./adapters/telemetry";
import {
  addBeneficiary,
  bootstrap,
  confirmBeneficiary,
  createCommand,
  dashboard,
  executeCommand,
  rejectCommand,
  requiredBank,
  requireStaff,
  reviewApplication,
  submitApplication,
} from "./application/banking";
import {
  actOnCardReplacement,
  cardReplacementDetail,
  cardReplacementForKey,
  listCardReplacements,
  submitCardReplacement,
} from "./application/card-replacements";
import {
  cardDetail,
  cardForKey,
  changeCard,
  listCards,
} from "./application/cards";
import { previewDemoLoan } from "./application/demo-loan-quote";
import { prepareScenario, scenarioBank } from "./application/demo-scenarios";
import { depositAdvice } from "./application/deposit-advice";
import {
  actOnDeposit,
  depositDetail,
  depositForKey,
  listDeposits,
  submitDeposit,
} from "./application/deposits";
import { financialView } from "./application/financial-view";
import {
  advanceLoanSetup,
  inspectLoanSetup,
  loanSetupStatus,
} from "./application/loan-setup";
import { customerProfile } from "./application/profile";
import {
  actOnRecurringPlan,
  listRecurringPlans,
  recurringDetail,
  recurringForKey,
  submitRecurringPlan,
} from "./application/recurring-deposits";
import {
  actOnServiceCase,
  listServiceCases,
  serviceCase,
  serviceCaseForKey,
  submitServiceCase,
} from "./application/service-cases";
import type { Bank } from "./domain/banking";
import {
  type Account,
  BankingError,
  type DocumentRecord,
  RoleSchema,
  type Session,
} from "./domain/banking";
import {
  ReplacementCommand,
  ReplacementTerms,
} from "./domain/card-replacements";
import { CardCommand } from "./domain/cards";
import { adviceText, DepositAdviceQuery } from "./domain/deposit-advice";
import { DepositCommand, DepositTerms } from "./domain/deposits";
import { LoanSetupCommand } from "./domain/loan-setup";
import { LoanTerms } from "./domain/loans";
import { Core, Store } from "./domain/ports";
import { RecurringCommand, RecurringTerms } from "./domain/recurring-deposits";
import { caseActions } from "./domain/service-cases";
import { serviceCatalog } from "./domain/services";
import { safeRoute } from "./domain/telemetry";

const failure = (message: string, status = 400) =>
  new BankingError({ message, status });
const financialMutation = (request: Request) =>
  request.method === "POST" &&
  [
    "/api/commands",
    "/api/commands/approve",
    "/api/application/review",
  ].includes(new URL(request.url).pathname);
const io = <A>(f: () => Promise<A>) =>
  Effect.tryPromise({
    try: f,
    catch: () =>
      failure(
        "The operation could not be completed. Refresh and inspect its status before retrying.",
        503,
      ),
  });
const hash = (value: string) =>
  io(() =>
    crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(value))
      .then((buffer) =>
        Array.from(new Uint8Array(buffer), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(""),
      ),
  );
const getSession = (request: Request) =>
  Effect.gen(function* () {
    const token = request.headers
      .get("Cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("of_session="))
      ?.slice(11);
    if (!token)
      return yield* Effect.fail(failure("Start a demo workspace first.", 401));
    const store = yield* Store;
    const session = yield* store.one<Session>(
      "SELECT * FROM sessions WHERE token_hash=? AND expires_at>?",
      yield* hash(token),
      Date.now(),
    );
    if (!session)
      return yield* Effect.fail(
        failure("Your demo session expired. Start a new workspace.", 401),
      );
    return session;
  });
const commandSchema = Schema.Struct({
  kind: Schema.Literal(
    "deposit",
    "withdrawal",
    "transfer",
    "salary",
    "freeze",
    "unfreeze",
    "reverse",
  ),
  amount: Schema.optional(Schema.Number),
  description: Schema.optional(Schema.String),
  beneficiaryId: Schema.optional(Schema.String),
  originalId: Schema.optional(Schema.String),
});
const appSchema = Schema.Struct({
  name: Schema.String,
  email: Schema.String,
  phone: Schema.String,
  address: Schema.String,
  employment: Schema.String,
});

const handle = (request: Request, env: Environment) =>
  Effect.gen(function* () {
    const url = new URL(request.url);
    const path = url.pathname;
    const store = yield* Store;
    if (path === "/api/health")
      return Response.json({
        status: "ok",
        app: "OpenFinacle",
        revision: env.APP_REVISION,
        engine: "Apache Fineract 1.15.0",
      });
    if (path === "/api/telemetry-config")
      return Response.json({ dsn: env.SENTRY_DSN, release: env.APP_REVISION });
    if (path === "/api/ready" && request.method === "GET") {
      yield* store.one("SELECT 1 AS ready").pipe(
        Effect.timeoutFail({
          duration: "5 seconds",
          onTimeout: () => failure("Workflow storage is not ready.", 503),
        }),
      );
      const core = yield* Core;
      yield* core.request("GET", "offices/1").pipe(
        Effect.timeoutFail({
          duration: "35 seconds",
          onTimeout: () =>
            failure(
              "The banking engine is starting or unavailable. No demo accounts have been created. Please check again shortly.",
              503,
            ),
        }),
      );
      return Response.json({ status: "ready", revision: env.APP_REVISION });
    }
    if (
      request.method !== "GET" &&
      request.headers.get("Origin") &&
      request.headers.get("Origin") !== url.origin
    )
      return yield* Effect.fail(
        failure("Cross-origin requests are not accepted.", 403),
      );
    if (path.startsWith("/api/admin/")) {
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
      if (
        path === "/api/admin/demo/loans/inspect" &&
        request.method === "POST"
      ) {
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
    }
    if (env.DEMO_MODE !== "true")
      return yield* Effect.fail(
        failure(
          "Production customer identity is not configured. Demo sessions and role switching are disabled.",
          503,
        ),
      );
    if (path === "/api/session" && request.method === "POST") {
      const input = yield* parse(
        request,
        Schema.Struct({
          journey: Schema.optional(Schema.Literal("new", "existing")),
        }),
        true,
      );
      const current = yield* getSession(request).pipe(
        Effect.catchAll((error) =>
          error.status === 401 ? Effect.succeed(null) : Effect.fail(error),
        ),
      );
      if (current) {
        const bank = yield* requiredBank(current);
        if (!input.journey || bank.journey === input.journey)
          return Response.json({
            bankId: bank.id,
            journey: bank.journey,
            resumed: true,
            dashboard: yield* dashboard(current, false),
          });
      }
      const limitKey = `${Math.floor(Date.now() / 3600000)}:${yield* hash(request.headers.get("CF-Connecting-IP") ?? "local")}`;
      const usage = yield* store.one<{ attempts: number }>(
        "INSERT INTO usage_limits(key,attempts) VALUES(?,1) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts",
        limitKey,
      );
      if ((usage?.attempts ?? 121) > 120)
        return yield* Effect.fail(
          failure(
            "This connection has reached the hourly demo limit. Continue in your existing workspace or try again later.",
            429,
          ),
        );
      const token = crypto.randomUUID() + crypto.randomUUID();
      const bank = yield* scenarioBank(input.journey ?? "new");
      const id = bank.id;
      const session: Session = {
        token_hash: yield* hash(token),
        bank_id: id,
        role: "customer",
        expires_at: Date.now() + 31536000000,
      };
      yield* store.run(
        "INSERT INTO sessions(token_hash,bank_id,role,expires_at) VALUES(?,?,'customer',?)",
        session.token_hash,
        id,
        session.expires_at,
      );
      return Response.json(
        {
          bankId: id,
          journey: bank.journey,
          dashboard: yield* dashboard(session, false),
        },
        {
          headers: {
            "Set-Cookie": `of_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=31536000`,
          },
        },
      );
    }
    const session = yield* getSession(request);
    if (path === "/api/session/end" && request.method === "POST") {
      yield* store.run(
        "DELETE FROM sessions WHERE token_hash=?",
        session.token_hash,
      );
      return Response.json(
        { ended: true },
        {
          headers: {
            "Set-Cookie":
              "of_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0",
          },
        },
      );
    }
    if (path === "/api/session/role" && request.method === "POST") {
      const { role } = yield* parse(
        request,
        Schema.Struct({ role: RoleSchema }),
      );
      yield* store.run(
        "UPDATE sessions SET role=? WHERE token_hash=?",
        role,
        session.token_hash,
      );
      return Response.json({ role });
    }
    if (path === "/api/dashboard" && request.method === "GET")
      return Response.json(
        yield* dashboard(session, url.searchParams.get("refresh") === "true"),
      );
    if (financialMutation(request))
      yield* store.run(
        "UPDATE financial_snapshots SET invalidated_at=? WHERE bank_id=?",
        Date.now(),
        session.bank_id,
      );
    if (path === "/api/application" && request.method === "POST")
      return Response.json(
        yield* submitApplication(session, yield* parse(request, appSchema)),
      );
    if (path === "/api/application/review" && request.method === "POST") {
      const input = yield* parse(
        request,
        Schema.Struct({
          decision: Schema.Literal("needs_changes", "recommend", "approve"),
          note: Schema.String,
        }),
      );
      return Response.json(
        yield* reviewApplication(session, input.decision, input.note),
      );
    }
    if (path === "/api/beneficiaries" && request.method === "POST")
      return Response.json(
        yield* addBeneficiary(
          session,
          (yield* parse(request, Schema.Struct({ name: Schema.String }))).name,
        ),
      );
    if (path === "/api/beneficiaries/confirm" && request.method === "POST") {
      const input = yield* parse(
        request,
        Schema.Struct({ id: Schema.String, code: Schema.String }),
      );
      return Response.json(
        yield* confirmBeneficiary(session, input.id, input.code),
      );
    }
    if (path === "/api/commands" && request.method === "POST")
      return Response.json(
        yield* createCommand(
          session,
          yield* parse(request, commandSchema),
          request.headers.get("Idempotency-Key") ?? "",
        ),
      );
    if (path === "/api/commands/approve" && request.method === "POST")
      return Response.json(
        yield* executeCommand(
          session,
          (yield* parse(request, Schema.Struct({ id: Schema.String }))).id,
        ),
      );
    if (path === "/api/commands/reject" && request.method === "POST")
      return Response.json(
        yield* rejectCommand(
          session,
          (yield* parse(request, Schema.Struct({ id: Schema.String }))).id,
        ),
      );
    if (path === "/api/documents" && request.method === "POST") {
      const bank = yield* requiredBank(session);
      if (session.role !== "customer")
        return yield* Effect.fail(
          failure("Upload documents as the customer.", 403),
        );
      if (Number(request.headers.get("Content-Length") ?? 0) > 1100000)
        return yield* Effect.fail(
          failure("Maximum document size is 1 MB.", 413),
        );
      const form = yield* io(() => request.formData());
      const file = form.get("file");
      const kind = form.get("kind");
      if (
        !(file instanceof File) ||
        file.size > 1000000 ||
        !["identity", "address"].includes(String(kind)) ||
        !["application/pdf", "image/png", "image/jpeg", "text/plain"].includes(
          file.type,
        )
      )
        return yield* Effect.fail(
          failure("Attach a synthetic PDF, image or text document up to 1 MB."),
        );
      const count = yield* store.one<{ n: number }>(
        "SELECT COUNT(*) AS n FROM documents WHERE bank_id=?",
        bank.id,
      );
      if ((count?.n ?? 0) >= 10)
        return yield* Effect.fail(
          failure("Maximum ten documents per demo.", 409),
        );
      const id = crypto.randomUUID();
      const key = `${bank.id}/${id}`;
      yield* io(() =>
        env.DOCUMENTS.put(key, file.stream(), {
          httpMetadata: { contentType: file.type },
        }),
      );
      yield* store.run(
        "INSERT INTO documents(id,bank_id,name,kind,object_key,size) VALUES(?,?,?,?,?,?)",
        id,
        bank.id,
        file.name.slice(0, 120),
        String(kind),
        key,
        file.size,
      );
      return Response.json({ id, name: file.name });
    }
    if (path.startsWith("/api/documents/") && request.method === "GET") {
      const doc = yield* store.one<DocumentRecord>(
        "SELECT * FROM documents WHERE id=? AND bank_id=?",
        path.split("/").pop() ?? "",
        session.bank_id,
      );
      if (!doc) return yield* Effect.fail(failure("Document not found.", 404));
      const object = yield* io(() => env.DOCUMENTS.get(doc.object_key));
      if (!object)
        return yield* Effect.fail(failure("Document object unavailable.", 404));
      return new Response(object.body, {
        headers: {
          "Content-Type":
            object.httpMetadata?.contentType ?? "application/octet-stream",
          "Content-Disposition": "attachment",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (path === "/api/statement" && request.method === "GET") {
      const bank = yield* requiredBank(session);
      const core = yield* Core;
      if (!bank.customer_account)
        return yield* Effect.fail(failure("Open your account first.", 409));
      const account = yield* core.request<Account>(
        "GET",
        `savingsaccounts/${bank.customer_account}?associations=transactions`,
      );
      const lines = [
        "Reference,Date,Description,Amount INR,Balance INR,Reversed",
        ...(account.transactions ?? []).map((t) =>
          [
            t.id,
            t.date.join("-"),
            `"${t.transactionType.value.replaceAll('"', '""')}"`,
            t.amount,
            t.runningBalance ?? "",
            Boolean(t.reversed),
          ].join(","),
        ),
      ];
      return new Response(lines.join("\r\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="openfinacle-statement.csv"',
        },
      });
    }
    if (path === "/api/deposit-advice" && request.method === "GET") {
      const input = yield* Schema.decodeUnknown(DepositAdviceQuery)(
        Object.fromEntries(url.searchParams),
        { onExcessProperty: "error" },
      ).pipe(
        Effect.mapError(() =>
          failure("Choose a valid holding and advice format."),
        ),
      );
      if (
        [...url.searchParams.keys()].length !==
        new Set(url.searchParams.keys()).size
      )
        return yield* Effect.fail(failure("Choose one holding reference."));
      const advice = yield* depositAdvice(session, input.kind, input.id);
      return input.download === "1"
        ? new Response(adviceText(advice), {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Content-Disposition": `attachment; filename="openfinacle-demo-${advice.reference}.txt"`,
            },
          })
        : Response.json(advice);
    }
    if (path === "/api/recurring-deposits" && request.method === "GET") {
      const id = url.searchParams.get("id");
      const key = url.searchParams.get("key");
      if (id !== null && key !== null)
        return yield* Effect.fail(
          failure("Choose a recurring plan or command reference."),
        );
      return Response.json(
        key !== null
          ? yield* recurringForKey(session, key)
          : id !== null
            ? yield* recurringDetail(session, id)
            : yield* listRecurringPlans(session),
      );
    }
    if (path === "/api/recurring-deposits" && request.method === "POST")
      return Response.json(
        yield* submitRecurringPlan(
          session,
          yield* parse(request, RecurringTerms, false, true),
          request.headers.get("Idempotency-Key") ?? "",
        ),
      );
    if (path === "/api/recurring-deposits/action" && request.method === "POST")
      return Response.json(
        yield* actOnRecurringPlan(
          session,
          yield* parse(request, RecurringCommand, false, true),
          request.headers.get("Idempotency-Key") ?? "",
        ),
      );
    if (path === "/api/deposits" && request.method === "GET") {
      const id = url.searchParams.get("id");
      const key = url.searchParams.get("key");
      if (id !== null && key !== null)
        return yield* Effect.fail(
          failure("Choose a deposit or command reference."),
        );
      return Response.json(
        key !== null
          ? yield* depositForKey(session, key)
          : id !== null
            ? yield* depositDetail(session, id)
            : yield* listDeposits(session),
      );
    }
    if (path === "/api/deposits" && request.method === "POST")
      return Response.json(
        yield* submitDeposit(
          session,
          yield* parse(request, DepositTerms, false, true),
          request.headers.get("Idempotency-Key") ?? "",
        ),
      );
    if (path === "/api/deposits/action" && request.method === "POST")
      return Response.json(
        yield* actOnDeposit(
          session,
          yield* parse(request, DepositCommand, false, true),
          request.headers.get("Idempotency-Key") ?? "",
        ),
      );
    if (path === "/api/card-replacements" && request.method === "GET") {
      const id = url.searchParams.get("id");
      const key = url.searchParams.get("key");
      if (
        (id !== null && (!id || id.length > 100)) ||
        (id !== null && key !== null)
      )
        return yield* Effect.fail(
          failure("Choose a valid replacement or command reference."),
        );
      return Response.json(
        key !== null
          ? yield* cardReplacementForKey(session, key)
          : id !== null
            ? yield* cardReplacementDetail(session, id)
            : yield* listCardReplacements(session),
      );
    }
    if (path === "/api/card-replacements" && request.method === "POST")
      return Response.json(
        yield* submitCardReplacement(
          session,
          yield* parse(request, ReplacementTerms, false, true),
          request.headers.get("Idempotency-Key") ?? "",
        ),
      );
    if (path === "/api/card-replacements/action" && request.method === "POST")
      return Response.json(
        yield* actOnCardReplacement(
          session,
          yield* parse(request, ReplacementCommand, false, true),
          request.headers.get("Idempotency-Key") ?? "",
        ),
      );
    if (path === "/api/profile" && request.method === "GET")
      return Response.json(yield* customerProfile(session));
    if (path === "/api/cards" && request.method === "GET") {
      const id = url.searchParams.get("id");
      const key = url.searchParams.get("key");
      if (id !== null && key !== null)
        return yield* Effect.fail(
          failure("Choose a card or a command reference."),
        );
      return Response.json(
        key !== null
          ? yield* cardForKey(session, key)
          : id !== null
            ? yield* cardDetail(session, id)
            : yield* listCards(session),
      );
    }
    if (path === "/api/cards/action" && request.method === "POST")
      return Response.json(
        yield* changeCard(
          session,
          yield* parse(request, CardCommand, false, true),
          request.headers.get("Idempotency-Key") ?? "",
        ),
      );
    if (path === "/api/service-catalog" && request.method === "GET")
      return Response.json({ services: serviceCatalog });
    if (path === "/api/service-cases" && request.method === "GET") {
      const id = url.searchParams.get("id");
      const key = url.searchParams.get("key");
      if (
        (id !== null && (!id || id.length > 100)) ||
        (id !== null && key !== null)
      )
        return yield* Effect.fail(
          failure("Choose a valid request reference.", 400),
        );
      return Response.json(
        id
          ? yield* serviceCase(session, id)
          : key !== null
            ? yield* serviceCaseForKey(session, key)
            : yield* listServiceCases(
                session,
                Number(url.searchParams.get("offset") ?? 0),
                url.searchParams.get("query") ?? "",
                url.searchParams.get("view") === "deliveries",
              ),
      );
    }
    if (path === "/api/service-cases" && request.method === "POST") {
      const input = yield* parse(
        request,
        Schema.Struct({
          code: Schema.String,
          fields: Schema.Record({ key: Schema.String, value: Schema.String }),
        }),
      );
      return Response.json(
        yield* submitServiceCase(
          session,
          input.code,
          input.fields,
          request.headers.get("Idempotency-Key") ?? "",
        ),
      );
    }
    if (path === "/api/service-cases/action" && request.method === "POST") {
      const input = yield* parse(
        request,
        Schema.Struct({
          id: Schema.String,
          version: Schema.Number,
          action: Schema.Literal(...caseActions),
          note: Schema.optional(Schema.String),
          fields: Schema.optional(
            Schema.Record({ key: Schema.String, value: Schema.String }),
          ),
        }),
      );
      return Response.json(
        yield* actOnServiceCase(session, { ...input, note: input.note ?? "" }),
      );
    }
    if (
      request.method === "POST" &&
      ["/api/requests", "/api/requests/resolve"].includes(path)
    )
      return yield* Effect.fail(
        failure(
          "Use the service centre to submit or process a versioned request with its required review and authorization.",
          409,
        ),
      );
    return yield* Effect.fail(failure("Route not found.", 404));
  });

export const handleRequest = (
  request: Request,
  env: Environment,
): Promise<Response> => {
  const started = Date.now();
  const requestId = crypto.randomUUID();
  let eventId: string | undefined;
  const route = safeRoute(new URL(request.url).pathname);
  console.log(
    JSON.stringify({
      event: "http_request_started",
      requestId,
      route,
      method: request.method,
      revision: env.APP_REVISION,
    }),
  );
  const diagnostic = (status: number) => ({
    requestId,
    route,
    method: request.method,
    status,
    durationMs: Date.now() - started,
  });
  return Effect.runPromise(
    handle(request, env).pipe(
      Effect.tap((response) =>
        financialMutation(request) && response.ok
          ? Effect.gen(function* () {
              const session = yield* getSession(request);
              const bank = yield* requiredBank(session);
              yield* financialView(bank, true).pipe(
                Effect.mapError(() =>
                  failure(
                    "The instruction status is saved, but balances could not be refreshed. Inspect its status and use Refresh balances; do not repeat the financial instruction.",
                    503,
                  ),
                ),
              );
            })
          : Effect.void,
      ),
      Effect.provide(Layer.merge(loanCatalogueLayer, loanEngineLayer)),
      Effect.provide(
        Layer.merge(coreLayer(env, requestId), storeLayer(env.DB)),
      ),
      Effect.catchAll((error) =>
        Effect.sync(() => {
          if (error.status >= 500)
            eventId = reportFailure({
              ...diagnostic(error.status),
              uncertain: error.uncertain,
            });
          return Response.json(
            {
              error: error.message,
              uncertain: error.uncertain ?? false,
              requestId,
            },
            { status: error.status },
          );
        }),
      ),
      Effect.catchAllDefect((defect) =>
        Effect.sync(() => {
          eventId = reportFailure(diagnostic(500), defect);
          return Response.json(
            {
              error:
                "An unexpected error occurred. Inspect instruction status before retrying.",
              requestId,
            },
            { status: 500 },
          );
        }),
      ),
      Effect.map((response) => {
        const secured = new Response(response.body, response);
        secured.headers.set("Cache-Control", "no-store");
        secured.headers.set("X-Content-Type-Options", "nosniff");
        secured.headers.set("Referrer-Policy", "same-origin");
        secured.headers.set("X-Request-ID", requestId);
        if (eventId) secured.headers.set("X-Error-ID", eventId);
        secured.headers.set("Server-Timing", `app;dur=${Date.now() - started}`);
        console.log(
          JSON.stringify({
            event: "http_request",
            revision: env.APP_REVISION,
            ...diagnostic(response.status),
          }),
        );
        return secured;
      }),
    ),
  );
};
