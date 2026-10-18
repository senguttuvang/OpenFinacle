import { Effect } from "effect";
import type {
  OnboardingDraft,
  OnboardingFields,
} from "../src/domain/onboarding";
import { api } from "./api";

export const loadOnboarding = () => api<OnboardingDraft>("/onboarding");
export const beginOnboarding = (operationId: string) =>
  Effect.gen(function* () {
    yield* api("/session", {});
    return yield* api<OnboardingDraft>("/onboarding/start", { operationId });
  });
export const continueOnboarding = () =>
  Effect.gen(function* () {
    const saved = yield* api<OnboardingDraft>("/onboarding/continue", {});
    if (saved.account) yield* api("/session/role", { role: "customer" });
    return saved;
  });
export const saveOnboarding = (
  draft: OnboardingDraft,
  fields: OnboardingFields,
  step: number,
) =>
  api<OnboardingDraft>("/onboarding/draft", {
    version: draft.version,
    fields,
    step,
  });
export const confirmOnboarding = (draft: OnboardingDraft) =>
  api<OnboardingDraft>(
    "/onboarding/submit",
    {
      operationId: draft.operationId,
      version: draft.version,
    },
    draft.operationId,
  );

export const attachSampleIdentityPack = () =>
  Effect.gen(function* () {
    const current = yield* api<{ documents: { name: string; kind: string }[] }>(
      "/dashboard",
    );
    for (const kind of ["identity", "address"] as const) {
      const name = `Demo-onboarding-${kind}.txt`;
      if (
        current.documents.some(
          (document) => document.name === name && document.kind === kind,
        )
      )
        continue;
      const form = new FormData();
      form.set("kind", kind);
      form.set(
        "file",
        new File(
          [
            `OpenFinacle sample ${kind} record. Fictional demonstration only. No PAN, Aadhaar, government identifier, signature or live KYC verification. Branch review is required.`,
          ],
          name,
          { type: "text/plain" },
        ),
      );
      yield* api("/documents", form);
    }
  });
