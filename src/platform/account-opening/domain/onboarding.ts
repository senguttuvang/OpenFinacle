import { Schema } from "effect";

export const onboardingSteps = [
  "Savings account",
  "Contact",
  "Personal details",
  "Address and tax",
  "Nominee",
  "Identity check",
  "Review and submit",
] as const;

export const OnboardingFields = Schema.Struct({
  product: Schema.Literal("everyday"),
  eligible: Schema.Boolean,
  name: Schema.String,
  email: Schema.String,
  phone: Schema.String,
  contactVerified: Schema.Boolean,
  birthDate: Schema.String,
  address: Schema.String,
  city: Schema.String,
  pincode: Schema.String,
  taxResidency: Schema.Literal("india", "other"),
  occupation: Schema.String,
  nomineeChoice: Schema.Literal("add", "decline", ""),
  nomineeName: Schema.String,
  nomineeRelationship: Schema.String,
  identityChecked: Schema.Boolean,
  termsAccepted: Schema.Boolean,
  accuracyConfirmed: Schema.Boolean,
});
export type OnboardingFields = typeof OnboardingFields.Type;
export type OnboardingErrors = Partial<Record<keyof OnboardingFields, string>>;
export const emptyOnboarding: OnboardingFields = {
  product: "everyday",
  eligible: false,
  name: "",
  email: "",
  phone: "",
  contactVerified: false,
  birthDate: "",
  address: "",
  city: "",
  pincode: "",
  taxResidency: "india",
  occupation: "",
  nomineeChoice: "",
  nomineeName: "",
  nomineeRelationship: "",
  identityChecked: false,
  termsAccepted: false,
  accuracyConfirmed: false,
};

// Fictional contact and address values are deliberately accepted instead of live identifiers.
export const validateOnboarding = (
  fields: OnboardingFields,
  step?: number,
): OnboardingErrors => {
  const errors: OnboardingErrors = {};
  const at = (index: number) => step === undefined || step === index;
  if (at(0) && !fields.eligible)
    errors.eligible =
      "Confirm this sample applicant is an adult resident of India.";
  if (at(1)) {
    if (!/^[a-z0-9._+-]+@example\.test$/i.test(fields.email))
      errors.email = "Use a fictional email ending in @example.test.";
    if (!/^DEMO-PHONE-0[1-9]$/.test(fields.phone))
      errors.phone = "Choose a sample mobile contact.";
    if (!fields.contactVerified)
      errors.contactVerified = "Complete the simulated contact check.";
  }
  if (at(2)) {
    if (!/^Demo [a-z][a-z .'-]{2,70}$/i.test(fields.name))
      errors.name =
        "Use a fictional name beginning with Demo, such as Demo Ananya Rao.";
    if (!["1990-01-01", "1985-06-15", "2000-03-20"].includes(fields.birthDate))
      errors.birthDate = "Choose an adult sample date of birth.";
  }
  if (at(3)) {
    if (!/^Demo [a-z0-9 ,.'/-]{8,140}$/i.test(fields.address))
      errors.address = "Use a fictional address beginning with Demo.";
    if (!["Chennai", "Bengaluru", "Mumbai"].includes(fields.city))
      errors.city = "Choose a sample city.";
    if (!/^[1-9]\d{5}$/.test(fields.pincode))
      errors.pincode = "Enter a six-digit postal code.";
    if (fields.taxResidency !== "india")
      errors.taxResidency =
        "This demo supports applicants resident for tax only in India. Choose India to continue with the sample journey.";
    if (
      !["Salaried", "Self-employed", "Student", "Retired"].includes(
        fields.occupation,
      )
    )
      errors.occupation = "Choose an occupation.";
  }
  if (at(4)) {
    if (!fields.nomineeChoice)
      errors.nomineeChoice = "Choose whether to add a nominee.";
    if (fields.nomineeChoice === "add") {
      if (!/^Demo [a-z][a-z .'-]{2,70}$/i.test(fields.nomineeName))
        errors.nomineeName =
          "Use a fictional nominee name beginning with Demo.";
      if (
        !["Spouse", "Parent", "Sibling", "Adult child"].includes(
          fields.nomineeRelationship,
        )
      )
        errors.nomineeRelationship = "Choose the nominee relationship.";
    }
  }
  if (at(5) && !fields.identityChecked)
    errors.identityChecked = "Review the sample identity and address pack.";
  if (at(6)) {
    if (!fields.termsAccepted)
      errors.termsAccepted = "Accept the demo savings terms before submitting.";
    if (!fields.accuracyConfirmed)
      errors.accuracyConfirmed =
        "Confirm you reviewed this fictional application.";
  }
  return errors;
};

export interface OnboardingDraft {
  canInspectOpening?: boolean;
  id: string;
  operationId: string;
  bankId: string;
  version: number;
  step: number;
  fields: OnboardingFields;
  status: "draft" | "submitting" | "submitted" | "submission_exception";
  applicationStatus: string | null;
  account: { id: number; accountNo: string } | null;
}
export const OnboardingSave = Schema.Struct({
  version: Schema.Int.pipe(Schema.nonNegative()),
  step: Schema.Int.pipe(Schema.between(0, 6)),
  fields: OnboardingFields,
});
