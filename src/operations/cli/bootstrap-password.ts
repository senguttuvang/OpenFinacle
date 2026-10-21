// Fineract 1.15.0's active strong policy rejects consecutive repeated characters.
const policy =
  /^(?!.*(.)\1)(?!.*\s)(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[^\w\s]).{12,50}$/;
export const bootstrapPasswordAcceptable = (value: string): boolean =>
  policy.test(value);
export const createBootstrapPassword = (): string => {
  let candidate = "";
  do {
    candidate = `${crypto.randomUUID()}Aa9!`;
  } while (!bootstrapPasswordAcceptable(candidate));
  return candidate;
};
