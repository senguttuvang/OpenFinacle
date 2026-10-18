import { Clock, Effect, Layer, Schema } from "effect";
import { BankingError, bankingDate, dateFields } from "../domain/banking";
import { CoreLoanSnapshot, LoanEnquiry } from "../domain/loan-engine";
import { loanRepaymentMarker } from "../domain/loan-repayment-identity";
import {
  LoanRepayer,
  LoanRepaymentAmount,
  type LoanRepaymentInstruction,
  LoanRepaymentLookup,
  type LoanRepaymentOffer,
  LoanRepaymentResult,
  validateRepaymentInstruction,
  validateRepaymentOffer,
} from "../domain/loan-repayments";
import { LoanQuote } from "../domain/loans";
import { Core } from "../domain/ports";
import {
  coreLoanProductShape,
  loanCoreCalendar,
  loanCoreDateParts,
  loanCoreMinor,
} from "./loan-engine";

const id = Schema.Number.pipe(Schema.int(), Schema.positive());
const amount = Schema.Number.pipe(Schema.nonNegative());
const currency = Schema.Struct({
  code: Schema.Literal("INR"),
  decimalPlaces: Schema.Literal(2),
});
const BasicTransfer = Schema.Struct({
  id,
  currency,
  transferAmount: amount,
  transferDate: loanCoreDateParts,
  reversed: Schema.Boolean,
  transferDescription: Schema.optional(Schema.NullOr(Schema.String)),
});
const Savings = Schema.Struct({
  id,
  clientId: id,
  currency,
  status: Schema.Struct({ active: Schema.Boolean }),
  withdrawalFeeForTransfers: Schema.Boolean,
  summary: Schema.Struct({ availableBalance: amount }),
  transactions: Schema.Array(
    Schema.Struct({
      id,
      accountId: Schema.optional(id),
      transactionType: Schema.Struct({ id }),
      currency,
      date: loanCoreDateParts,
      amount,
      reversed: Schema.Boolean,
      isReversal: Schema.optional(Schema.NullOr(Schema.Boolean)),
      transfer: Schema.optional(Schema.NullOr(BasicTransfer)),
    }),
  ).pipe(Schema.maxItems(2000)),
});
const FullTransfer = Schema.Struct({
  id,
  currency,
  reversed: Schema.Literal(false),
  transferAmount: amount,
  transferDate: LoanQuote.fields.expected_disbursement_date,
  transferDescription: Schema.String,
  fromOffice: Schema.Struct({ id }),
  toOffice: Schema.Struct({ id }),
  fromClient: Schema.Struct({ id }),
  toClient: Schema.Struct({ id }),
  fromAccountType: Schema.Struct({ id: Schema.Literal(2) }),
  toAccountType: Schema.Struct({ id: Schema.Literal(1) }),
  fromAccount: Schema.Struct({ id }),
  toAccount: Schema.Struct({ id }),
});
const unavailable = () =>
  new BankingError({
    message:
      "The owned Core repayment references could not be verified. Refresh explicitly before reviewing another instruction.",
    status: 503,
  });
const conflict = () =>
  new BankingError({
    message:
      "Core conditions changed. Review a new partial-repayment offer before another instruction.",
    status: 409,
  });
const uncertain = () =>
  new BankingError({
    message:
      "The original savings-funded repayment is unconfirmed. Inspect that original; do not repeat the transfer.",
    status: 503,
    uncertain: true,
  });
const decode = <A, I>(schema: Schema.Schema<A, I>, input: unknown) =>
  Schema.decodeUnknown(schema)(input).pipe(Effect.mapError(unavailable));
const date = (parts: readonly number[]) =>
  decode(LoanQuote.fields.expected_disbursement_date, loanCoreCalendar(parts));

export const loanRepayerLayer = Layer.effect(
  LoanRepayer,
  Effect.gen(function* () {
    const core = yield* Core;
    const enquiry = yield* LoanEnquiry;
    const readOwned = (lookup: LoanRepaymentLookup) =>
      Effect.gen(function* () {
        const sources = yield* Effect.all(
          {
            loan: enquiry.statement(lookup),
            savings: core.request(
              "GET",
              `savingsaccounts/${lookup.owner.savings_account_id}?associations=transactions`,
            ),
          },
          { concurrency: 2 },
        ).pipe(Effect.mapError(unavailable));
        const loan = yield* decode(CoreLoanSnapshot, sources.loan);
        const savings = yield* decode(Savings, sources.savings);
        if (
          loan.id !== lookup.core_id ||
          loan.external_id !== lookup.external_id ||
          loan.status !== "active" ||
          !loan.statement ||
          loan.owner.bank_id !== lookup.owner.bank_id ||
          loan.owner.client_id !== lookup.owner.client_id ||
          loan.owner.product_id !== lookup.owner.product_id ||
          loan.owner.savings_account_id !== lookup.owner.savings_account_id ||
          loan.expected_disbursement_date !==
            lookup.expected_disbursement_date ||
          loan.principal_minor !== lookup.terms.principal * 100 ||
          savings.id !== lookup.owner.savings_account_id ||
          savings.clientId !== lookup.owner.client_id ||
          savings.transactions.some(
            (row) =>
              row.accountId !== undefined && row.accountId !== savings.id,
          )
        )
          return yield* Effect.fail(unavailable());
        return { loan, savings };
      });
    const current = (lookup: LoanRepaymentLookup) =>
      Effect.gen(function* () {
        const sources = yield* Effect.all(
          {
            owned: readOwned(lookup),
            product: core.request(
              "GET",
              `loanproducts/${lookup.owner.product_id}`,
            ),
            client: core.request("GET", `clients/${lookup.owner.client_id}`),
          },
          { concurrency: 2 },
        ).pipe(Effect.mapError(unavailable));
        const product = yield* decode(coreLoanProductShape, sources.product);
        const client = yield* decode(
          Schema.Struct({ id, officeId: id, active: Schema.Literal(true) }),
          sources.client,
        );
        if (
          product.id !== lookup.owner.product_id ||
          client.id !== lookup.owner.client_id ||
          !sources.owned.savings.status.active ||
          sources.owned.savings.withdrawalFeeForTransfers
        )
          return yield* Effect.fail(conflict());
        return {
          ...sources.owned,
          office_id: client.officeId,
          available_minor: yield* loanCoreMinor(
            sources.owned.savings.summary.availableBalance,
          ),
        };
      });
    const verifyTransfer = (
      full: typeof FullTransfer.Type,
      offer: LoanRepaymentOffer,
      marker: string,
      transferId: number,
    ) =>
      Effect.gen(function* () {
        if (
          full.id !== transferId ||
          full.transferDescription !== marker ||
          full.transferDate !== offer.payment_date ||
          (yield* loanCoreMinor(full.transferAmount)) !== offer.amount_minor ||
          full.fromClient.id !== offer.owner.client_id ||
          full.toClient.id !== offer.owner.client_id ||
          full.fromOffice.id !== offer.office_id ||
          full.toOffice.id !== offer.office_id ||
          full.fromAccount.id !== offer.owner.savings_account_id ||
          full.toAccount.id !== offer.core_id
        )
          return yield* Effect.fail(uncertain());
      });
    const confirmOriginal = (original: LoanRepaymentInstruction) =>
      Effect.gen(function* () {
        const offer = original.offer;
        const marker = loanRepaymentMarker(original.operation_id);
        const { loan, savings } = yield* readOwned(offer);
        const loans =
          loan.statement?.transactions.filter(
            (row) => row.transfer?.repayment_marker === marker,
          ) ?? [];
        const withdrawals = savings.transactions.filter(
          (row) => row.transfer?.transferDescription === marker,
        );
        const row = loans[0],
          withdrawal = withdrawals[0];
        if (
          loans.length !== 1 ||
          withdrawals.length !== 1 ||
          !row ||
          !withdrawal ||
          row.type_id !== 2 ||
          row.manually_reversed ||
          row.date !== offer.payment_date ||
          row.amount_minor !== offer.amount_minor ||
          row.fees_minor !== 0 ||
          row.penalties_minor !== 0 ||
          row.overpayment_minor !== 0 ||
          !row.transfer ||
          row.transfer.reversed ||
          row.transfer.amount_minor !== offer.amount_minor ||
          row.transfer.date !== offer.payment_date ||
          withdrawal.transactionType.id !== 2 ||
          withdrawal.reversed ||
          withdrawal.isReversal === true ||
          !withdrawal.transfer ||
          withdrawal.transfer.reversed ||
          withdrawal.transfer.id !== row.transfer.id
        )
          return yield* Effect.fail(uncertain());
        if (
          (yield* loanCoreMinor(withdrawal.amount)) !== offer.amount_minor ||
          (yield* date(withdrawal.date)) !== offer.payment_date ||
          (yield* loanCoreMinor(withdrawal.transfer.transferAmount)) !==
            offer.amount_minor ||
          (yield* date(withdrawal.transfer.transferDate)) !== offer.payment_date
        )
          return yield* Effect.fail(uncertain());
        const full = yield* decode(
          FullTransfer,
          yield* core.request("GET", `accounttransfers/${row.transfer.id}`),
        );
        yield* verifyTransfer(full, offer, marker, row.transfer.id);
        return yield* decode(LoanRepaymentResult, {
          operation_id: original.operation_id,
          loan,
          loan_transaction_id: row.id,
          savings_transaction_id: withdrawal.id,
          transfer_id: full.id,
          amount_minor: offer.amount_minor,
          principal_minor: row.principal_minor,
          interest_minor: row.interest_minor,
          date: offer.payment_date,
        });
      });
    return {
      quote: (input: LoanRepaymentLookup, requested: number) =>
        Effect.gen(function* () {
          const lookup = yield* Schema.decodeUnknown(LoanRepaymentLookup, {
            onExcessProperty: "error",
          })(input).pipe(
            Effect.mapError(
              () =>
                new BankingError({
                  message:
                    "Choose one valid owned loan for a partial-repayment offer.",
                  status: 400,
                }),
            ),
          );
          const amountMinor = yield* Schema.decodeUnknown(LoanRepaymentAmount)(
            requested,
          ).pipe(
            Effect.mapError(
              () =>
                new BankingError({
                  message:
                    "Choose an exact repayment of at least ₹100, within the partial-payment limit.",
                  status: 400,
                }),
            ),
          );
          if (lookup.external_id !== `of-loan-${lookup.loan_id}`)
            return yield* Effect.fail(conflict());
          const source = yield* current(lookup);
          const now = yield* Clock.currentTimeMillis;
          if (
            !Number.isSafeInteger(now) ||
            now <= 0 ||
            !Number.isFinite(new Date(now).getTime())
          )
            return yield* Effect.fail(unavailable());
          const offer = yield* validateRepaymentOffer({
            ...lookup,
            id: crypto.randomUUID(),
            office_id: source.office_id,
            amount_minor: amountMinor,
            principal_outstanding_minor:
              source.loan.principal_outstanding_minor,
            outstanding_minor: source.loan.outstanding_minor,
            available_minor: source.available_minor,
            payment_date: bankingDate(now),
            quoted_at: now,
            expires_at: now + 900000,
          });
          return { offer, loan: source.loan };
        }),
      confirm: (input: LoanRepaymentInstruction) =>
        Effect.gen(function* () {
          const original = yield* validateRepaymentInstruction(
            input,
            yield* Clock.currentTimeMillis,
            "confirm",
          );
          return yield* confirmOriginal(original).pipe(
            Effect.mapError(uncertain),
          );
        }),
      dispatch: (input: LoanRepaymentInstruction) =>
        Effect.gen(function* () {
          const original = yield* validateRepaymentInstruction(
            input,
            yield* Clock.currentTimeMillis,
            "dispatch",
          );
          const offer = original.offer;
          const source = yield* current(offer);
          const marker = loanRepaymentMarker(original.operation_id);
          if (
            source.loan.statement?.transactions.some(
              (row) => row.transfer?.repayment_marker === marker,
            ) ||
            source.savings.transactions.some(
              (row) => row.transfer?.transferDescription === marker,
            )
          )
            return yield* Effect.fail(uncertain());
          if (
            source.office_id !== offer.office_id ||
            source.loan.principal_outstanding_minor !==
              offer.principal_outstanding_minor ||
            source.loan.outstanding_minor !== offer.outstanding_minor ||
            source.available_minor < offer.amount_minor ||
            source.loan.principal_outstanding_minor === null ||
            offer.amount_minor >= source.loan.principal_outstanding_minor
          )
            return yield* Effect.fail(conflict());
          yield* validateRepaymentInstruction(
            original,
            yield* Clock.currentTimeMillis,
            "dispatch",
          );
          const acknowledgement = yield* core
            .request(
              "POST",
              "accounttransfers",
              {
                ...dateFields(),
                fromOfficeId: offer.office_id,
                toOfficeId: offer.office_id,
                fromClientId: offer.owner.client_id,
                toClientId: offer.owner.client_id,
                fromAccountType: 2,
                toAccountType: 1,
                fromAccountId: offer.owner.savings_account_id,
                toAccountId: offer.core_id,
                transferDate: offer.payment_date,
                transferAmount: offer.amount_minor / 100,
                transferDescription: marker,
              },
              original.key,
            )
            .pipe(
              Effect.mapError((error) =>
                error.uncertain === false
                  ? new BankingError({
                      message:
                        "Core declined this original partial repayment. Review its saved outcome before any new attempt.",
                      status: error.status,
                      uncertain: false,
                    })
                  : uncertain(),
              ),
            );
          return yield* Effect.gen(function* () {
            const ack = yield* decode(
              Schema.Struct({ resourceId: id, savingsId: id }),
              acknowledgement,
            ).pipe(Effect.mapError(uncertain));
            if (ack.savingsId !== offer.owner.savings_account_id)
              return yield* Effect.fail(uncertain());
            const result = yield* confirmOriginal(original).pipe(
              Effect.mapError(uncertain),
            );
            const page = yield* decode(
              Schema.Struct({
                totalFilteredRecords: Schema.Literal(1),
                pageItems: Schema.Array(FullTransfer).pipe(
                  Schema.itemsCount(1),
                ),
              }),
              yield* core.request(
                "GET",
                `accounttransfers?accountDetailId=${ack.resourceId}`,
              ),
            ).pipe(Effect.mapError(uncertain));
            yield* verifyTransfer(
              page.pageItems[0],
              offer,
              marker,
              result.transfer_id,
            );
            return result;
          }).pipe(Effect.mapError(uncertain));
        }),
    };
  }),
);
