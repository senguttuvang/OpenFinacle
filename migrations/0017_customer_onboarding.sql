-- Additive only. Applicant scope is owned by the customer registry (0016).
CREATE TABLE IF NOT EXISTS onboarding_drafts (
  id TEXT PRIMARY KEY,
  bank_id TEXT NOT NULL UNIQUE REFERENCES banks(id),
  operation_id TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 0,
  step INTEGER NOT NULL DEFAULT 0 CHECK(step BETWEEN 0 AND 6),
  fields TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitting','submitted','submission_exception')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER onboarding_original_identity BEFORE UPDATE ON onboarding_drafts BEGIN
  SELECT CASE WHEN NEW.id<>OLD.id OR NEW.bank_id<>OLD.bank_id OR NEW.operation_id<>OLD.operation_id OR NEW.created_at<>OLD.created_at
    THEN RAISE(ABORT,'Original onboarding identity is permanent') END;
  SELECT CASE WHEN OLD.status<>'draft' AND (NEW.fields<>OLD.fields OR NEW.step<>OLD.step)
    THEN RAISE(ABORT,'Submitted onboarding details are immutable') END;
  SELECT CASE WHEN (OLD.status='draft' AND NEW.status NOT IN ('draft','submitting'))
    OR (OLD.status='submitting' AND NEW.status NOT IN ('submitting','submitted','submission_exception'))
    OR (OLD.status='submission_exception' AND NEW.status NOT IN ('submission_exception','submitted'))
    OR (OLD.status='submitted' AND NEW.status<>'submitted')
    THEN RAISE(ABORT,'Inspect original onboarding submission without replay') END;
END;
CREATE TRIGGER onboarding_no_reset BEFORE DELETE ON onboarding_drafts BEGIN
  SELECT RAISE(ABORT,'Original onboarding submissions cannot be reset');
END;
