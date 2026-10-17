-- Workflow and immutable observations only. Fineract owns every financial fact.
CREATE TABLE loan_claim_preflight (clear INTEGER NOT NULL CHECK(clear=1));
INSERT INTO loan_claim_preflight SELECT NOT EXISTS(SELECT 1 FROM core_write_claims WHERE owner_kind='loan');
DROP TABLE loan_claim_preflight;

CREATE TABLE loan_quotes (
  id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL REFERENCES banks(id),
  account_id INTEGER NOT NULL, client_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
  quote_json TEXT NOT NULL CHECK(json_valid(quote_json)), quoted_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TRIGGER loan_quote_guard BEFORE INSERT ON loan_quotes BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM banks WHERE id=NEW.bank_id AND status='ready' AND customer_account=NEW.account_id AND customer_client=NEW.client_id
    AND NEW.product_id>0 AND NEW.quoted_at>0 AND NEW.expires_at=NEW.quoted_at+900000
    AND json_extract(NEW.quote_json,'$.id')=NEW.id AND json_extract(NEW.quote_json,'$.bank_id')=NEW.bank_id
    AND json_extract(NEW.quote_json,'$.savings_account_id')=NEW.account_id AND json_extract(NEW.quote_json,'$.client_id')=NEW.client_id
    AND json_extract(NEW.quote_json,'$.product_id')=NEW.product_id AND json_extract(NEW.quote_json,'$.quoted_at')=NEW.quoted_at
    AND json_extract(NEW.quote_json,'$.expires_at')=NEW.expires_at
    AND json_extract(NEW.quote_json,'$.expected_disbursement_date')=date(NEW.quoted_at/1000.0,'unixepoch','+5 hours','+30 minutes'))
  THEN RAISE(ABORT,'Invalid owned immutable loan quote') END;
END;
CREATE TRIGGER loan_quote_no_update BEFORE UPDATE ON loan_quotes BEGIN SELECT RAISE(ABORT,'Accepted quote snapshots cannot change'); END;
CREATE TRIGGER loan_quote_no_delete BEFORE DELETE ON loan_quotes BEGIN SELECT RAISE(ABORT,'Loan quote history cannot be deleted'); END;

CREATE TABLE loan_applications (
  id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL REFERENCES banks(id), quote_id TEXT NOT NULL UNIQUE REFERENCES loan_quotes(id),
  account_id INTEGER NOT NULL, client_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
  origin TEXT NOT NULL CHECK(origin IN ('customer','admin-pilot')), accepted_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('submitted','recommended','registered','approved','active','rejected','cancelled','withdrawn')),
  maker TEXT CHECK(maker='officer'), checker TEXT CHECK(checker='approver'), core_id INTEGER CHECK(core_id>0),
  withdrawal_requested INTEGER NOT NULL CHECK(withdrawal_requested IN (0,1)), version INTEGER NOT NULL CHECK(version>=0),
  event_id TEXT NOT NULL REFERENCES loan_events(id) DEFERRABLE INITIALLY DEFERRED,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX one_unfunded_loan_application ON loan_applications(bank_id) WHERE status IN ('submitted','recommended','registered','approved');
CREATE UNIQUE INDEX one_application_per_core_loan ON loan_applications(core_id) WHERE core_id IS NOT NULL;
CREATE TABLE loan_operations (
  id TEXT PRIMARY KEY NOT NULL, loan_id TEXT NOT NULL REFERENCES loan_applications(id), bank_id TEXT NOT NULL REFERENCES banks(id), account_id INTEGER NOT NULL,
  client_key TEXT NOT NULL, request_json TEXT NOT NULL CHECK(json_valid(request_json)), command_json TEXT NOT NULL CHECK(json_valid(command_json)),
  action TEXT NOT NULL CHECK(action IN ('register','approve','disburse','undo_approval','withdraw')),
  actor TEXT NOT NULL CHECK(actor='approver'), original_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('executing','uncertain','confirmed','failed')), version INTEGER NOT NULL CHECK(version>=0),
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)), error TEXT,
  started_at INTEGER NOT NULL, observed_at INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(bank_id,client_key)
);
CREATE UNIQUE INDEX one_unresolved_loan_operation ON loan_operations(loan_id) WHERE status IN ('executing','uncertain');
CREATE TABLE loan_events (
  id TEXT PRIMARY KEY NOT NULL, loan_id TEXT NOT NULL REFERENCES loan_applications(id) DEFERRABLE INITIALLY DEFERRED,
  bank_id TEXT NOT NULL REFERENCES banks(id), quote_id TEXT NOT NULL REFERENCES loan_quotes(id),
  origin TEXT NOT NULL CHECK(origin IN ('customer','admin-pilot')), accepted_at INTEGER NOT NULL,
  command_key TEXT, request_json TEXT NOT NULL CHECK(json_valid(request_json)), actor TEXT NOT NULL CHECK(actor IN ('customer','officer','approver')),
  action TEXT NOT NULL CHECK(action IN ('submit','recommend','register','approve','disburse','reject','cancel','request_withdrawal','undo_approval','withdraw')),
  kind TEXT NOT NULL CHECK(kind IN ('decision','started','outcome')), note TEXT NOT NULL CHECK(length(trim(note)) BETWEEN 5 AND 300),
  status TEXT NOT NULL CHECK(status IN ('submitted','recommended','registered','approved','active','rejected','cancelled','withdrawn')),
  maker TEXT CHECK(maker='officer'), checker TEXT CHECK(checker='approver'), core_id INTEGER CHECK(core_id>0),
  withdrawal_requested INTEGER NOT NULL CHECK(withdrawal_requested IN (0,1)),
  operation_id TEXT REFERENCES loan_operations(id), operation_version INTEGER,
  operation_status TEXT CHECK(operation_status IN ('executing','uncertain','confirmed','failed')),
  version INTEGER NOT NULL CHECK(version>=0), at_ms INTEGER NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(loan_id,version), UNIQUE(bank_id,command_key), UNIQUE(operation_id,operation_version)
);
CREATE TABLE loan_core_views (
  loan_id TEXT PRIMARY KEY NOT NULL REFERENCES loan_applications(id), snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  synced_at INTEGER NOT NULL, stale INTEGER NOT NULL DEFAULT 0 CHECK(stale IN (0,1))
);

CREATE TRIGGER loan_event_guard BEFORE INSERT ON loan_events BEGIN
  SELECT CASE WHEN NEW.kind='decision' AND NEW.action='submit' AND NOT EXISTS(
    SELECT 1 FROM loan_quotes q JOIN banks b ON b.id=q.bank_id WHERE q.id=NEW.quote_id AND q.bank_id=NEW.bank_id AND b.status='ready'
    AND b.customer_account=q.account_id AND b.customer_client=q.client_id AND NEW.accepted_at>=q.quoted_at AND NEW.accepted_at<q.expires_at
    AND date(NEW.accepted_at/1000.0,'unixepoch','+5 hours','+30 minutes')=json_extract(q.quote_json,'$.expected_disbursement_date')
    AND NEW.at_ms=NEW.accepted_at AND NEW.version=0 AND NEW.actor='customer' AND NEW.status='submitted'
    AND NEW.maker IS NULL AND NEW.checker IS NULL AND NEW.core_id IS NULL AND NEW.withdrawal_requested=0
    AND NEW.operation_id IS NULL AND NEW.operation_version IS NULL AND NEW.operation_status IS NULL AND NEW.command_key IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM loan_applications WHERE id=NEW.loan_id OR quote_id=NEW.quote_id))
  THEN RAISE(ABORT,'Invalid original loan acceptance') END;
  SELECT CASE WHEN NOT(NEW.kind='decision' AND NEW.action='submit') AND NOT EXISTS(
    SELECT 1 FROM loan_applications l WHERE l.id=NEW.loan_id AND l.bank_id=NEW.bank_id AND l.quote_id=NEW.quote_id
    AND l.origin=NEW.origin AND l.accepted_at=NEW.accepted_at AND NEW.version=l.version+1 AND NEW.at_ms>=l.accepted_at
    AND NEW.at_ms>=(SELECT at_ms FROM loan_events WHERE id=l.event_id)
    AND (
      (NEW.kind='decision' AND NEW.command_key IS NOT NULL AND NEW.operation_id IS NULL AND NEW.operation_version IS NULL AND NEW.operation_status IS NULL
        AND NOT EXISTS(SELECT 1 FROM loan_operations WHERE loan_id=l.id AND status IN ('executing','uncertain'))
        AND NEW.core_id IS l.core_id AND NEW.checker IS l.checker AND (
          (NEW.action='recommend' AND l.status='submitted' AND l.maker IS NULL AND l.core_id IS NULL AND l.withdrawal_requested=0 AND NEW.actor='officer'
            AND NEW.status='recommended' AND NEW.maker='officer' AND NEW.withdrawal_requested=0
            AND NEW.at_ms<(SELECT expires_at FROM loan_quotes WHERE id=l.quote_id)
            AND date(NEW.at_ms/1000.0,'unixepoch','+5 hours','+30 minutes')=(SELECT json_extract(quote_json,'$.expected_disbursement_date') FROM loan_quotes WHERE id=l.quote_id)) OR
          (NEW.action='reject' AND ((l.status='submitted' AND NEW.actor='officer') OR (l.status='recommended' AND NEW.actor='approver'))
            AND l.core_id IS NULL AND l.withdrawal_requested=0 AND NEW.status='rejected' AND NEW.maker IS l.maker AND NEW.withdrawal_requested=0) OR
          (NEW.action='cancel' AND l.status IN ('submitted','recommended') AND l.core_id IS NULL AND NEW.actor='customer'
            AND NEW.status='cancelled' AND NEW.maker IS l.maker AND NEW.withdrawal_requested=0) OR
          (NEW.action='request_withdrawal' AND l.status IN ('registered','approved') AND l.core_id>0 AND l.withdrawal_requested=0 AND NEW.actor='customer'
            AND NEW.status=l.status AND NEW.maker IS l.maker AND NEW.withdrawal_requested=1)
        )) OR
      (NEW.kind IN ('started','outcome') AND NEW.actor='approver' AND EXISTS(
        SELECT 1 FROM loan_operations o WHERE o.id=NEW.operation_id AND o.loan_id=l.id AND o.bank_id=l.bank_id AND o.action=NEW.action
        AND o.version=NEW.operation_version AND o.status=NEW.operation_status AND o.request_json=NEW.request_json
        AND NEW.note=json_extract(o.command_json,'$.note') AND NEW.maker IS l.maker AND NEW.withdrawal_requested=l.withdrawal_requested
        AND ((NEW.kind='started' AND o.status='executing' AND o.version=0 AND NEW.command_key=o.client_key
          AND NEW.status=l.status AND NEW.core_id IS l.core_id AND NEW.checker IS l.checker) OR
          (NEW.kind='outcome' AND o.status IN ('uncertain','failed','confirmed') AND NEW.command_key IS NULL AND (
            (o.status<>'confirmed' AND NEW.status=l.status AND NEW.core_id IS l.core_id AND NEW.checker IS l.checker) OR
            (o.status='confirmed' AND NEW.status=CASE o.action WHEN 'register' THEN 'registered' WHEN 'approve' THEN 'approved' WHEN 'disburse' THEN 'active' WHEN 'undo_approval' THEN 'registered' ELSE 'withdrawn' END
              AND NEW.core_id=json_extract(o.result_json,'$.loan.id') AND NEW.checker='approver')
          )))
      ))
    )) THEN RAISE(ABORT,'Loan history requires the original permitted transition') END;
END;
CREATE TRIGGER loan_event_apply AFTER INSERT ON loan_events BEGIN
  INSERT INTO loan_applications(id,bank_id,quote_id,account_id,client_id,product_id,origin,accepted_at,status,maker,checker,core_id,withdrawal_requested,version,event_id,created_at,updated_at)
    SELECT NEW.loan_id,NEW.bank_id,NEW.quote_id,q.account_id,q.client_id,q.product_id,NEW.origin,NEW.accepted_at,NEW.status,NEW.maker,NEW.checker,NEW.core_id,NEW.withdrawal_requested,NEW.version,NEW.id,NEW.created_at,NEW.created_at
    FROM loan_quotes q WHERE q.id=NEW.quote_id AND NEW.action='submit' AND NEW.kind='decision';
  UPDATE loan_applications SET status=NEW.status,maker=NEW.maker,checker=NEW.checker,core_id=NEW.core_id,withdrawal_requested=NEW.withdrawal_requested,
    version=NEW.version,event_id=NEW.id,updated_at=NEW.created_at WHERE id=NEW.loan_id AND NOT(NEW.action='submit' AND NEW.kind='decision');
  INSERT INTO audit(id,bank_id,actor,action,detail,created_at) VALUES('loan:'||NEW.id,NEW.bank_id,NEW.actor,'Loan '||NEW.action,
    'Original loan '||NEW.loan_id||': '||NEW.kind||' / '||coalesce(NEW.operation_status,NEW.status),NEW.created_at);
END;
CREATE TRIGGER loan_application_insert_guard BEFORE INSERT ON loan_applications BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM loan_events e JOIN loan_quotes q ON q.id=e.quote_id WHERE e.id=NEW.event_id AND e.loan_id=NEW.id AND e.action='submit'
    AND e.kind='decision' AND e.bank_id=NEW.bank_id AND e.quote_id=NEW.quote_id AND e.version=NEW.version AND e.origin=NEW.origin AND e.accepted_at=NEW.accepted_at
    AND q.account_id=NEW.account_id AND q.client_id=NEW.client_id AND q.product_id=NEW.product_id AND NEW.status='submitted' AND NEW.maker IS NULL
    AND NEW.checker IS NULL AND NEW.core_id IS NULL AND NEW.withdrawal_requested=0)
  THEN RAISE(ABORT,'Loan applications require original accepted history') END;
END;
CREATE TRIGGER loan_application_update_guard BEFORE UPDATE ON loan_applications BEGIN
  SELECT CASE WHEN NEW.id IS NOT OLD.id OR NEW.bank_id IS NOT OLD.bank_id OR NEW.quote_id IS NOT OLD.quote_id OR NEW.account_id IS NOT OLD.account_id
    OR NEW.client_id IS NOT OLD.client_id OR NEW.product_id IS NOT OLD.product_id OR NEW.origin IS NOT OLD.origin OR NEW.accepted_at IS NOT OLD.accepted_at OR NEW.created_at IS NOT OLD.created_at
    OR NEW.version<>OLD.version+1 OR NOT EXISTS(SELECT 1 FROM loan_events WHERE id=NEW.event_id AND loan_id=OLD.id AND bank_id=OLD.bank_id AND version=NEW.version
      AND status=NEW.status AND maker IS NEW.maker AND checker IS NEW.checker AND core_id IS NEW.core_id AND withdrawal_requested=NEW.withdrawal_requested AND created_at=NEW.updated_at)
  THEN RAISE(ABORT,'Loan state changes require immutable versioned history') END;
END;
CREATE TRIGGER loan_application_no_delete BEFORE DELETE ON loan_applications BEGIN SELECT RAISE(ABORT,'Loan applications cannot be reset'); END;
CREATE TRIGGER loan_event_no_update BEFORE UPDATE ON loan_events BEGIN SELECT RAISE(ABORT,'Loan history is immutable'); END;
CREATE TRIGGER loan_event_no_delete BEFORE DELETE ON loan_events BEGIN SELECT RAISE(ABORT,'Loan history cannot be deleted'); END;

CREATE TRIGGER loan_operation_insert_guard BEFORE INSERT ON loan_operations BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM loan_applications l JOIN loan_quotes q ON q.id=l.quote_id JOIN banks b ON b.id=l.bank_id
    WHERE l.id=NEW.loan_id AND l.bank_id=NEW.bank_id AND l.account_id=NEW.account_id AND b.status='ready' AND b.customer_account=l.account_id AND b.customer_client=l.client_id
    AND l.version=NEW.original_version AND l.maker='officer' AND NEW.actor='approver' AND NEW.status='executing' AND NEW.version=0
    AND NEW.started_at=NEW.observed_at AND NEW.started_at>=l.accepted_at AND NEW.created_at=NEW.updated_at AND NEW.result_json IS NULL AND NEW.error IS NULL
    AND NEW.started_at>=(SELECT at_ms FROM loan_events WHERE id=l.event_id)
    AND length(NEW.client_key) BETWEEN 8 AND 100 AND NOT EXISTS(SELECT 1 FROM loan_operations WHERE loan_id=l.id AND status IN ('executing','uncertain'))
    AND NOT EXISTS(SELECT 1 FROM core_write_claims WHERE bank_id=l.bank_id AND account_id=l.account_id AND status IN ('executing','uncertain'))
    AND json_extract(NEW.request_json,'$.id')=l.id AND json_extract(NEW.request_json,'$.version')=l.version AND json_extract(NEW.request_json,'$.action')=NEW.action
    AND json_extract(NEW.request_json,'$.note')=json_extract(NEW.command_json,'$.note') AND length(trim(json_extract(NEW.command_json,'$.note'))) BETWEEN 5 AND 300
    AND json_extract(NEW.command_json,'$.quote')=q.quote_json AND json_extract(NEW.command_json,'$.consented_at')=l.accepted_at
    AND json_extract(NEW.command_json,'$.owner.bank_id')=l.bank_id AND json_extract(NEW.command_json,'$.owner.client_id')=l.client_id
    AND json_extract(NEW.command_json,'$.owner.product_id')=l.product_id AND json_extract(NEW.command_json,'$.owner.savings_account_id')=l.account_id
    AND json_extract(NEW.command_json,'$.terms')=json_extract(q.quote_json,'$.terms')
    AND json_extract(NEW.command_json,'$.expected_disbursement_date')=json_extract(q.quote_json,'$.expected_disbursement_date')
    AND json_extract(NEW.command_json,'$.external_id')='of-loan-'||l.id AND json_extract(NEW.command_json,'$.key')='of-loan-op-'||NEW.id
    AND json_extract(NEW.command_json,'$.action')=NEW.action AND json_extract(NEW.command_json,'$.core_id') IS l.core_id
    AND json_extract(NEW.command_json,'$.date')=date(NEW.started_at/1000.0,'unixepoch','+5 hours','+30 minutes')
    AND json_extract(NEW.command_json,'$.date')>=json_extract(q.quote_json,'$.expected_disbursement_date')
    AND (NEW.action NOT IN ('register','approve','disburse') OR json_extract(NEW.command_json,'$.date')=json_extract(q.quote_json,'$.expected_disbursement_date'))
    AND (NEW.action<>'register' OR NEW.started_at<q.expires_at)
    AND (NEW.action='disburse' AND json_extract(NEW.command_json,'$.transaction_external_id')='of-loan-disburse-'||NEW.id OR
      NEW.action<>'disburse' AND json_extract(NEW.command_json,'$.transaction_external_id') IS NULL)
    AND ((NEW.action='register' AND l.status='recommended' AND l.core_id IS NULL AND l.checker IS NULL AND l.withdrawal_requested=0) OR
      (NEW.action='approve' AND l.status='registered' AND l.core_id>0 AND l.checker='approver' AND l.withdrawal_requested=0) OR
      (NEW.action='disburse' AND l.status='approved' AND l.core_id>0 AND l.checker='approver' AND l.withdrawal_requested=0) OR
      (NEW.action='undo_approval' AND l.status='approved' AND l.core_id>0 AND l.checker='approver' AND l.withdrawal_requested=1) OR
      (NEW.action='withdraw' AND l.status='registered' AND l.core_id>0 AND l.checker='approver' AND l.withdrawal_requested=1)))
  THEN RAISE(ABORT,'Loan Core operation requires its original owned authorization') END;
END;
CREATE TRIGGER loan_operation_start AFTER INSERT ON loan_operations BEGIN
  INSERT INTO core_write_claims(id,owner_kind,owner_id,bank_id,account_id,origin,status,version,created_at,updated_at)
    VALUES('loan:'||NEW.id,'loan',NEW.id,NEW.bank_id,NEW.account_id,'loan','executing',0,NEW.created_at,NEW.created_at);
  INSERT INTO loan_events(id,loan_id,bank_id,quote_id,origin,accepted_at,command_key,request_json,actor,action,kind,note,status,maker,checker,core_id,withdrawal_requested,operation_id,operation_version,operation_status,version,at_ms,created_at)
    SELECT NEW.id||':started',l.id,l.bank_id,l.quote_id,l.origin,l.accepted_at,NEW.client_key,NEW.request_json,NEW.actor,NEW.action,'started',json_extract(NEW.command_json,'$.note'),
      l.status,l.maker,l.checker,l.core_id,l.withdrawal_requested,NEW.id,NEW.version,NEW.status,l.version+1,NEW.started_at,NEW.created_at
    FROM loan_applications l WHERE l.id=NEW.loan_id;
  UPDATE financial_snapshots SET invalidated_at=max(invalidated_at,synced_at+1,NEW.started_at)
    WHERE bank_id=NEW.bank_id AND NEW.action='disburse';
END;
CREATE TRIGGER loan_operation_update_guard BEFORE UPDATE ON loan_operations BEGIN
  SELECT CASE WHEN NEW.id IS NOT OLD.id OR NEW.loan_id IS NOT OLD.loan_id OR NEW.bank_id IS NOT OLD.bank_id OR NEW.account_id IS NOT OLD.account_id
    OR NEW.client_key IS NOT OLD.client_key OR NEW.request_json IS NOT OLD.request_json OR NEW.command_json IS NOT OLD.command_json OR NEW.action IS NOT OLD.action
    OR NEW.actor IS NOT OLD.actor OR NEW.original_version IS NOT OLD.original_version OR NEW.started_at IS NOT OLD.started_at OR NEW.created_at IS NOT OLD.created_at
    OR NEW.version<>OLD.version+1 OR NEW.observed_at<OLD.observed_at
    OR NOT((OLD.status='executing' AND NEW.status IN ('uncertain','confirmed','failed')) OR (OLD.status='uncertain' AND NEW.status='confirmed'))
    OR (NEW.status<>'confirmed' AND NEW.result_json IS NOT NULL) OR (NEW.status='confirmed' AND (NEW.result_json IS NULL OR NEW.error IS NOT NULL))
  THEN RAISE(ABORT,'Original loan operations cannot be reset or rewritten') END;
  SELECT CASE WHEN NEW.status='confirmed' AND NOT EXISTS(SELECT 1 FROM loan_applications l JOIN loan_quotes q ON q.id=l.quote_id
    WHERE l.id=NEW.loan_id AND json_type(NEW.result_json,'$.loan.id')='integer' AND json_extract(NEW.result_json,'$.loan.id')>0
    AND (NEW.action='register' OR json_extract(NEW.result_json,'$.loan.id')=l.core_id)
    AND json_extract(NEW.result_json,'$.loan.external_id')='of-loan-'||l.id
    AND json_extract(NEW.result_json,'$.loan.owner.bank_id')=l.bank_id AND json_extract(NEW.result_json,'$.loan.owner.client_id')=l.client_id
    AND json_extract(NEW.result_json,'$.loan.owner.product_id')=l.product_id AND json_extract(NEW.result_json,'$.loan.owner.savings_account_id')=l.account_id
    AND json_extract(NEW.result_json,'$.loan.principal_minor')=json_extract(q.quote_json,'$.schedule.principal_minor')
    AND json_extract(NEW.result_json,'$.loan.expected_disbursement_date')=json_extract(q.quote_json,'$.expected_disbursement_date')
    AND json_extract(NEW.result_json,'$.loan.submitted_on_date')=json_extract(q.quote_json,'$.expected_disbursement_date')
    AND json_extract(NEW.result_json,'$.loan.status')=CASE NEW.action WHEN 'register' THEN 'registered' WHEN 'approve' THEN 'approved' WHEN 'disburse' THEN 'active' WHEN 'undo_approval' THEN 'registered' ELSE 'withdrawn' END
    AND (NEW.action<>'approve' OR json_extract(NEW.result_json,'$.loan.approved_on_date')=json_extract(NEW.command_json,'$.date'))
    AND (NEW.action NOT IN ('register','undo_approval') OR json_extract(NEW.result_json,'$.loan.approved_on_date') IS NULL)
    AND (NEW.action<>'withdraw' OR json_extract(NEW.result_json,'$.loan.withdrawn_on_date')=json_extract(NEW.command_json,'$.date'))
    AND ((NEW.action='disburse' AND json_type(NEW.result_json,'$.transaction_id')='integer' AND json_extract(NEW.result_json,'$.transaction_id')>0
      AND json_type(NEW.result_json,'$.transfer_id')='integer' AND json_extract(NEW.result_json,'$.transfer_id')>0
      AND json_extract(NEW.result_json,'$.loan.actual_disbursement_date')=json_extract(NEW.command_json,'$.date')
      AND json_extract(NEW.result_json,'$.loan.principal_disbursed_minor')=json_extract(q.quote_json,'$.schedule.principal_minor')
      AND json_array_length(NEW.result_json,'$.loan.disbursements')=1
      AND json_extract(NEW.result_json,'$.loan.disbursements[0].id')=json_extract(NEW.result_json,'$.transaction_id')
      AND json_extract(NEW.result_json,'$.loan.disbursements[0].external_id')=json_extract(NEW.command_json,'$.transaction_external_id')
      AND json_extract(NEW.result_json,'$.loan.disbursements[0].reversed')=0
      AND json_extract(NEW.result_json,'$.loan.disbursements[0].amount_minor')=json_extract(q.quote_json,'$.schedule.principal_minor')
      AND json_extract(NEW.result_json,'$.loan.disbursements[0].date')=json_extract(NEW.command_json,'$.date')
      AND json_extract(NEW.result_json,'$.loan.disbursements[0].transfer.id')=json_extract(NEW.result_json,'$.transfer_id')
      AND json_extract(NEW.result_json,'$.loan.disbursements[0].transfer.reversed')=0
      AND json_extract(NEW.result_json,'$.loan.disbursements[0].transfer.amount_minor')=json_extract(q.quote_json,'$.schedule.principal_minor')
      AND json_extract(NEW.result_json,'$.loan.disbursements[0].transfer.date')=json_extract(NEW.command_json,'$.date')
      AND json_extract(NEW.result_json,'$.loan.schedule')=json_extract(q.quote_json,'$.schedule')) OR
      (NEW.action<>'disburse' AND json_extract(NEW.result_json,'$.transaction_id') IS NULL AND json_extract(NEW.result_json,'$.transfer_id') IS NULL
      AND json_extract(NEW.result_json,'$.loan.actual_disbursement_date') IS NULL
      AND coalesce(json_extract(NEW.result_json,'$.loan.principal_disbursed_minor'),0)=0 AND json_array_length(NEW.result_json,'$.loan.disbursements')=0)))
  THEN RAISE(ABORT,'Confirmed loan outcome requires its original owned Core proof') END;
END;
CREATE TRIGGER loan_operation_outcome AFTER UPDATE ON loan_operations BEGIN
  UPDATE core_write_claims SET status=NEW.status,version=version+1,updated_at=NEW.updated_at WHERE owner_kind='loan' AND owner_id=NEW.id;
  INSERT INTO loan_events(id,loan_id,bank_id,quote_id,origin,accepted_at,command_key,request_json,actor,action,kind,note,status,maker,checker,core_id,withdrawal_requested,operation_id,operation_version,operation_status,version,at_ms,created_at)
    SELECT NEW.id||':'||NEW.version,l.id,l.bank_id,l.quote_id,l.origin,l.accepted_at,NULL,NEW.request_json,NEW.actor,NEW.action,'outcome',json_extract(NEW.command_json,'$.note'),
      CASE WHEN NEW.status='confirmed' THEN CASE NEW.action WHEN 'register' THEN 'registered' WHEN 'approve' THEN 'approved' WHEN 'disburse' THEN 'active' WHEN 'undo_approval' THEN 'registered' ELSE 'withdrawn' END ELSE l.status END,
      l.maker,CASE WHEN NEW.status='confirmed' THEN 'approver' ELSE l.checker END,
      CASE WHEN NEW.status='confirmed' THEN json_extract(NEW.result_json,'$.loan.id') ELSE l.core_id END,l.withdrawal_requested,
      NEW.id,NEW.version,NEW.status,l.version+1,NEW.observed_at,NEW.updated_at FROM loan_applications l WHERE l.id=NEW.loan_id;
  INSERT INTO loan_core_views(loan_id,snapshot_json,synced_at,stale)
    SELECT NEW.loan_id,json_extract(NEW.result_json,'$.loan'),NEW.observed_at,0 WHERE NEW.status='confirmed'
    ON CONFLICT(loan_id) DO UPDATE SET snapshot_json=excluded.snapshot_json,synced_at=excluded.synced_at,stale=0 WHERE excluded.synced_at>=loan_core_views.synced_at;
  UPDATE financial_snapshots SET invalidated_at=max(invalidated_at,NEW.observed_at)
    WHERE bank_id=NEW.bank_id AND NEW.action='disburse' AND NEW.status='confirmed';
END;
CREATE TRIGGER loan_operation_no_delete BEFORE DELETE ON loan_operations BEGIN SELECT RAISE(ABORT,'Original loan operations cannot be deleted'); END;
CREATE TRIGGER loan_claim_owner_insert BEFORE INSERT ON core_write_claims WHEN NEW.owner_kind='loan' BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM loan_operations WHERE id=NEW.owner_id AND bank_id=NEW.bank_id AND account_id=NEW.account_id AND status=NEW.status)
  THEN RAISE(ABORT,'Loan reservation requires its durable original operation') END;
END;
CREATE TRIGGER loan_claim_owner_update BEFORE UPDATE ON core_write_claims WHEN NEW.owner_kind='loan' BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM loan_operations WHERE id=NEW.owner_id AND bank_id=NEW.bank_id AND account_id=NEW.account_id AND status=NEW.status)
  THEN RAISE(ABORT,'Loan reservation outcome requires its original operation') END;
END;
CREATE TRIGGER loan_core_view_insert_guard BEFORE INSERT ON loan_core_views BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM loan_applications WHERE id=NEW.loan_id AND core_id=json_extract(NEW.snapshot_json,'$.id')
    AND bank_id=json_extract(NEW.snapshot_json,'$.owner.bank_id') AND account_id=json_extract(NEW.snapshot_json,'$.owner.savings_account_id')
    AND client_id=json_extract(NEW.snapshot_json,'$.owner.client_id') AND product_id=json_extract(NEW.snapshot_json,'$.owner.product_id')
    AND json_extract(NEW.snapshot_json,'$.external_id')='of-loan-'||id)
  THEN RAISE(ABORT,'Saved Core loan view must retain its owned identity') END;
END;
CREATE TRIGGER loan_core_view_update_guard BEFORE UPDATE ON loan_core_views BEGIN
  SELECT CASE WHEN NEW.loan_id IS NOT OLD.loan_id OR NEW.synced_at<OLD.synced_at OR NOT EXISTS(SELECT 1 FROM loan_applications WHERE id=NEW.loan_id
    AND core_id=json_extract(NEW.snapshot_json,'$.id') AND bank_id=json_extract(NEW.snapshot_json,'$.owner.bank_id')
    AND account_id=json_extract(NEW.snapshot_json,'$.owner.savings_account_id') AND client_id=json_extract(NEW.snapshot_json,'$.owner.client_id')
    AND product_id=json_extract(NEW.snapshot_json,'$.owner.product_id') AND json_extract(NEW.snapshot_json,'$.external_id')='of-loan-'||id)
  THEN RAISE(ABORT,'Saved Core loan view must retain its owned identity and synchronization time') END;
END;
CREATE TRIGGER loan_core_view_no_delete BEFORE DELETE ON loan_core_views BEGIN SELECT RAISE(ABORT,'Saved Core loan views cannot be reset'); END;
-- A balance read while the original disbursement is unresolved cannot declare synchronization complete.
CREATE TRIGGER loan_pending_financial_view_insert AFTER INSERT ON financial_snapshots WHEN NEW.invalidated_at<=NEW.synced_at AND EXISTS(
  SELECT 1 FROM loan_operations WHERE bank_id=NEW.bank_id AND action='disburse' AND status IN ('executing','uncertain'))
BEGIN UPDATE financial_snapshots SET invalidated_at=NEW.synced_at+1 WHERE bank_id=NEW.bank_id; END;
CREATE TRIGGER loan_pending_financial_view_update AFTER UPDATE ON financial_snapshots WHEN NEW.invalidated_at<=NEW.synced_at AND EXISTS(
  SELECT 1 FROM loan_operations WHERE bank_id=NEW.bank_id AND action='disburse' AND status IN ('executing','uncertain'))
BEGIN UPDATE financial_snapshots SET invalidated_at=NEW.synced_at+1 WHERE bank_id=NEW.bank_id; END;
