import { getContainer } from "@cloudflare/containers";
import { Effect, Layer, Schema } from "effect";
import { coreLayer } from "./adapters/core";
import type { Environment } from "./adapters/environment";
import { storeLayer } from "./adapters/store";
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
  startBank,
  submitApplication,
} from "./application/banking";
import {
  type Account,
  BankingError,
  type DocumentRecord,
  RoleSchema,
  type ServiceRequest,
  type Session,
} from "./domain/banking";
import { Core, Store } from "./domain/ports";

const failure = (message: string, status = 400) =>
  new BankingError({ message, status });
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
const parse = <A, I>(request: Request, schema: Schema.Schema<A, I, never>) =>
  Effect.gen(function* () {
    const text = yield* io(() => request.text());
    if (text.length > 20000)
      return yield* Effect.fail(failure("Request is too large.", 413));
    const data = yield* Effect.try({
      try: () => JSON.parse(text) as unknown,
      catch: () => failure("Send valid JSON."),
    });
    return yield* Schema.decodeUnknown(schema)(data).pipe(
      Effect.mapError(() =>
        failure("Some required fields are missing or invalid."),
      ),
    );
  });
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
    if (path === "/api/session" && request.method === "POST") {
      const limitKey = `${Math.floor(Date.now() / 3600000)}:${yield* hash(request.headers.get("CF-Connecting-IP") ?? "local")}`;
      const usage = yield* store.one<{ attempts: number }>(
        "INSERT INTO usage_limits(key,attempts) VALUES(?,1) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts",
        limitKey,
      );
      if ((usage?.attempts ?? 100) > 20)
        return yield* Effect.fail(
          failure(
            "This connection has reached the hourly demo limit. Continue in your existing workspace or try again later.",
            429,
          ),
        );
      const token = crypto.randomUUID() + crypto.randomUUID();
      const id = yield* startBank;
      yield* store.run(
        "INSERT INTO sessions(token_hash,bank_id,role,expires_at) VALUES(?,?,'customer',?)",
        yield* hash(token),
        id,
        Date.now() + 86400000,
      );
      return Response.json(
        { bankId: id },
        {
          headers: {
            "Set-Cookie": `of_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`,
          },
        },
      );
    }
    const session = yield* getSession(request);
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
      return Response.json(yield* dashboard(session));
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
    if (path === "/api/requests" && request.method === "POST") {
      const input = yield* parse(
        request,
        Schema.Struct({
          kind: Schema.Literal(
            "chequebook",
            "debit_card",
            "address_change",
            "fixed_deposit",
            "personal_loan",
          ),
          detail: Schema.String,
        }),
      );
      const id = crypto.randomUUID();
      yield* store.run(
        "INSERT INTO service_requests(id,bank_id,kind,detail) VALUES(?,?,?,?)",
        id,
        session.bank_id,
        input.kind,
        input.detail.slice(0, 1000),
      );
      return Response.json({ id, status: "open" });
    }
    if (path === "/api/requests/resolve" && request.method === "POST") {
      yield* requireStaff(session);
      const input = yield* parse(request, Schema.Struct({ id: Schema.String }));
      const record = yield* store.one<ServiceRequest>(
        "SELECT * FROM service_requests WHERE id=? AND bank_id=?",
        input.id,
        session.bank_id,
      );
      if (!record)
        return yield* Effect.fail(failure("Request not found.", 404));
      if (["fixed_deposit", "personal_loan"].includes(record.kind))
        return yield* Effect.fail(
          failure(
            "This application requires a product workflow and cannot be marked fulfilled here.",
            409,
          ),
        );
      yield* store.run(
        "UPDATE service_requests SET status='fulfilled' WHERE id=? AND bank_id=?",
        input.id,
        session.bank_id,
      );
      return Response.json({ status: "fulfilled" });
    }
    return yield* Effect.fail(failure("Route not found.", 404));
  });

export const handleRequest = (
  request: Request,
  env: Environment,
): Promise<Response> =>
  Effect.runPromise(
    handle(request, env).pipe(
      Effect.provide(Layer.merge(coreLayer(env), storeLayer(env.DB))),
      Effect.catchAll((error) =>
        Effect.succeed(
          Response.json(
            { error: error.message, uncertain: error.uncertain ?? false },
            { status: error.status },
          ),
        ),
      ),
      Effect.catchAllDefect(() =>
        Effect.succeed(
          Response.json(
            {
              error:
                "An unexpected error occurred. Inspect instruction status before retrying.",
            },
            { status: 500 },
          ),
        ),
      ),
      Effect.map((response) => {
        const secured = new Response(response.body, response);
        secured.headers.set("Cache-Control", "no-store");
        secured.headers.set("X-Content-Type-Options", "nosniff");
        secured.headers.set("Referrer-Policy", "same-origin");
        return secured;
      }),
    ),
  );
