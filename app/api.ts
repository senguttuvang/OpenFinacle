import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from "@effect/platform";
import { Data, Effect } from "effect";

class ApiError extends Data.TaggedError("ApiError")<{
  message: string;
  status: number;
}> {}
export const api = <T>(path: string, body?: unknown, key?: string) =>
  Effect.gen(function* () {
    let request = HttpClientRequest.make(body === undefined ? "GET" : "POST")(
      `/api${path}`,
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
    if (response.status >= 400)
      return yield* Effect.fail(
        new ApiError({
          message:
            (json as { error?: string }).error ??
            "The request could not be completed.",
          status: response.status,
        }),
      );
    return json as T;
  }).pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.mapError((error) =>
      error instanceof ApiError
        ? error
        : new ApiError({
            message:
              "Cannot connect to the bank. Refresh to check the instruction status before trying again.",
            status: 503,
          }),
    ),
  );
