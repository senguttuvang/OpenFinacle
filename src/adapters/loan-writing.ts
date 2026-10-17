import { Clock, Effect, Layer, Schema } from "effect";
import { BankingError, dateFields } from "../domain/banking";
import { LoanEnquiry } from "../domain/loan-engine";
import {
  type LoanWriteInstruction,
  type LoanWriteResult,
  LoanWriter,
  validateLoanWriteInstruction,
} from "../domain/loan-writing";
import { Core } from "../domain/ports";
import {
  coreLoanApplicationBody,
  verifyCoreLoanReferences,
} from "./loan-engine";

const acknowledgement = Schema.Struct({
  resourceId: Schema.Number.pipe(Schema.int(), Schema.positive()),
});
const uncertain = () =>
  new BankingError({
    message:
      "The original loan instruction remains unconfirmed. Inspect it; do not repeat the Core write.",
    status: 503,
    uncertain: true,
  });
const invalidState = () =>
  new BankingError({
    message:
      "The owned Core loan is not in the original instruction's required state.",
    status: 409,
  });

export const loanWriterLayer = Layer.effect(
  LoanWriter,
  Effect.gen(function* () {
    const core = yield* Core;
    const enquiry = yield* LoanEnquiry;
    const confirmOriginal = (
      input: LoanWriteInstruction,
    ): Effect.Effect<LoanWriteResult, BankingError> =>
      Effect.gen(function* () {
        if (input.action === "disburse") {
          if (!input.transaction_external_id)
            return yield* Effect.fail(invalidState());
          const proof = yield* enquiry.confirmDisbursement({
            ...input,
            transaction_external_id: input.transaction_external_id,
          });
          if (
            proof.date !== input.date ||
            JSON.stringify(proof.loan.schedule) !==
              JSON.stringify(input.quote.schedule)
          )
            return yield* Effect.fail(invalidState());
          return {
            loan: proof.loan,
            transaction_id: proof.transaction_id,
            transfer_id: proof.transfer_id,
          };
        }
        const loan = yield* enquiry.inspect(input);
        const target =
          input.action === "approve"
            ? "approved"
            : input.action === "withdraw"
              ? "withdrawn"
              : "registered";
        if (
          loan.status !== target ||
          loan.submitted_on_date !== input.expected_disbursement_date ||
          (input.action === "approve" &&
            loan.approved_on_date !== input.date) ||
          (input.action === "withdraw" &&
            loan.withdrawn_on_date !== input.date) ||
          ((input.action === "register" || input.action === "undo_approval") &&
            loan.approved_on_date !== null)
        )
          return yield* Effect.fail(invalidState());
        return { loan, transaction_id: null, transfer_id: null };
      });
    return {
      confirm: (input: LoanWriteInstruction) =>
        Effect.gen(function* () {
          const original = yield* validateLoanWriteInstruction(
            input,
            yield* Clock.currentTimeMillis,
            "confirm",
          );
          return yield* confirmOriginal(original).pipe(
            Effect.mapError(uncertain),
          );
        }),
      dispatch: (input: LoanWriteInstruction) =>
        Effect.gen(function* () {
          const original = yield* validateLoanWriteInstruction(
            input,
            yield* Clock.currentTimeMillis,
            "dispatch",
          );
          const financialStage =
            original.action === "register" ||
            original.action === "approve" ||
            original.action === "disburse";
          if (financialStage)
            yield* verifyCoreLoanReferences(core, original.owner);
          if (original.action !== "register") {
            const before = yield* enquiry.inspect(original);
            const required =
              original.action === "approve" || original.action === "withdraw"
                ? "registered"
                : "approved";
            if (before.status !== required)
              return yield* Effect.fail(invalidState());
          }
          const path =
            original.action === "register"
              ? "loans"
              : `loans/${original.core_id}?command=${
                  {
                    approve: "approve",
                    disburse: "disburseToSavings",
                    undo_approval: "undoapproval",
                    withdraw: "withdrawnByApplicant",
                  }[original.action]
                }`;
          const body =
            original.action === "register"
              ? {
                  ...coreLoanApplicationBody(original),
                  externalId: original.external_id,
                  linkAccountId: original.owner.savings_account_id,
                  createStandingInstructionAtDisbursement: false,
                }
              : original.action === "undo_approval"
                ? { note: original.note }
                : {
                    ...dateFields(),
                    note: original.note,
                    ...(original.action === "approve"
                      ? {
                          approvedOnDate: original.date,
                          approvedLoanAmount: original.terms.principal,
                          expectedDisbursementDate:
                            original.expected_disbursement_date,
                        }
                      : original.action === "withdraw"
                        ? { withdrawnOnDate: original.date }
                        : {
                            actualDisbursementDate: original.date,
                            transactionAmount: original.terms.principal,
                            externalId: original.transaction_external_id,
                          }),
                  };
          // Recheck after potentially slow reads, immediately before the one write.
          yield* validateLoanWriteInstruction(
            original,
            yield* Clock.currentTimeMillis,
            "dispatch",
          );
          // Exactly one POST. Only the durable application owner may call this for a fresh reservation.
          const response = yield* core
            .request("POST", path, body, original.key)
            .pipe(
              Effect.mapError((error) =>
                error.uncertain
                  ? uncertain()
                  : new BankingError({
                      message:
                        "Core rejected the original loan instruction. Review it before requesting a new attempt.",
                      status: error.status,
                    }),
              ),
            );
          return yield* Effect.gen(function* () {
            const ack = yield* Schema.decodeUnknown(acknowledgement)(response);
            if (
              original.core_id !== undefined &&
              ack.resourceId !== original.core_id
            )
              return yield* Effect.fail(invalidState());
            return yield* confirmOriginal({
              ...original,
              core_id: ack.resourceId,
            });
          }).pipe(Effect.mapError(uncertain));
        }),
    };
  }),
);
