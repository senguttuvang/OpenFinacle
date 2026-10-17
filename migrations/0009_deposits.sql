CREATE TABLE synthetic_deposits (
  id TEXT PRIMARY KEY,
  bank_id TEXT NOT NULL REFERENCES banks(id),
  terms TEXT NOT NULL CHECK(json_valid(terms)),
  status TEXT NOT NULL CHECK(status IN ('submitted','recommended','active','rejected','cancelled')),
  maker TEXT,
  checker TEXT,
  activated_at TEXT,
  maturity_date TEXT,
  maturity_minor INTEGER,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX deposit_relationship ON synthetic_deposits(bank_id,created_at,id);
CREATE TABLE deposit_events (
  id TEXT PRIMARY KEY,
  bank_id TEXT NOT NULL REFERENCES banks(id),
  deposit_id TEXT NOT NULL,
  command_key TEXT NOT NULL,
  command_payload TEXT NOT NULL,
  actor TEXT NOT NULL CHECK(actor IN ('customer','officer','approver')),
  action TEXT NOT NULL CHECK(action IN ('submit','recommend','activate','reject','cancel')),
  note TEXT NOT NULL,
  terms TEXT NOT NULL CHECK(json_valid(terms)),
  status TEXT NOT NULL,
  maker TEXT,
  checker TEXT,
  activated_at TEXT,
  maturity_date TEXT,
  maturity_minor INTEGER,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(bank_id,command_key),
  UNIQUE(deposit_id,version)
);
CREATE TRIGGER deposit_event_guard BEFORE INSERT ON deposit_events
BEGIN
  SELECT CASE WHEN NEW.action='submit' AND (NEW.version<>0 OR NEW.actor<>'customer' OR NEW.status<>'submitted' OR NEW.maker IS NOT NULL OR NEW.checker IS NOT NULL OR EXISTS(SELECT 1 FROM synthetic_deposits WHERE id=NEW.deposit_id) OR NOT EXISTS(SELECT 1 FROM banks WHERE id=NEW.bank_id AND customer_account>0 AND status='ready')) THEN RAISE(ABORT,'Invalid deposit submission') END;
  SELECT CASE WHEN NEW.action<>'submit' AND NOT EXISTS(
    SELECT 1 FROM synthetic_deposits d WHERE d.id=NEW.deposit_id AND d.bank_id=NEW.bank_id AND d.version=NEW.version-1 AND d.terms=NEW.terms AND (
      (d.status='submitted' AND NEW.actor='officer' AND NEW.action='recommend' AND NEW.status='recommended' AND NEW.maker='officer' AND NEW.checker IS NULL) OR
      (d.status='submitted' AND NEW.actor='officer' AND NEW.action='reject' AND NEW.status='rejected' AND NEW.maker IS NULL AND NEW.checker IS NULL) OR
      (d.status='submitted' AND NEW.actor='customer' AND NEW.action='cancel' AND NEW.status='cancelled' AND NEW.maker IS NULL AND NEW.checker IS NULL) OR
      (d.status='recommended' AND NEW.actor='approver' AND d.maker='officer' AND NEW.maker=d.maker AND NEW.checker='approver' AND ((NEW.action='activate' AND NEW.status='active') OR (NEW.action='reject' AND NEW.status='rejected')))
    )
  ) THEN RAISE(ABORT,'Stale or unauthorised deposit action') END;
  SELECT CASE WHEN (NEW.status='active' AND (NEW.activated_at IS NULL OR NEW.maturity_date IS NULL OR NEW.maturity_minor IS NULL)) OR (NEW.status<>'active' AND (NEW.activated_at IS NOT NULL OR NEW.maturity_date IS NOT NULL OR NEW.maturity_minor IS NOT NULL)) THEN RAISE(ABORT,'Invalid deposit activation fields') END;
END;
CREATE TRIGGER deposit_insert_guard BEFORE INSERT ON synthetic_deposits
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM deposit_events WHERE deposit_id=NEW.id AND bank_id=NEW.bank_id AND action='submit' AND version=0 AND terms=NEW.terms AND status=NEW.status AND created_at=NEW.created_at) THEN RAISE(ABORT,'Deposit requires immutable submission event') END;
END;
CREATE TRIGGER deposit_update_guard BEFORE UPDATE ON synthetic_deposits
BEGIN
  SELECT CASE WHEN NEW.id<>OLD.id OR NEW.bank_id<>OLD.bank_id OR NEW.terms<>OLD.terms OR NEW.created_at<>OLD.created_at OR NEW.version<>OLD.version+1 OR NOT EXISTS(SELECT 1 FROM deposit_events WHERE deposit_id=OLD.id AND bank_id=OLD.bank_id AND version=NEW.version AND status=NEW.status AND maker IS NEW.maker AND checker IS NEW.checker AND activated_at IS NEW.activated_at AND maturity_date IS NEW.maturity_date AND maturity_minor IS NEW.maturity_minor AND created_at=NEW.updated_at) THEN RAISE(ABORT,'Deposit updates require an immutable command event') END;
END;
CREATE TRIGGER deposit_event_apply AFTER INSERT ON deposit_events
BEGIN
  INSERT INTO synthetic_deposits(id,bank_id,terms,status,maker,checker,activated_at,maturity_date,maturity_minor,version,created_at,updated_at)
    SELECT NEW.deposit_id,NEW.bank_id,NEW.terms,NEW.status,NEW.maker,NEW.checker,NEW.activated_at,NEW.maturity_date,NEW.maturity_minor,0,NEW.created_at,NEW.created_at WHERE NEW.action='submit';
  UPDATE synthetic_deposits SET status=NEW.status,maker=NEW.maker,checker=NEW.checker,activated_at=NEW.activated_at,maturity_date=NEW.maturity_date,maturity_minor=NEW.maturity_minor,version=NEW.version,updated_at=NEW.created_at WHERE id=NEW.deposit_id AND bank_id=NEW.bank_id AND version=NEW.version-1 AND NEW.action<>'submit';
  INSERT INTO audit(id,bank_id,actor,action,detail,created_at) VALUES(NEW.id,NEW.bank_id,NEW.actor,'deposit.'||NEW.action,NEW.note,NEW.created_at);
END;
CREATE TRIGGER deposit_immutable BEFORE DELETE ON synthetic_deposits BEGIN SELECT RAISE(ABORT,'Deposit records are immutable'); END;
CREATE TRIGGER deposit_event_immutable BEFORE UPDATE ON deposit_events BEGIN SELECT RAISE(ABORT,'Deposit history is immutable'); END;
CREATE TRIGGER deposit_event_no_delete BEFORE DELETE ON deposit_events BEGIN SELECT RAISE(ABORT,'Deposit history is immutable'); END;
