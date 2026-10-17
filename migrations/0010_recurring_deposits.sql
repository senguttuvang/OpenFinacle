CREATE TABLE recurring_plans (
  id TEXT PRIMARY KEY,
  bank_id TEXT NOT NULL REFERENCES banks(id),
  terms TEXT NOT NULL CHECK(json_valid(terms)),
  status TEXT NOT NULL CHECK(status IN ('submitted','recommended','active','rejected','cancelled')),
  maker TEXT, checker TEXT, activated_at TEXT, maturity_date TEXT, maturity_minor INTEGER,
  allocated_count INTEGER NOT NULL DEFAULT 0 CHECK(allocated_count>=0),
  allocated_minor INTEGER NOT NULL DEFAULT 0 CHECK(allocated_minor>=0),
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX recurring_relationship ON recurring_plans(bank_id,created_at,id);
CREATE TABLE recurring_events (
  id TEXT PRIMARY KEY, bank_id TEXT NOT NULL REFERENCES banks(id), plan_id TEXT NOT NULL,
  command_key TEXT NOT NULL, command_payload TEXT NOT NULL,
  actor TEXT NOT NULL CHECK(actor IN ('customer','officer','approver')),
  action TEXT NOT NULL CHECK(action IN ('submit','recommend','activate','reject','cancel','allocate')),
  note TEXT NOT NULL, terms TEXT NOT NULL CHECK(json_valid(terms)), status TEXT NOT NULL,
  maker TEXT, checker TEXT, activated_at TEXT, maturity_date TEXT, maturity_minor INTEGER,
  period INTEGER, schedule TEXT CHECK(schedule IS NULL OR json_valid(schedule)),
  version INTEGER NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(bank_id,command_key), UNIQUE(plan_id,version)
);
CREATE TABLE recurring_installments (
  plan_id TEXT NOT NULL REFERENCES recurring_plans(id),
  period INTEGER NOT NULL CHECK(period>0), due_date TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK(amount_minor>0), allocated_at TEXT,
  allocated_event TEXT UNIQUE REFERENCES recurring_events(id),
  PRIMARY KEY(plan_id,period),
  CHECK((allocated_at IS NULL)=(allocated_event IS NULL))
);
CREATE TRIGGER recurring_event_guard BEFORE INSERT ON recurring_events
BEGIN
  SELECT CASE WHEN NEW.action='submit' AND (NEW.version<>0 OR NEW.actor<>'customer' OR NEW.status<>'submitted' OR NEW.maker IS NOT NULL OR NEW.checker IS NOT NULL OR EXISTS(SELECT 1 FROM recurring_plans WHERE id=NEW.plan_id) OR NOT EXISTS(SELECT 1 FROM banks WHERE id=NEW.bank_id AND customer_account>0 AND status='ready')) THEN RAISE(ABORT,'Invalid recurring submission') END;
  SELECT CASE WHEN NEW.action<>'submit' AND NOT EXISTS(
    SELECT 1 FROM recurring_plans p WHERE p.id=NEW.plan_id AND p.bank_id=NEW.bank_id AND p.version=NEW.version-1 AND p.terms=NEW.terms AND (
      (p.status='submitted' AND NEW.actor='officer' AND NEW.action='recommend' AND NEW.status='recommended' AND NEW.maker='officer' AND NEW.checker IS NULL) OR
      (p.status='submitted' AND NEW.actor='officer' AND NEW.action='reject' AND NEW.status='rejected' AND NEW.maker IS NULL AND NEW.checker IS NULL) OR
      (p.status='submitted' AND NEW.actor='customer' AND NEW.action='cancel' AND NEW.status='cancelled' AND NEW.maker IS NULL AND NEW.checker IS NULL) OR
      (p.status='recommended' AND NEW.actor='approver' AND p.maker='officer' AND NEW.maker=p.maker AND NEW.checker='approver' AND ((NEW.action='activate' AND NEW.status='active') OR (NEW.action='reject' AND NEW.status='rejected'))) OR
      (p.status='active' AND NEW.actor='customer' AND NEW.action='allocate' AND NEW.status='active' AND NEW.maker IS p.maker AND NEW.checker IS p.checker AND NEW.activated_at IS p.activated_at AND NEW.maturity_date IS p.maturity_date AND NEW.maturity_minor IS p.maturity_minor)
    )
  ) THEN RAISE(ABORT,'Stale or unauthorised recurring action') END;
  SELECT CASE WHEN (NEW.status='active' AND (NEW.activated_at IS NULL OR NEW.maturity_date IS NULL OR NEW.maturity_minor IS NULL)) OR (NEW.status<>'active' AND (NEW.activated_at IS NOT NULL OR NEW.maturity_date IS NOT NULL OR NEW.maturity_minor IS NOT NULL)) THEN RAISE(ABORT,'Invalid recurring activation fields') END;
  SELECT CASE WHEN NEW.action='allocate' AND (NEW.period IS NULL OR NOT EXISTS(SELECT 1 FROM recurring_installments WHERE plan_id=NEW.plan_id AND period=NEW.period AND allocated_at IS NULL AND due_date<=date(NEW.created_at,'+5 hours','+30 minutes')) OR NEW.period<>(SELECT MIN(period) FROM recurring_installments WHERE plan_id=NEW.plan_id AND allocated_at IS NULL)) THEN RAISE(ABORT,'Only earliest due installment may be allocated') END;
  SELECT CASE WHEN NEW.action<>'allocate' AND NEW.period IS NOT NULL THEN RAISE(ABORT,'Unexpected recurring installment') END;
  SELECT CASE WHEN NEW.action='activate' AND (NEW.schedule IS NULL OR json_type(NEW.schedule)<>'array' OR json_array_length(NEW.schedule)<>json_extract(NEW.terms,'$.months') OR EXISTS(
    SELECT 1 FROM json_each(NEW.schedule) s WHERE json_extract(s.value,'$.period')<>CAST(s.key AS INTEGER)+1 OR json_extract(s.value,'$.amount_minor')<>json_extract(NEW.terms,'$.amount')*100 OR json_extract(s.value,'$.due_date')<>CASE WHEN CAST(s.key AS INTEGER)=0 THEN date(NEW.created_at,'+5 hours','+30 minutes') ELSE date(NEW.created_at,'+5 hours','+30 minutes','start of month',printf('+%d months',s.key),printf('+%d days',json_extract(NEW.terms,'$.day')-1)) END
  )) THEN RAISE(ABORT,'Invalid recurring schedule') END;
  SELECT CASE WHEN NEW.action<>'activate' AND NEW.schedule IS NOT NULL THEN RAISE(ABORT,'Recurring schedule is immutable') END;
END;
CREATE TRIGGER recurring_plan_insert_guard BEFORE INSERT ON recurring_plans
BEGIN
  SELECT CASE WHEN NEW.version<>0 OR NEW.allocated_count<>0 OR NEW.allocated_minor<>0 OR NOT EXISTS(SELECT 1 FROM recurring_events WHERE plan_id=NEW.id AND bank_id=NEW.bank_id AND action='submit' AND version=0 AND terms=NEW.terms AND status=NEW.status AND created_at=NEW.created_at) THEN RAISE(ABORT,'Recurring plan requires immutable submission event') END;
END;
CREATE TRIGGER recurring_plan_update_guard BEFORE UPDATE ON recurring_plans
BEGIN
  SELECT CASE WHEN NEW.id<>OLD.id OR NEW.bank_id<>OLD.bank_id OR NEW.terms<>OLD.terms OR NEW.created_at<>OLD.created_at OR NEW.version<>OLD.version+1 OR NOT EXISTS(SELECT 1 FROM recurring_events e WHERE e.plan_id=OLD.id AND e.bank_id=OLD.bank_id AND e.version=NEW.version AND e.status=NEW.status AND e.maker IS NEW.maker AND e.checker IS NEW.checker AND e.activated_at IS NEW.activated_at AND e.maturity_date IS NEW.maturity_date AND e.maturity_minor IS NEW.maturity_minor AND e.created_at=NEW.updated_at AND NEW.allocated_count=OLD.allocated_count+CASE WHEN e.action='allocate' THEN 1 ELSE 0 END AND NEW.allocated_minor=OLD.allocated_minor+CASE WHEN e.action='allocate' THEN json_extract(OLD.terms,'$.amount')*100 ELSE 0 END) THEN RAISE(ABORT,'Recurring updates require immutable command event') END;
END;
CREATE TRIGGER recurring_installment_insert_guard BEFORE INSERT ON recurring_installments
BEGIN
  SELECT CASE WHEN NEW.allocated_at IS NOT NULL OR NEW.allocated_event IS NOT NULL OR NOT EXISTS(SELECT 1 FROM recurring_events e,json_each(e.schedule) s WHERE e.plan_id=NEW.plan_id AND e.action='activate' AND json_extract(s.value,'$.period')=NEW.period AND json_extract(s.value,'$.due_date')=NEW.due_date AND json_extract(s.value,'$.amount_minor')=NEW.amount_minor) THEN RAISE(ABORT,'Installments require immutable activation event') END;
END;
CREATE TRIGGER recurring_installment_update_guard BEFORE UPDATE ON recurring_installments
BEGIN
  SELECT CASE WHEN NEW.plan_id<>OLD.plan_id OR NEW.period<>OLD.period OR NEW.due_date<>OLD.due_date OR NEW.amount_minor<>OLD.amount_minor OR OLD.allocated_at IS NOT NULL OR NEW.allocated_at IS NULL OR NOT EXISTS(SELECT 1 FROM recurring_events WHERE id=NEW.allocated_event AND plan_id=OLD.plan_id AND action='allocate' AND period=OLD.period AND created_at=NEW.allocated_at) THEN RAISE(ABORT,'Installment updates require immutable allocation event') END;
END;
CREATE TRIGGER recurring_event_apply AFTER INSERT ON recurring_events
BEGIN
  INSERT INTO recurring_plans(id,bank_id,terms,status,maker,checker,activated_at,maturity_date,maturity_minor,version,created_at,updated_at)
    SELECT NEW.plan_id,NEW.bank_id,NEW.terms,NEW.status,NEW.maker,NEW.checker,NEW.activated_at,NEW.maturity_date,NEW.maturity_minor,0,NEW.created_at,NEW.created_at WHERE NEW.action='submit';
  UPDATE recurring_plans SET status=NEW.status,maker=NEW.maker,checker=NEW.checker,activated_at=NEW.activated_at,maturity_date=NEW.maturity_date,maturity_minor=NEW.maturity_minor,allocated_count=allocated_count+CASE WHEN NEW.action='allocate' THEN 1 ELSE 0 END,allocated_minor=allocated_minor+CASE WHEN NEW.action='allocate' THEN json_extract(terms,'$.amount')*100 ELSE 0 END,version=NEW.version,updated_at=NEW.created_at WHERE id=NEW.plan_id AND bank_id=NEW.bank_id AND version=NEW.version-1 AND NEW.action<>'submit';
  INSERT INTO recurring_installments(plan_id,period,due_date,amount_minor) SELECT NEW.plan_id,json_extract(value,'$.period'),json_extract(value,'$.due_date'),json_extract(value,'$.amount_minor') FROM json_each(NEW.schedule) WHERE NEW.action='activate';
  UPDATE recurring_installments SET allocated_at=NEW.created_at,allocated_event=NEW.id WHERE plan_id=NEW.plan_id AND period=NEW.period AND NEW.action='allocate';
  INSERT INTO audit(id,bank_id,actor,action,detail,created_at) VALUES(NEW.id,NEW.bank_id,NEW.actor,'recurring.'||NEW.action,NEW.note,NEW.created_at);
END;
CREATE TRIGGER recurring_plan_no_delete BEFORE DELETE ON recurring_plans BEGIN SELECT RAISE(ABORT,'Recurring records are immutable'); END;
CREATE TRIGGER recurring_installment_no_delete BEFORE DELETE ON recurring_installments BEGIN SELECT RAISE(ABORT,'Recurring schedule is immutable'); END;
CREATE TRIGGER recurring_event_no_update BEFORE UPDATE ON recurring_events BEGIN SELECT RAISE(ABORT,'Recurring history is immutable'); END;
CREATE TRIGGER recurring_event_no_delete BEFORE DELETE ON recurring_events BEGIN SELECT RAISE(ABORT,'Recurring history is immutable'); END;
