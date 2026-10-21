import { BankingError } from "../../banking-workspace/domain/banking";

export const coreHttpFailure = (
  method: string,
  status: number,
  message: string,
) =>
  new BankingError({
    message,
    status: status >= 500 ? 503 : 422,
    // Fineract can return 409 while the original idempotent command is processing.
    uncertain: method !== "GET" && (status === 409 || status >= 500),
  });
