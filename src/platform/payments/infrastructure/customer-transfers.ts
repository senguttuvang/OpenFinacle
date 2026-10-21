import { Clock, Effect, Layer, Schema } from "effect";
import {
  BankingError,
  bankingDate,
  dateFields,
} from "../../banking-workspace/domain/banking";
import { Core } from "../../banking-workspace/domain/ports";
import {
  type RegisteredCustomer,
  type TransferInstruction,
  type TransferReceipt,
  transferMarker,
} from "../../customers/domain/customer-registry";
import { LoanQuote } from "../../lending/domain/origination/loans";
import {
  loanCoreCalendar,
  loanCoreDateParts,
} from "../../lending/infrastructure/loan-engine";
import { CustomerTransfers } from "../domain/customer-transfers";

const id = Schema.Number.pipe(Schema.int(), Schema.positive());
const currency = Schema.Struct({
  code: Schema.Literal("INR"),
  decimalPlaces: Schema.Literal(2),
});
const money = Schema.Number.pipe(Schema.nonNegative());
const calendarDate = LoanQuote.fields.expected_disbursement_date;
const dateParts = loanCoreDateParts.pipe(
  Schema.filter((value) => Schema.is(calendarDate)(loanCoreCalendar(value))),
);
const transfer = Schema.Struct({
  id,
  reversed: Schema.Boolean,
  transferDescription: Schema.optional(Schema.NullOr(Schema.String)),
  transferAmount: money,
  transferDate: Schema.Union(dateParts, calendarDate),
});
const savings = Schema.Struct({
  id,
  clientId: id,
  accountNo: Schema.NonEmptyString,
  currency,
  status: Schema.Struct({ active: Schema.Boolean }),
  subStatus: Schema.optional(
    Schema.Struct({
      blockDebit: Schema.optional(Schema.Boolean),
      blockCredit: Schema.optional(Schema.Boolean),
      block: Schema.optional(Schema.Boolean),
    }),
  ),
  allowOverdraft: Schema.Boolean,
  withdrawalFeeForTransfers: Schema.Boolean,
  summary: Schema.Struct({ availableBalance: money, accountBalance: money }),
  transactions: Schema.optional(
    Schema.Array(
      Schema.Struct({
        id,
        accountId: Schema.optional(id),
        currency,
        date: dateParts,
        amount: money,
        reversed: Schema.Boolean,
        isReversal: Schema.optional(Schema.NullOr(Schema.Boolean)),
        transactionType: Schema.Struct({ id }),
        transfer: Schema.optional(Schema.NullOr(transfer)),
      }),
    ).pipe(Schema.maxItems(10000)),
  ),
});
const fullTransfer = Schema.Struct({
  id,
  currency,
  reversed: Schema.Literal(false),
  transferAmount: money,
  transferDate: calendarDate,
  transferDescription: Schema.String,
  fromOffice: Schema.Struct({ id }),
  toOffice: Schema.Struct({ id }),
  fromClient: Schema.Struct({ id }),
  toClient: Schema.Struct({ id }),
  fromAccount: Schema.Struct({ id }),
  toAccount: Schema.Struct({ id }),
  fromAccountType: Schema.Struct({ id: Schema.Literal(2) }),
  toAccountType: Schema.Struct({ id: Schema.Literal(2) }),
});
const unavailable = () =>
  new BankingError({
    message:
      "The selected INR savings accounts could not be verified. Refresh the selected account before reviewing again.",
    status: 503,
  });
const uncertain = () =>
  new BankingError({
    message:
      "Transfer confirmation requires both original Core statement entries and receipt. Inspect this instruction; do not send it again.",
    status: 503,
    uncertain: true,
  });
const conflict = () =>
  new BankingError({
    message:
      "Available funds or account eligibility changed. Review the current account before another instruction.",
    status: 409,
    uncertain: false,
  });
const minor = (value: number) =>
  Effect.try({
    try: () => {
      const result = Math.round(value * 100);
      if (
        !Number.isSafeInteger(result) ||
        result < 0 ||
        Math.abs(value * 100 - result) > 0.000001
      )
        throw unavailable();
      return result;
    },
    catch: unavailable,
  });
const calendar = (value: readonly number[] | string) =>
  typeof value === "string" ? value : loanCoreCalendar(value);
const decode = <A, I>(schema: Schema.Schema<A, I>, input: unknown) =>
  Schema.decodeUnknown(schema)(input).pipe(Effect.mapError(unavailable));

export const customerTransferLayer = Layer.effect(
  CustomerTransfers,
  Effect.gen(function* () {
    const core = yield* Core;
    const owned = (customer: RegisteredCustomer) =>
      Effect.gen(function* () {
        const account = yield* decode(
          savings,
          yield* core.request(
            "GET",
            `savingsaccounts/${customer.account_id}?associations=transactions`,
          ),
        );
        const client = yield* decode(
          Schema.Struct({ id, officeId: id, active: Schema.Boolean }),
          yield* core.request("GET", `clients/${customer.client_id}`),
        );
        if (
          account.id !== customer.account_id ||
          account.clientId !== customer.client_id ||
          account.accountNo !== customer.account_no ||
          client.id !== customer.client_id ||
          !client.active
        )
          return yield* Effect.fail(unavailable());
        // Core omits the association for a newly opened, empty account. Never
        // interpret missing history on a funded account as an empty statement.
        if (
          account.transactions === undefined &&
          (account.summary.accountBalance !== 0 ||
            account.summary.availableBalance !== 0)
        )
          return yield* Effect.fail(unavailable());
        return {
          account: { ...account, transactions: account.transactions ?? [] },
          office: client.officeId,
        };
      });
    const pair = (sender: RegisteredCustomer, recipient: RegisteredCustomer) =>
      Effect.gen(function* () {
        if (
          sender.id === recipient.id ||
          sender.account_id === recipient.account_id ||
          sender.branch_id !== recipient.branch_id ||
          sender.status !== "active" ||
          recipient.status !== "active"
        )
          return yield* Effect.fail(conflict());
        const [source, target] = yield* Effect.all(
          [owned(sender), owned(recipient)],
          { concurrency: 2 },
        );
        if (source.office !== target.office)
          return yield* Effect.fail(conflict());
        return { source, target };
      });
    const available = (
      sender: RegisteredCustomer,
      recipient: RegisteredCustomer,
    ) =>
      Effect.gen(function* () {
        const { source, target } = yield* pair(sender, recipient);
        if (
          !source.account.status.active ||
          !target.account.status.active ||
          source.account.allowOverdraft ||
          source.account.withdrawalFeeForTransfers ||
          source.account.subStatus?.blockDebit ||
          source.account.subStatus?.block ||
          target.account.subStatus?.block ||
          target.account.subStatus?.blockCredit
        )
          return yield* Effect.fail(conflict());
        return yield* minor(source.account.summary.availableBalance);
      });
    const confirm = (
      input: TransferInstruction,
    ): Effect.Effect<TransferReceipt, BankingError> =>
      Effect.gen(function* () {
        const { source, target } = yield* pair(input.sender, input.recipient);
        const marker = transferMarker(input.operation_id);
        const debits = source.account.transactions.filter(
          (row) => row.transfer?.transferDescription === marker,
        );
        const credits = target.account.transactions.filter(
          (row) => row.transfer?.transferDescription === marker,
        );
        const debit = debits[0],
          credit = credits[0];
        if (
          debits.length !== 1 ||
          credits.length !== 1 ||
          !debit?.transfer ||
          !credit?.transfer ||
          debit.transactionType.id !== 2 ||
          credit.transactionType.id !== 1 ||
          debit.transfer.id !== credit.transfer.id
        )
          return yield* Effect.fail(uncertain());
        for (const [row, owner] of [
          [debit, input.sender],
          [credit, input.recipient],
        ] as const) {
          if (
            row.reversed ||
            row.isReversal ||
            !row.transfer ||
            row.transfer.reversed ||
            (row.accountId !== undefined &&
              row.accountId !== owner.account_id) ||
            calendar(row.date) !== input.date ||
            calendar(row.transfer.transferDate) !== input.date ||
            (yield* minor(row.amount)) !== input.amount_minor ||
            (yield* minor(row.transfer.transferAmount)) !== input.amount_minor
          )
            return yield* Effect.fail(uncertain());
        }
        const receipt = yield* decode(
          fullTransfer,
          yield* core.request("GET", `accounttransfers/${debit.transfer.id}`),
        );
        if (
          receipt.id !== debit.transfer.id ||
          receipt.transferDescription !== marker ||
          receipt.transferDate !== input.date ||
          (yield* minor(receipt.transferAmount)) !== input.amount_minor ||
          receipt.fromClient.id !== input.sender.client_id ||
          receipt.toClient.id !== input.recipient.client_id ||
          receipt.fromAccount.id !== input.sender.account_id ||
          receipt.toAccount.id !== input.recipient.account_id ||
          receipt.fromOffice.id !== source.office ||
          receipt.toOffice.id !== target.office
        )
          return yield* Effect.fail(uncertain());
        return {
          transfer_id: receipt.id,
          debit_id: debit.id,
          credit_id: credit.id,
          amount_minor: input.amount_minor,
          date: input.date,
          source_balance_minor: yield* minor(
            source.account.summary.accountBalance,
          ),
          recipient_balance_minor: yield* minor(
            target.account.summary.accountBalance,
          ),
        };
      }).pipe(Effect.mapError(uncertain));
    return {
      available,
      confirm,
      dispatch: (input: TransferInstruction) =>
        Effect.gen(function* () {
          if (
            !Number.isSafeInteger(input.amount_minor) ||
            input.amount_minor <= 0 ||
            input.amount_minor > 1000000000 ||
            input.date !== bankingDate(yield* Clock.currentTimeMillis)
          )
            return yield* Effect.fail(conflict());
          const funds = yield* available(input.sender, input.recipient);
          if (funds < input.amount_minor) return yield* Effect.fail(conflict());
          const { source } = yield* pair(input.sender, input.recipient);
          if (
            source.account.transactions.some(
              (row) =>
                row.transfer?.transferDescription ===
                transferMarker(input.operation_id),
            )
          )
            return yield* Effect.fail(uncertain());
          yield* core
            .request(
              "POST",
              "accounttransfers",
              {
                ...dateFields(),
                fromOfficeId: source.office,
                toOfficeId: source.office,
                fromClientId: input.sender.client_id,
                toClientId: input.recipient.client_id,
                fromAccountType: 2,
                toAccountType: 2,
                fromAccountId: input.sender.account_id,
                toAccountId: input.recipient.account_id,
                transferDate: input.date,
                transferAmount: input.amount_minor / 100,
                transferDescription: transferMarker(input.operation_id),
              },
              input.operation_id,
            )
            .pipe(
              Effect.mapError((error) =>
                error.uncertain === false ? error : uncertain(),
              ),
            );
          return yield* confirm(input);
        }),
    };
  }),
);
