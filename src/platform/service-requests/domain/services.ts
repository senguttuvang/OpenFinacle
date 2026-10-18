import { Effect } from "effect";
import { BankingError } from "../../banking-workspace/domain/banking";

interface ServiceField {
  key: string;
  label: string;
  type: "text" | "textarea" | "email" | "date" | "select";
  maxLength: number;
  options?: readonly string[];
  format?: "pincode" | "reference";
}
export interface ServiceDefinition {
  code: string;
  title: string;
  category: string;
  group: string;
  description: string;
  approval: boolean;
  delivery: "none" | "physical";
  fields: readonly ServiceField[];
  evidence: "directory_observed_form_inferred";
  backend: "simulated_service";
}

const field = (
  key: string,
  label: string,
  type: ServiceField["type"] = "text",
): ServiceField => ({
  key,
  label,
  type,
  maxLength: type === "textarea" ? 500 : 200,
});
const choice = (
  key: string,
  label: string,
  options: readonly string[],
): ServiceField => ({ key, label, type: "select", options, maxLength: 200 });
const explanation = field("explanation", "Request details", "textarea");
const address: readonly ServiceField[] = [
  field("address", "Address", "textarea"),
  field("city", "City"),
  {
    key: "pincode",
    label: "PIN code",
    type: "text",
    format: "pincode",
    maxLength: 6,
  },
];
const delivery = choice("delivery", "Delivery preference", [
  "Registered address",
  "Collect at branch",
]);
const enquiryReference: ServiceField = {
  key: "reference",
  label: "Transaction or request reference",
  type: "text",
  format: "reference",
  maxLength: 80,
};
const service = (
  code: string,
  title: string,
  category: string,
  group: string,
  description: string,
  fields: readonly ServiceField[],
  approval = false,
  physical = false,
): ServiceDefinition => ({
  code,
  title,
  category,
  group,
  description,
  fields,
  approval,
  delivery: physical ? "physical" : "none",
  evidence: "directory_observed_form_inferred",
  backend: "simulated_service",
});

// Directory families were observed; these forms are inferred demonstration contracts.
// Never include customer data or imply that a simulated case changes a core account.
export const serviceCatalog: readonly ServiceDefinition[] = [
  service(
    "address_change",
    "Update address",
    "Bank accounts",
    "Account changes",
    "Request a review of your new communication address.",
    address,
    true,
  ),
  service(
    "email_change",
    "Update email address",
    "Bank accounts",
    "Account changes",
    "Ask the branch to verify a new email address.",
    [field("email", "New email address", "email"), explanation],
    true,
  ),
  service(
    "branch_transfer",
    "Transfer account to another branch",
    "Bank accounts",
    "Account changes",
    "Request a branch transfer and track the review.",
    [field("branch", "Requested branch"), explanation],
    true,
  ),
  service(
    "employer_change",
    "Update employer details",
    "Bank accounts",
    "Account changes",
    "Submit updated employment information for review.",
    [field("employer", "Employer name"), explanation],
    true,
  ),
  service(
    "statement_email",
    "Request statement by email",
    "Bank accounts",
    "Statements",
    "Request delivery of an account statement to your registered email.",
    [field("from", "From date", "date"), field("to", "To date", "date")],
  ),
  service(
    "statement_physical",
    "Request a printed statement",
    "Bank accounts",
    "Statements",
    "Choose a statement period and delivery preference.",
    [
      field("from", "From date", "date"),
      field("to", "To date", "date"),
      delivery,
    ],
    false,
    true,
  ),
  service(
    "atm_cash_query",
    "Cash withdrawal enquiry — bank ATM",
    "Bank accounts",
    "Transaction enquiries",
    "Raise a query about cash not received or an unexpected debit.",
    [enquiryReference, field("date", "Transaction date", "date"), explanation],
  ),
  service(
    "other_atm_query",
    "Cash withdrawal enquiry — another bank ATM",
    "Bank accounts",
    "Transaction enquiries",
    "Provide the transaction reference and ATM location for investigation.",
    [
      enquiryReference,
      field("location", "ATM location"),
      field("date", "Transaction date", "date"),
      explanation,
    ],
  ),
  service(
    "chequebook",
    "Request a chequebook",
    "Bank accounts",
    "Cheque and draft services",
    "Choose a chequebook and tell us how you would like to receive it.",
    [choice("leaves", "Number of cheque leaves", ["10", "25", "50"]), delivery],
    false,
    true,
  ),
  service(
    "chequebook_missing",
    "Chequebook not received",
    "Bank accounts",
    "Cheque and draft services",
    "Ask us to investigate a previous chequebook request.",
    [enquiryReference, explanation],
  ),
  service(
    "cheque_credit_query",
    "Deposited cheque not credited",
    "Bank accounts",
    "Cheque and draft services",
    "Request an investigation of a cheque deposited into your account.",
    [enquiryReference, field("date", "Deposit date", "date"), explanation],
  ),
  service(
    "item_redelivery",
    "Request redelivery",
    "Bank accounts",
    "Cheque and draft services",
    "Request another delivery attempt for an undelivered banking item.",
    [
      choice("item", "Item", ["Debit card", "Chequebook", "Returned cheque"]),
      enquiryReference,
      delivery,
    ],
    false,
    true,
  ),
  service(
    "debit_card",
    "Request a replacement debit card",
    "Bank accounts",
    "Debit card services",
    "Request replacement of a damaged or expired card. Blocking is a separate control.",
    [
      choice("reason", "Replacement reason", ["Damaged card", "Expired card"]),
      delivery,
    ],
    false,
    true,
  ),
  service(
    "debit_card_missing",
    "Debit card not received",
    "Bank accounts",
    "Debit card services",
    "Track a previously requested debit card.",
    [enquiryReference, explanation],
  ),
  service(
    "debit_card_upgrade",
    "Request a debit card upgrade",
    "Bank accounts",
    "Debit card services",
    "Ask the branch to review your card upgrade request.",
    [field("preference", "Requested card or benefit"), explanation],
    true,
  ),
  service(
    "credit_card_address",
    "Update credit card address",
    "Credit cards",
    "Card maintenance",
    "Request verification of a new credit card correspondence address.",
    address,
    true,
  ),
  service(
    "credit_card_email",
    "Update credit card email",
    "Credit cards",
    "Card maintenance",
    "Request an email update for card correspondence.",
    [field("email", "New email address", "email"), explanation],
    true,
  ),
  service(
    "billing_cycle",
    "Request a billing cycle change",
    "Credit cards",
    "Card maintenance",
    "Ask the card servicing team to review a preferred billing day.",
    [
      choice("day", "Preferred billing day", ["5", "10", "15", "20", "25"]),
      explanation,
    ],
    true,
  ),
  service(
    "credit_card_query",
    "Raise a credit card enquiry",
    "Credit cards",
    "Card enquiries",
    "Record a card servicing enquiry without entering card credentials.",
    [
      choice("topic", "Enquiry topic", [
        "Statement",
        "Payment",
        "Fees",
        "Delivery",
      ]),
      explanation,
    ],
  ),
  service(
    "deposit_nominee_query",
    "Deposit nominee servicing enquiry",
    "Deposits",
    "Deposit servicing",
    "Request help with nominee servicing for a deposit.",
    [field("deposit", "Deposit reference"), explanation],
  ),
  service(
    "loan_noc",
    "Request a loan closure certificate",
    "Loans",
    "Loan documents",
    "Ask the lending team to check eligibility for a no-dues certificate.",
    [field("loan", "Loan reference"), explanation],
    true,
  ),
  service(
    "demat_link",
    "Request demat account linking",
    "Demat and linked accounts",
    "Account linking",
    "Submit a demat reference for linking review.",
    [field("demat", "Demat reference"), explanation],
    true,
  ),
  service(
    "account_link",
    "Request account linking",
    "Demat and linked accounts",
    "Account linking",
    "Ask the branch to review an additional relationship link.",
    [
      choice("relationship", "Relationship type", [
        "Joint account",
        "Policy",
        "Savings account",
      ]),
      field("reference", "Relationship reference"),
      explanation,
    ],
    true,
  ),
  service(
    "forex_card_link",
    "Request forex card linking",
    "Forex and travel cards",
    "Card servicing",
    "Request a review of a forex card relationship.",
    [field("reference", "Forex card reference"), explanation],
    true,
  ),
];

export const serviceDefinition = (code: string) =>
  serviceCatalog.find((entry) => entry.code === code);

const validContactEmail = (value: string) => {
  const [local = "", host = "", ...extra] = value.split("@");
  return (
    Boolean(local) &&
    extra.length === 0 &&
    !/\s/.test(value) &&
    host.slice(1, -1).includes(".")
  );
};

export const validateServiceFields = (
  definition: ServiceDefinition,
  values: Readonly<Record<string, string>>,
) =>
  Effect.gen(function* () {
    const fail = (message: string) =>
      Effect.fail(new BankingError({ message, status: 400 }));
    if (
      Object.keys(values).some(
        (key) => !definition.fields.some((f) => f.key === key),
      )
    )
      return yield* fail(
        "The request contains a field that this service does not accept.",
      );
    const normalized: Record<string, string> = {};
    for (const f of definition.fields) {
      const value = values[f.key]?.trim() ?? "";
      if (!value || value.length > f.maxLength)
        return yield* fail(
          `Enter ${f.label.toLowerCase()} within the displayed length limit.`,
        );
      if (f.type === "select" && !f.options?.includes(value))
        return yield* fail(
          `Choose a listed option for ${f.label.toLowerCase()}.`,
        );
      if (f.type === "email" && !validContactEmail(value))
        return yield* fail("Enter a valid email address.");
      if (f.format === "pincode" && !/^[1-9][0-9]{5}$/.test(value))
        return yield* fail(
          "Enter a six-digit PIN code that does not start with zero.",
        );
      if (
        f.format === "reference" &&
        !/^[a-zA-Z0-9][a-zA-Z0-9 /_-]{2,79}$/.test(value)
      )
        return yield* fail(
          "Enter a reference of 3–80 letters, numbers, spaces, hyphens or slashes.",
        );
      if (f.type === "date") {
        const instant = Date.parse(`${value}T00:00:00Z`);
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          !Number.isFinite(instant) ||
          new Date(instant).toISOString().slice(0, 10) !== value
        )
          return yield* fail(`Enter a valid ${f.label.toLowerCase()}.`);
      }
      normalized[f.key] = value;
    }
    if (normalized.from && normalized.to && normalized.from > normalized.to)
      return yield* fail(
        "The statement end date must be on or after its start date.",
      );
    return normalized;
  });
