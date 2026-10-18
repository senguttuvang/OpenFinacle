import {
  emptyOnboarding,
  type OnboardingFields,
} from "../../src/domain/onboarding";
export const completedOnboarding: OnboardingFields = {
  ...emptyOnboarding,
  eligible: true,
  name: "Demo Ananya Rao",
  email: "ananya@example.test",
  phone: "DEMO-PHONE-01",
  contactVerified: true,
  birthDate: "1990-01-01",
  address: "Demo 14 Sample Avenue",
  city: "Chennai",
  pincode: "600020",
  occupation: "Salaried",
  nomineeChoice: "add",
  nomineeName: "Demo Kavya Rao",
  nomineeRelationship: "Sibling",
  identityChecked: true,
  termsAccepted: true,
  accuracyConfirmed: true,
};
