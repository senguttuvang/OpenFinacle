import { Effect, Schema } from "effect";
import { requiredBank } from "../../../platform/banking-workspace/application/banking";
import {
  type Account,
  type DocumentRecord,
  type Session,
} from "../../../platform/banking-workspace/domain/banking";
import { Core, Store } from "../../../platform/banking-workspace/domain/ports";
import { depositAdvice } from "../../../platform/deposits/application/deposit-advice";
import {
  adviceText,
  DepositAdviceQuery,
} from "../../../platform/deposits/domain/deposit-advice";
import type { Environment } from "../environment";
import { failure, io } from "../request-context";
export const documentRoutes = (
  request: Request,
  env: Environment,
  session: Session,
) =>
  Effect.gen(function* () {
    const url = new URL(request.url);
    const path = url.pathname;
    const store = yield* Store;
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
  });
