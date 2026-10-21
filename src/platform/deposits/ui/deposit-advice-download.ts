import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from "@effect/platform";
import { Effect } from "effect";
import { BankingError } from "../../banking-workspace/domain/banking";
import { adviceText, type DepositAdvice } from "../domain/deposit-advice";

export const fetchAdviceDownload = (path: string, advice: DepositAdvice) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(
      HttpClientRequest.get(`/api${path}&download=1`),
    );
    if (
      response.status !== 200 ||
      response.headers["content-type"] !== "text/plain; charset=utf-8" ||
      response.headers["content-disposition"] !==
        `attachment; filename="openfinacle-demo-${advice.reference}.txt"`
    )
      return yield* Effect.fail(new Error("Unverified download response"));
    const text = yield* response.text;
    if (text !== adviceText(advice))
      return yield* Effect.fail(new Error("Advice differs from preview"));
    return text;
  }).pipe(
    Effect.timeout("45 seconds"),
    Effect.provide(FetchHttpClient.layer),
    Effect.mapError(
      () =>
        new BankingError({
          message:
            "The advice download could not be verified. Check your session and retry the preview. Your holding is unchanged.",
          status: 503,
        }),
    ),
  );

export const saveAdviceDownload = (advice: DepositAdvice, text: string) => {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/plain; charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `openfinacle-demo-${advice.reference}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Keep the object alive until the browser has accepted the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
