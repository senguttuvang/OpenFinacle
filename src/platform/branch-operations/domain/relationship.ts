import { Schema } from "effect";
import { ProfileDetail } from "../../customers/domain/profile";
import { CoreDateEvidence } from "./core-account";
import { nativeMinor } from "./inr-money";

const finite = Schema.Number.pipe(Schema.finite());
const option = Schema.Struct({ id: Schema.Number, value: Schema.String });
const currency = Schema.Struct({
  code: Schema.String.pipe(Schema.pattern(/^[A-Z]{3}$/)),
  decimalPlaces: Schema.optional(Schema.Number),
});
const exactAmounts = (
  source: { code: string; decimalPlaces?: number } | undefined,
  amounts: (number | undefined)[],
) =>
  amounts.every(
    (amount) =>
      amount === undefined ||
      (source !== undefined &&
        (source.code !== "INR" || source.decimalPlaces === 2) &&
        nativeMinor(amount, source.decimalPlaces) !== null),
  );
export const CoreClientEvidence = Schema.Struct({
  id: Schema.Number,
  accountNo: Schema.String,
  displayName: Schema.String,
  active: Schema.optional(Schema.Boolean),
  status: option,
  legalForm: Schema.optional(option),
  officeId: Schema.Number,
  officeName: Schema.optional(Schema.String),
  activationDate: Schema.optional(CoreDateEvidence),
});
const portfolioAccount = Schema.Struct({
  id: Schema.Number,
  accountNo: Schema.String,
  productId: Schema.optional(Schema.Number),
  productName: Schema.optional(Schema.String),
  status: option,
  currency: Schema.optional(currency),
  accountBalance: Schema.optional(finite),
  availableBalance: Schema.optional(finite),
  loanBalance: Schema.optional(finite),
}).pipe(
  Schema.filter((row) =>
    exactAmounts(row.currency, [
      row.accountBalance,
      row.availableBalance,
      row.loanBalance,
    ]),
  ),
);
export const CorePortfolioEvidence = Schema.Struct({
  savingsAccounts: Schema.optional(Schema.Array(portfolioAccount)),
  loanAccounts: Schema.optional(Schema.Array(portfolioAccount)),
  workingCapitalLoanAccounts: Schema.optional(Schema.Array(portfolioAccount)),
});
export const CoreDocumentsEvidence = Schema.Array(
  Schema.Struct({
    id: Schema.Number,
    name: Schema.String,
    fileName: Schema.optional(Schema.String),
    description: Schema.optional(Schema.String),
    size: Schema.optional(finite),
  }),
);
export const CoreChargesEvidence = Schema.Array(
  Schema.Struct({
    id: Schema.Number,
    name: Schema.String,
    currency: Schema.optional(currency),
    amount: Schema.optional(finite),
    amountPaid: Schema.optional(finite),
    amountOutstanding: Schema.optional(finite),
    paid: Schema.optional(Schema.Boolean),
    waived: Schema.optional(Schema.Boolean),
  }).pipe(
    Schema.filter((row) =>
      exactAmounts(row.currency, [
        row.amount,
        row.amountPaid,
        row.amountOutstanding,
      ]),
    ),
  ),
);
export const RelationshipEnquiry = Schema.Struct({
  observedAt: finite,
  client: Schema.NullOr(CoreClientEvidence),
  portfolio: Schema.NullOr(CorePortfolioEvidence),
  selectedSavings: Schema.NullOr(portfolioAccount),
  coreDocuments: Schema.NullOr(CoreDocumentsEvidence),
  charges: Schema.NullOr(CoreChargesEvidence),
  applicationDocuments: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      kind: Schema.String,
      size: finite,
      created_at: Schema.String,
    }),
  ),
  profile: Schema.NullOr(ProfileDetail),
  nominee: Schema.NullOr(
    Schema.Struct({
      choice: Schema.Literal("add", "decline", ""),
      name: Schema.String,
      relationship: Schema.String,
      version: Schema.Number,
    }),
  ),
  errors: Schema.Array(
    Schema.Struct({ source: Schema.String, message: Schema.String }),
  ),
});
export type RelationshipEnquiry = typeof RelationshipEnquiry.Type;
