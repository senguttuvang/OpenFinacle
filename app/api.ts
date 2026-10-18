import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from "@effect/platform";
import { Data, Effect } from "effect";
import { reportTransportFailure } from "./browser-errors";

class ApiError extends Data.TaggedError("ApiError")<{
  message: string;
  status: number;
  transportFailure?: boolean;
  uncertain?: boolean;
}> {}
let customerScope: string | null = null;
export const setApiCustomerScope = (scope: string | null) => {
  customerScope = scope;
};
export const api = <T>(path: string, body?: unknown, key?: string) =>
  Effect.gen(function* () {
    const expectedScope = customerScope;
    let request = HttpClientRequest.make(body === undefined ? "GET" : "POST")(
      `/api${path}`,
    );
    if (expectedScope)
      request = request.pipe(
        HttpClientRequest.setHeader("X-Customer-Scope", expectedScope),
      );
    if (body !== undefined)
      request =
        body instanceof FormData
          ? request.pipe(HttpClientRequest.bodyFormData(body))
          : yield* HttpClientRequest.bodyJson(request, body);
    if (key)
      request = request.pipe(
        HttpClientRequest.setHeader("Idempotency-Key", key),
      );
    const response = yield* HttpClient.execute(request);
    const json = yield* response.json;
    if (customerScope !== expectedScope)
      return yield* Effect.fail(
        new ApiError({
          message:
            "Customer selection changed. Discarded the previous customer's response; reload the selected workspace.",
          status: 409,
          uncertain: false,
        }),
      );
    if (response.status >= 400)
      return yield* Effect.fail(
        new ApiError({
          message: `${typeof json === "object" && json !== null && "error" in json && typeof json.error === "string" ? json.error : "The request could not be completed."} Reference: ${response.headers["x-request-id"] ?? "unavailable"}`,
          status: response.status,
          uncertain: !(
            typeof json === "object" &&
            json !== null &&
            "uncertain" in json &&
            json.uncertain === false
          ),
        }),
      );
    return json as T;
  }).pipe(
    Effect.timeoutFail({
      duration:
        path === "/session"
          ? "3 seconds"
          : body === undefined
            ? "45 seconds"
            : "90 seconds",
      onTimeout: () =>
        new ApiError({
          message:
            path === "/session"
              ? "The saved demo could not open within three seconds. No accounts are created during entry; reload to resume."
              : body === undefined
                ? "The bank is taking too long to respond. Please check readiness again shortly."
                : "The instruction is taking too long. Its outcome is not confirmed. Refresh and inspect its status before trying again.",
          status: 504,
          transportFailure: true,
        }),
    }),
    Effect.provide(FetchHttpClient.layer),
    Effect.mapError((error) =>
      error instanceof ApiError
        ? error
        : new ApiError({
            message:
              "Cannot connect to the bank. Refresh to check the instruction status before trying again.",
            status: 503,
            transportFailure: true,
          }),
    ),
    Effect.tapError((error) =>
      Effect.sync(() => {
        if (error.transportFailure) reportTransportFailure(path);
      }),
    ),
  );
