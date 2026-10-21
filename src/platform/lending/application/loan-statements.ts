import { Effect } from "effect";
import type { Session } from "../../banking-workspace/domain/banking";
import { loanStatementCsv } from "../domain/origination/loan-statements";
import { loanFailure, savedLoanDetail } from "./loan-records";

export const savedLoanStatement = (session: Session, id: string) =>
  Effect.gen(function* () {
    const detail = yield* savedLoanDetail(session, id);
    const core = detail.core;
    if (!core?.snapshot.statement)
      return yield* loanFailure(
        "No saved Core statement is available. Open this active loan and refresh its Core observation explicitly.",
      );
    const pending =
      detail.operation?.status === "executing" ||
      detail.operation?.status === "uncertain";
    return {
      core_id: core.snapshot.id,
      csv: loanStatementCsv(
        core.snapshot.statement,
        core.snapshot.id,
        core.synced_at,
        core.stale || pending,
      ),
    };
  });
