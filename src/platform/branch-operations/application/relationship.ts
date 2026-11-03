import { Clock, Effect, Schema } from "effect";
import { onboardingStatus } from "../../account-opening/application/onboarding";
import {
  BankingError,
  type Session,
} from "../../banking-workspace/domain/banking";
import { Core, Store } from "../../banking-workspace/domain/ports";
import { customerProfile } from "../../customers/application/profile";
import {
  CoreChargesEvidence,
  CoreClientEvidence,
  CoreDocumentsEvidence,
  CorePortfolioEvidence,
  type RelationshipEnquiry,
} from "../domain/relationship";
import { branchCustomer } from "./branch-day";
export const relationshipEnquiry = (session: Session, customerId: string) =>
  Effect.gen(function* () {
    const { customer, scoped } = yield* branchCustomer(session, customerId);
    const core = yield* Core;
    const store = yield* Store;
    const errors: { source: string; message: string }[] = [];
    const read = <A, I>(
      source: string,
      path: string,
      schema: Schema.Schema<A, I>,
    ) =>
      core.request<unknown>("GET", path).pipe(
        Effect.flatMap(Schema.decodeUnknown(schema)),
        Effect.catchAll(() => {
          errors.push({
            source,
            message: `${source} is unavailable or incomplete.`,
          });
          return Effect.succeed(null);
        }),
      );
    const client = yield* read(
      "Core client",
      `clients/${customer.client_id}`,
      CoreClientEvidence,
    );
    if (client && client.id !== customer.client_id)
      return yield* Effect.fail(
        new BankingError({
          message:
            "Core client ownership does not match registration. Enquiry withheld.",
          status: 503,
        }),
      );
    const [portfolio, coreDocuments, charges] = client
      ? yield* Effect.all(
          [
            read(
              "Core portfolio",
              `clients/${customer.client_id}/accounts`,
              CorePortfolioEvidence,
            ),
            read(
              "Core document metadata",
              `clients/${customer.client_id}/documents`,
              CoreDocumentsEvidence,
            ),
            read(
              "Core charges",
              `savingsaccounts/${customer.account_id}/charges`,
              CoreChargesEvidence,
            ),
          ],
          { concurrency: 3 },
        )
      : [null, null, null];
    const selectedSavings =
      portfolio?.savingsAccounts?.find(
        (row) => row.id === customer.account_id,
      ) ?? null;
    if (
      portfolio &&
      (!selectedSavings || selectedSavings.accountNo !== customer.account_no)
    )
      return yield* Effect.fail(
        new BankingError({
          message:
            "The registered savings account is not corroborated by its core client portfolio. Enquiry withheld.",
          status: 503,
        }),
      );
    if (
      selectedSavings &&
      (selectedSavings.currency?.code !== "INR" ||
        selectedSavings.currency.decimalPlaces !== 2)
    )
      return yield* Effect.fail(
        new BankingError({
          message:
            "Core portfolio currency does not match this registered INR relationship. Enquiry withheld.",
          status: 503,
        }),
      );
    const applicationDocuments = yield* store.all<
      RelationshipEnquiry["applicationDocuments"][number]
    >(
      "SELECT id,name,kind,size,created_at FROM documents WHERE bank_id=? ORDER BY created_at DESC,id DESC",
      scoped.bank_id,
    );
    const profile = yield* customerProfile(scoped).pipe(
      Effect.catchAll(() => {
        errors.push({
          source: "Application profile",
          message: "Saved application profile is unavailable.",
        });
        return Effect.succeed(null);
      }),
    );
    const opening =
      customer.origin === "onboarding"
        ? yield* onboardingStatus(scoped).pipe(
            Effect.catchAll(() => {
              errors.push({
                source: "Staged declaration",
                message:
                  "The staged demonstration declaration could not be read.",
              });
              return Effect.succeed(null);
            }),
          )
        : null;
    return {
      observedAt: yield* Clock.currentTimeMillis,
      client,
      portfolio,
      selectedSavings,
      coreDocuments,
      charges,
      applicationDocuments,
      profile,
      nominee: opening
        ? {
            choice: opening.fields.nomineeChoice,
            name: opening.fields.nomineeName,
            relationship: opening.fields.nomineeRelationship,
            version: opening.version,
          }
        : null,
      errors,
    } satisfies RelationshipEnquiry;
  });
