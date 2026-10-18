-- Repayment consent, authorization and original-operation evidence only; no local ledger.
CREATE TABLE repayment_claim_preflight (clear INTEGER NOT NULL CHECK(clear=1));
INSERT INTO repayment_claim_preflight SELECT NOT EXISTS(
  SELECT 1 FROM core_write_claims c WHERE c.owner_kind='loan' AND NOT EXISTS(
    SELECT 1 FROM loan_operations o WHERE o.id=c.owner_id AND o.bank_id=c.bank_id AND o.account_id=c.account_id AND o.status=c.status));
DROP TABLE repayment_claim_preflight;

CREATE TABLE loan_repayment_offers (
  id TEXT PRIMARY KEY NOT NULL, loan_id TEXT NOT NULL REFERENCES loan_applications(id), bank_id TEXT NOT NULL REFERENCES banks(id),
  account_id INTEGER NOT NULL, offer_json TEXT NOT NULL CHECK(json_valid(offer_json)),
  quoted_at INTEGER NOT NULL CHECK(typeof(quoted_at)='integer'), expires_at INTEGER NOT NULL CHECK(typeof(expires_at)='integer'), created_at TEXT NOT NULL
);
CREATE TABLE loan_repayment_requests (
  id TEXT PRIMARY KEY NOT NULL, loan_id TEXT NOT NULL REFERENCES loan_applications(id), bank_id TEXT NOT NULL REFERENCES banks(id),
  offer_id TEXT NOT NULL UNIQUE REFERENCES loan_repayment_offers(id), account_id INTEGER NOT NULL,
  origin TEXT NOT NULL CHECK(origin IN ('customer','admin-pilot')), consented_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('submitted','recommended','paid','rejected','cancelled')),
  maker TEXT CHECK(maker='officer'), checker TEXT CHECK(checker='approver'), version INTEGER NOT NULL CHECK(version>=0),
  event_id TEXT NOT NULL REFERENCES loan_repayment_events(id) DEFERRABLE INITIALLY DEFERRED,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX one_pending_loan_repayment ON loan_repayment_requests(loan_id) WHERE status IN ('submitted','recommended');
CREATE TABLE loan_repayment_operations (
  id TEXT PRIMARY KEY NOT NULL, request_id TEXT NOT NULL REFERENCES loan_repayment_requests(id), loan_id TEXT NOT NULL REFERENCES loan_applications(id),
  bank_id TEXT NOT NULL REFERENCES banks(id), account_id INTEGER NOT NULL, client_key TEXT NOT NULL,
  request_json TEXT NOT NULL CHECK(json_valid(request_json)), command_json TEXT NOT NULL CHECK(json_valid(command_json)),
  actor TEXT NOT NULL CHECK(actor='approver'), original_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('executing','uncertain','confirmed','failed')), version INTEGER NOT NULL CHECK(version>=0),
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)), error TEXT,
  started_at INTEGER NOT NULL, observed_at INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(bank_id,client_key)
);
CREATE UNIQUE INDEX one_unresolved_repayment_operation ON loan_repayment_operations(request_id) WHERE status IN ('executing','uncertain');
CREATE TABLE loan_repayment_events (
  id TEXT PRIMARY KEY NOT NULL, request_id TEXT NOT NULL REFERENCES loan_repayment_requests(id) DEFERRABLE INITIALLY DEFERRED,
  loan_id TEXT NOT NULL REFERENCES loan_applications(id), bank_id TEXT NOT NULL REFERENCES banks(id), offer_id TEXT NOT NULL REFERENCES loan_repayment_offers(id),
  origin TEXT NOT NULL CHECK(origin IN ('customer','admin-pilot')), consented_at INTEGER NOT NULL,
  command_key TEXT, request_json TEXT NOT NULL CHECK(json_valid(request_json)), actor TEXT NOT NULL CHECK(actor IN ('customer','officer','approver')),
  action TEXT NOT NULL CHECK(action IN ('submit','recommend','reject','cancel','pay')), kind TEXT NOT NULL CHECK(kind IN ('decision','started','outcome')),
  note TEXT NOT NULL CHECK(length(trim(note)) BETWEEN 5 AND 300), status TEXT NOT NULL CHECK(status IN ('submitted','recommended','paid','rejected','cancelled')),
  maker TEXT CHECK(maker='officer'), checker TEXT CHECK(checker='approver'), operation_id TEXT REFERENCES loan_repayment_operations(id),
  operation_version INTEGER, operation_status TEXT CHECK(operation_status IN ('executing','uncertain','confirmed','failed')),
  version INTEGER NOT NULL CHECK(version>=0), at_ms INTEGER NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(request_id,version), UNIQUE(bank_id,command_key), UNIQUE(operation_id,operation_version)
);

CREATE TRIGGER repayment_offer_guard BEFORE INSERT ON loan_repayment_offers BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM loan_applications l JOIN loan_quotes q ON q.id=l.quote_id JOIN banks b ON b.id=l.bank_id
    WHERE l.id=NEW.loan_id AND l.bank_id=NEW.bank_id AND l.account_id=NEW.account_id AND l.status='active' AND l.core_id>0
    AND b.status='ready' AND b.customer_account=l.account_id AND b.customer_client=l.client_id
    AND NOT EXISTS(SELECT 1 FROM core_write_claims WHERE bank_id=l.bank_id AND account_id=l.account_id AND status IN ('executing','uncertain'))
    AND NEW.quoted_at>0 AND NEW.expires_at=NEW.quoted_at+900000
    AND json_extract(NEW.offer_json,'$.id')=NEW.id AND json_extract(NEW.offer_json,'$.loan_id')=l.id
    AND json_extract(NEW.offer_json,'$.core_id')=l.core_id AND json_extract(NEW.offer_json,'$.external_id')='of-loan-'||l.id
    AND json_extract(NEW.offer_json,'$.owner.bank_id')=l.bank_id AND json_extract(NEW.offer_json,'$.owner.savings_account_id')=l.account_id
    AND json_extract(NEW.offer_json,'$.owner.client_id')=l.client_id AND json_extract(NEW.offer_json,'$.owner.product_id')=l.product_id
    AND json_extract(NEW.offer_json,'$.terms')=json_extract(q.quote_json,'$.terms')
    AND json_extract(NEW.offer_json,'$.expected_disbursement_date')=json_extract(q.quote_json,'$.expected_disbursement_date')
    AND json_extract(NEW.offer_json,'$.quoted_at')=NEW.quoted_at AND json_extract(NEW.offer_json,'$.expires_at')=NEW.expires_at
    AND json_extract(NEW.offer_json,'$.payment_date')=date(NEW.quoted_at/1000.0,'unixepoch','+5 hours','+30 minutes')
    AND json_extract(NEW.offer_json,'$.expected_disbursement_date')<=json_extract(NEW.offer_json,'$.payment_date')
    AND json_type(NEW.offer_json,'$.office_id')='integer' AND json_extract(NEW.offer_json,'$.office_id')>0
    AND json_type(NEW.offer_json,'$.amount_minor')='integer' AND json_extract(NEW.offer_json,'$.amount_minor') BETWEEN 10000 AND 50000000
    AND json_type(NEW.offer_json,'$.principal_outstanding_minor')='integer' AND json_extract(NEW.offer_json,'$.principal_outstanding_minor')<=100000000
    AND json_type(NEW.offer_json,'$.outstanding_minor')='integer' AND json_extract(NEW.offer_json,'$.outstanding_minor')<=100000000
    AND json_type(NEW.offer_json,'$.available_minor')='integer' AND json_extract(NEW.offer_json,'$.available_minor')<=100000000
    AND json_extract(NEW.offer_json,'$.amount_minor')<json_extract(NEW.offer_json,'$.principal_outstanding_minor')
    AND json_extract(NEW.offer_json,'$.amount_minor')<=json_extract(NEW.offer_json,'$.available_minor')
    AND json_extract(NEW.offer_json,'$.outstanding_minor')>=json_extract(NEW.offer_json,'$.principal_outstanding_minor'))
  THEN RAISE(ABORT,'Repayment offer requires current owned partial-payment facts') END;
END;
CREATE TRIGGER repayment_offer_no_update BEFORE UPDATE ON loan_repayment_offers BEGIN SELECT RAISE(ABORT,'Repayment offers are immutable'); END;
CREATE TRIGGER repayment_offer_no_delete BEFORE DELETE ON loan_repayment_offers BEGIN SELECT RAISE(ABORT,'Repayment offers cannot be deleted'); END;

CREATE TRIGGER repayment_event_guard BEFORE INSERT ON loan_repayment_events BEGIN
  SELECT CASE WHEN typeof(NEW.at_ms)<>'integer' OR NEW.at_ms<=0 OR typeof(NEW.consented_at)<>'integer'
    OR (NEW.command_key IS NOT NULL AND (length(NEW.command_key) NOT BETWEEN 8 AND 100 OR NEW.command_key GLOB '*[^a-zA-Z0-9_-]*'))
  THEN RAISE(ABORT,'Repayment history requires a stable original key and time') END;
  SELECT CASE WHEN NEW.kind='decision' AND NEW.action='submit' AND NOT EXISTS(
    SELECT 1 FROM loan_repayment_offers o JOIN loan_applications l ON l.id=o.loan_id JOIN banks b ON b.id=l.bank_id
    WHERE o.id=NEW.offer_id AND o.loan_id=NEW.loan_id AND o.bank_id=NEW.bank_id AND l.status='active'
    AND b.status='ready' AND b.customer_account=o.account_id AND b.customer_client=l.client_id
    AND NEW.consented_at>=o.quoted_at AND NEW.consented_at<o.expires_at AND NEW.at_ms=NEW.consented_at
    AND date(NEW.at_ms/1000.0,'unixepoch','+5 hours','+30 minutes')=json_extract(o.offer_json,'$.payment_date')
    AND NEW.version=0 AND NEW.actor='customer' AND NEW.status='submitted' AND NEW.maker IS NULL AND NEW.checker IS NULL
    AND NEW.operation_id IS NULL AND NEW.operation_version IS NULL AND NEW.operation_status IS NULL AND NEW.command_key IS NOT NULL
    AND json_extract(NEW.request_json,'$.offer_id')=o.id AND json_type(NEW.request_json,'$.consent')='true'
    AND NOT EXISTS(SELECT 1 FROM loan_repayment_requests WHERE id=NEW.request_id OR offer_id=o.id OR (loan_id=l.id AND status IN ('submitted','recommended')))
    AND NOT EXISTS(SELECT 1 FROM core_write_claims WHERE bank_id=l.bank_id AND account_id=l.account_id AND status IN ('executing','uncertain')))
  THEN RAISE(ABORT,'Repayment acceptance requires original customer consent') END;
  SELECT CASE WHEN NOT(NEW.kind='decision' AND NEW.action='submit') AND NOT EXISTS(
    SELECT 1 FROM loan_repayment_requests r JOIN loan_repayment_offers q ON q.id=r.offer_id WHERE r.id=NEW.request_id
    AND r.loan_id=NEW.loan_id AND r.bank_id=NEW.bank_id AND r.offer_id=NEW.offer_id AND r.origin=NEW.origin AND r.consented_at=NEW.consented_at
    AND NEW.version=r.version+1 AND NEW.at_ms>=(SELECT at_ms FROM loan_repayment_events WHERE id=r.event_id)
    AND ((NEW.kind='decision' AND NEW.command_key IS NOT NULL AND NEW.operation_id IS NULL AND NEW.operation_version IS NULL AND NEW.operation_status IS NULL
      AND json_extract(NEW.request_json,'$.id')=r.id AND json_extract(NEW.request_json,'$.version')=r.version
      AND json_extract(NEW.request_json,'$.action')=NEW.action AND json_extract(NEW.request_json,'$.note')=NEW.note
      AND NEW.checker IS r.checker AND NOT EXISTS(SELECT 1 FROM loan_repayment_operations WHERE request_id=r.id AND status IN ('executing','uncertain'))
      AND ((NEW.action='recommend' AND r.status='submitted' AND NEW.actor='officer' AND NEW.status='recommended' AND NEW.maker='officer'
        AND NEW.at_ms<q.expires_at AND date(NEW.at_ms/1000.0,'unixepoch','+5 hours','+30 minutes')=json_extract(q.offer_json,'$.payment_date')) OR
        (NEW.action='reject' AND ((r.status='submitted' AND NEW.actor='officer') OR (r.status='recommended' AND NEW.actor='approver')) AND NEW.status='rejected' AND NEW.maker IS r.maker) OR
        (NEW.action='cancel' AND r.status IN ('submitted','recommended') AND NEW.actor='customer' AND NEW.status='cancelled' AND NEW.maker IS r.maker))) OR
      (NEW.kind IN ('started','outcome') AND NEW.action='pay' AND NEW.actor='approver' AND NEW.maker IS r.maker AND EXISTS(
        SELECT 1 FROM loan_repayment_operations o WHERE o.id=NEW.operation_id AND o.request_id=r.id AND o.loan_id=r.loan_id AND o.bank_id=r.bank_id
        AND o.status=NEW.operation_status AND o.version=NEW.operation_version AND o.request_json=NEW.request_json AND NEW.note=json_extract(o.command_json,'$.note')
        AND ((NEW.kind='started' AND o.status='executing' AND o.version=0 AND NEW.command_key=o.client_key AND NEW.status=r.status AND NEW.checker IS r.checker) OR
          (NEW.kind='outcome' AND o.status IN ('uncertain','failed','confirmed') AND NEW.command_key IS NULL
          AND NEW.status=CASE WHEN o.status='confirmed' THEN 'paid' ELSE r.status END
          AND NEW.checker IS CASE WHEN o.status='confirmed' THEN 'approver' ELSE r.checker END))))))
  THEN RAISE(ABORT,'Repayment history requires the original permitted transition') END;
END;
CREATE TRIGGER repayment_event_apply AFTER INSERT ON loan_repayment_events BEGIN
  INSERT INTO loan_repayment_requests(id,loan_id,bank_id,offer_id,account_id,origin,consented_at,status,maker,checker,version,event_id,created_at,updated_at)
    SELECT NEW.request_id,NEW.loan_id,NEW.bank_id,NEW.offer_id,o.account_id,NEW.origin,NEW.consented_at,NEW.status,NEW.maker,NEW.checker,NEW.version,NEW.id,NEW.created_at,NEW.created_at
    FROM loan_repayment_offers o WHERE o.id=NEW.offer_id AND NEW.action='submit' AND NEW.kind='decision';
  UPDATE loan_repayment_requests SET status=NEW.status,maker=NEW.maker,checker=NEW.checker,version=NEW.version,event_id=NEW.id,updated_at=NEW.created_at
    WHERE id=NEW.request_id AND NOT(NEW.action='submit' AND NEW.kind='decision');
  INSERT INTO audit(id,bank_id,actor,action,detail,created_at) VALUES('repayment:'||NEW.id,NEW.bank_id,NEW.actor,'Loan repayment '||NEW.action,
    'Original repayment '||NEW.request_id||': '||NEW.kind||' / '||coalesce(NEW.operation_status,NEW.status),NEW.created_at);
END;
CREATE TRIGGER repayment_request_insert_guard BEFORE INSERT ON loan_repayment_requests BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM loan_repayment_events e JOIN loan_repayment_offers o ON o.id=e.offer_id
    WHERE e.id=NEW.event_id AND e.request_id=NEW.id AND e.loan_id=NEW.loan_id AND e.bank_id=NEW.bank_id AND e.offer_id=NEW.offer_id
    AND e.kind='decision' AND e.action='submit' AND e.version=0 AND NEW.version=0 AND e.origin=NEW.origin AND e.consented_at=NEW.consented_at
    AND o.account_id=NEW.account_id AND NEW.status='submitted' AND NEW.maker IS NULL AND NEW.checker IS NULL
    AND NEW.created_at=e.created_at AND NEW.updated_at=e.created_at)
  THEN RAISE(ABORT,'Repayment requests require immutable customer history') END;
END;
CREATE TRIGGER repayment_request_update_guard BEFORE UPDATE ON loan_repayment_requests BEGIN
  SELECT CASE WHEN NEW.id IS NOT OLD.id OR NEW.loan_id IS NOT OLD.loan_id OR NEW.bank_id IS NOT OLD.bank_id OR NEW.offer_id IS NOT OLD.offer_id
    OR NEW.account_id IS NOT OLD.account_id OR NEW.origin IS NOT OLD.origin OR NEW.consented_at IS NOT OLD.consented_at OR NEW.created_at IS NOT OLD.created_at
    OR NEW.version<>OLD.version+1 OR NOT EXISTS(SELECT 1 FROM loan_repayment_events WHERE id=NEW.event_id AND request_id=OLD.id AND loan_id=OLD.loan_id
      AND bank_id=OLD.bank_id AND version=NEW.version AND status=NEW.status AND maker IS NEW.maker AND checker IS NEW.checker AND created_at=NEW.updated_at)
  THEN RAISE(ABORT,'Repayment state changes require immutable versioned history') END;
END;
CREATE TRIGGER repayment_request_no_delete BEFORE DELETE ON loan_repayment_requests BEGIN SELECT RAISE(ABORT,'Repayment requests cannot be reset'); END;
CREATE TRIGGER repayment_event_no_update BEFORE UPDATE ON loan_repayment_events BEGIN SELECT RAISE(ABORT,'Repayment history is immutable'); END;
CREATE TRIGGER repayment_event_no_delete BEFORE DELETE ON loan_repayment_events BEGIN SELECT RAISE(ABORT,'Repayment history cannot be deleted'); END;

CREATE TRIGGER repayment_operation_insert_guard BEFORE INSERT ON loan_repayment_operations BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM loan_repayment_requests r JOIN loan_repayment_offers o ON o.id=r.offer_id
    JOIN loan_applications l ON l.id=r.loan_id JOIN banks b ON b.id=r.bank_id WHERE r.id=NEW.request_id AND r.loan_id=NEW.loan_id
    AND r.bank_id=NEW.bank_id AND r.account_id=NEW.account_id AND r.status='recommended' AND r.maker='officer' AND r.checker IS NULL
    AND l.status='active' AND b.status='ready' AND b.customer_account=r.account_id AND b.customer_client=l.client_id
    AND r.version=NEW.original_version AND NEW.actor='approver' AND NEW.status='executing' AND NEW.version=0
    AND NEW.started_at=NEW.observed_at AND NEW.started_at>=(SELECT at_ms FROM loan_repayment_events WHERE id=r.event_id)
    AND NEW.started_at<o.expires_at AND date(NEW.started_at/1000.0,'unixepoch','+5 hours','+30 minutes')=json_extract(o.offer_json,'$.payment_date')
    AND NEW.created_at=NEW.updated_at AND NEW.result_json IS NULL AND NEW.error IS NULL AND length(NEW.client_key) BETWEEN 8 AND 100
    AND NEW.client_key NOT GLOB '*[^a-zA-Z0-9_-]*' AND typeof(NEW.started_at)='integer' AND typeof(NEW.observed_at)='integer'
    AND json_extract(NEW.request_json,'$.id')=r.id AND json_extract(NEW.request_json,'$.version')=r.version AND json_extract(NEW.request_json,'$.action')='pay'
    AND json_extract(NEW.request_json,'$.note')=json_extract(NEW.command_json,'$.note') AND length(trim(json_extract(NEW.command_json,'$.note'))) BETWEEN 5 AND 300
    AND json_extract(NEW.command_json,'$.operation_id')=NEW.id AND json_extract(NEW.command_json,'$.key')='of-loan-repay-op-'||NEW.id
    AND json_extract(NEW.command_json,'$.offer')=json(o.offer_json) AND json_extract(NEW.command_json,'$.consented_at')=r.consented_at
    AND NOT EXISTS(SELECT 1 FROM loan_repayment_operations WHERE request_id=r.id AND status IN ('executing','uncertain'))
    AND NOT EXISTS(SELECT 1 FROM core_write_claims WHERE bank_id=r.bank_id AND account_id=r.account_id AND status IN ('executing','uncertain')))
  THEN RAISE(ABORT,'Repayment operation requires original independent authorization') END;
END;
CREATE TRIGGER repayment_operation_start AFTER INSERT ON loan_repayment_operations BEGIN
  INSERT INTO core_write_claims(id,owner_kind,owner_id,bank_id,account_id,origin,status,version,created_at,updated_at)
    VALUES('loan:'||NEW.id,'loan',NEW.id,NEW.bank_id,NEW.account_id,'loan','executing',0,NEW.created_at,NEW.created_at);
  INSERT INTO loan_repayment_events(id,request_id,loan_id,bank_id,offer_id,origin,consented_at,command_key,request_json,actor,action,kind,note,status,maker,checker,operation_id,operation_version,operation_status,version,at_ms,created_at)
    SELECT NEW.id||':started',r.id,r.loan_id,r.bank_id,r.offer_id,r.origin,r.consented_at,NEW.client_key,NEW.request_json,NEW.actor,'pay','started',json_extract(NEW.command_json,'$.note'),
      r.status,r.maker,r.checker,NEW.id,NEW.version,NEW.status,r.version+1,NEW.started_at,NEW.created_at FROM loan_repayment_requests r WHERE r.id=NEW.request_id;
  UPDATE financial_snapshots SET invalidated_at=max(invalidated_at,synced_at+1,NEW.started_at) WHERE bank_id=NEW.bank_id;
  UPDATE loan_core_views SET stale=1 WHERE loan_id=NEW.loan_id;
END;
CREATE TRIGGER repayment_operation_update_guard BEFORE UPDATE ON loan_repayment_operations BEGIN
  SELECT CASE WHEN NEW.id IS NOT OLD.id OR NEW.request_id IS NOT OLD.request_id OR NEW.loan_id IS NOT OLD.loan_id OR NEW.bank_id IS NOT OLD.bank_id
    OR NEW.account_id IS NOT OLD.account_id OR NEW.client_key IS NOT OLD.client_key OR NEW.request_json IS NOT OLD.request_json OR NEW.command_json IS NOT OLD.command_json
    OR NEW.actor IS NOT OLD.actor OR NEW.original_version IS NOT OLD.original_version OR NEW.started_at IS NOT OLD.started_at OR NEW.created_at IS NOT OLD.created_at
    OR NEW.version<>OLD.version+1 OR NEW.observed_at<OLD.observed_at
    OR NOT((OLD.status='executing' AND NEW.status IN ('uncertain','confirmed','failed')) OR (OLD.status='uncertain' AND NEW.status='confirmed'))
    OR (NEW.status<>'confirmed' AND NEW.result_json IS NOT NULL) OR (NEW.status='confirmed' AND (NEW.result_json IS NULL OR NEW.error IS NOT NULL))
  THEN RAISE(ABORT,'Original repayment operations cannot be reset or rewritten') END;
  SELECT CASE WHEN NEW.status='confirmed' AND NOT EXISTS(SELECT 1 FROM loan_repayment_offers o JOIN loan_repayment_requests r ON r.offer_id=o.id
    JOIN loan_applications l ON l.id=r.loan_id WHERE r.id=NEW.request_id
    AND json_extract(NEW.result_json,'$.operation_id')=NEW.id AND json_extract(NEW.result_json,'$.loan.id')=l.core_id
    AND json_extract(NEW.result_json,'$.loan.external_id')='of-loan-'||l.id AND json_extract(NEW.result_json,'$.loan.status')='active'
    AND json_extract(NEW.result_json,'$.loan.owner.bank_id')=l.bank_id AND json_extract(NEW.result_json,'$.loan.owner.savings_account_id')=l.account_id
    AND json_extract(NEW.result_json,'$.loan.owner.client_id')=l.client_id AND json_extract(NEW.result_json,'$.loan.owner.product_id')=l.product_id
    AND json_extract(NEW.result_json,'$.loan.principal_minor')=json_extract(o.offer_json,'$.terms.principal')*100
    AND json_extract(NEW.result_json,'$.loan.expected_disbursement_date')=json_extract(o.offer_json,'$.expected_disbursement_date')
    AND json_extract(NEW.result_json,'$.date')=json_extract(o.offer_json,'$.payment_date')
    AND json_extract(NEW.result_json,'$.amount_minor')=json_extract(o.offer_json,'$.amount_minor')
    AND json_type(NEW.result_json,'$.principal_minor')='integer' AND json_extract(NEW.result_json,'$.principal_minor')>=0
    AND json_type(NEW.result_json,'$.interest_minor')='integer' AND json_extract(NEW.result_json,'$.interest_minor')>=0
    AND json_extract(NEW.result_json,'$.amount_minor')=json_extract(NEW.result_json,'$.principal_minor')+json_extract(NEW.result_json,'$.interest_minor')
    AND json_type(NEW.result_json,'$.loan_transaction_id')='integer' AND json_extract(NEW.result_json,'$.loan_transaction_id')>0
    AND json_type(NEW.result_json,'$.savings_transaction_id')='integer' AND json_extract(NEW.result_json,'$.savings_transaction_id')>0
    AND json_type(NEW.result_json,'$.transfer_id')='integer' AND json_extract(NEW.result_json,'$.transfer_id')>0
    AND (SELECT count(*) FROM json_each(NEW.result_json,'$.loan.statement.transactions') t WHERE json_extract(t.value,'$.transfer.repayment_marker')='of-loan-repay-'||NEW.id)=1
    AND EXISTS(SELECT 1 FROM json_each(NEW.result_json,'$.loan.statement.transactions') t
      WHERE json_extract(t.value,'$.id')=json_extract(NEW.result_json,'$.loan_transaction_id') AND json_extract(t.value,'$.type_id')=2
      AND json_type(t.value,'$.manually_reversed')='false' AND json_extract(t.value,'$.date')=json_extract(NEW.result_json,'$.date')
      AND json_extract(t.value,'$.amount_minor')=json_extract(NEW.result_json,'$.amount_minor')
      AND json_extract(t.value,'$.principal_minor')=json_extract(NEW.result_json,'$.principal_minor') AND json_extract(t.value,'$.interest_minor')=json_extract(NEW.result_json,'$.interest_minor')
      AND json_extract(t.value,'$.fees_minor')=0 AND json_extract(t.value,'$.penalties_minor')=0 AND json_extract(t.value,'$.overpayment_minor')=0
      AND json_extract(t.value,'$.transfer.id')=json_extract(NEW.result_json,'$.transfer_id') AND json_type(t.value,'$.transfer.reversed')='false'
      AND json_extract(t.value,'$.transfer.amount_minor')=json_extract(NEW.result_json,'$.amount_minor') AND json_extract(t.value,'$.transfer.date')=json_extract(NEW.result_json,'$.date')
      AND json_extract(t.value,'$.transfer.repayment_marker')='of-loan-repay-'||NEW.id))
  THEN RAISE(ABORT,'Confirmed repayment requires original owned transaction evidence') END;
END;
CREATE TRIGGER repayment_operation_outcome AFTER UPDATE ON loan_repayment_operations BEGIN
  UPDATE core_write_claims SET status=NEW.status,version=version+1,updated_at=NEW.updated_at WHERE owner_kind='loan' AND owner_id=NEW.id;
  INSERT INTO loan_repayment_events(id,request_id,loan_id,bank_id,offer_id,origin,consented_at,command_key,request_json,actor,action,kind,note,status,maker,checker,operation_id,operation_version,operation_status,version,at_ms,created_at)
    SELECT NEW.id||':'||NEW.version,r.id,r.loan_id,r.bank_id,r.offer_id,r.origin,r.consented_at,NULL,NEW.request_json,NEW.actor,'pay','outcome',json_extract(NEW.command_json,'$.note'),
      CASE WHEN NEW.status='confirmed' THEN 'paid' ELSE r.status END,r.maker,CASE WHEN NEW.status='confirmed' THEN 'approver' ELSE r.checker END,
      NEW.id,NEW.version,NEW.status,r.version+1,NEW.observed_at,NEW.updated_at FROM loan_repayment_requests r WHERE r.id=NEW.request_id;
  INSERT INTO loan_core_views(loan_id,snapshot_json,synced_at,stale)
    SELECT NEW.loan_id,json_extract(NEW.result_json,'$.loan'),NEW.observed_at,0 WHERE NEW.status='confirmed'
    ON CONFLICT(loan_id) DO UPDATE SET snapshot_json=excluded.snapshot_json,synced_at=excluded.synced_at,stale=0 WHERE excluded.synced_at>=loan_core_views.synced_at;
  UPDATE financial_snapshots SET invalidated_at=max(invalidated_at,synced_at+1,NEW.observed_at) WHERE bank_id=NEW.bank_id;
END;
CREATE TRIGGER repayment_operation_no_delete BEFORE DELETE ON loan_repayment_operations BEGIN SELECT RAISE(ABORT,'Original repayment operations cannot be deleted'); END;

-- The existing loan claim namespace covers lending operations; exactly one original owns each UUID.
DROP TRIGGER loan_claim_owner_insert;
DROP TRIGGER loan_claim_owner_update;
CREATE TRIGGER loan_claim_owner_insert BEFORE INSERT ON core_write_claims WHEN NEW.owner_kind='loan' BEGIN
  SELECT CASE WHEN (SELECT count(*) FROM (
    SELECT id FROM loan_operations WHERE id=NEW.owner_id AND bank_id=NEW.bank_id AND account_id=NEW.account_id AND status=NEW.status
    UNION ALL SELECT id FROM loan_repayment_operations WHERE id=NEW.owner_id AND bank_id=NEW.bank_id AND account_id=NEW.account_id AND status=NEW.status))<>1
  THEN RAISE(ABORT,'Lending reservation requires exactly one durable original') END;
END;
CREATE TRIGGER loan_claim_owner_update BEFORE UPDATE ON core_write_claims WHEN NEW.owner_kind='loan' BEGIN
  SELECT CASE WHEN (SELECT count(*) FROM (
    SELECT id FROM loan_operations WHERE id=NEW.owner_id AND bank_id=NEW.bank_id AND account_id=NEW.account_id AND status=NEW.status
    UNION ALL SELECT id FROM loan_repayment_operations WHERE id=NEW.owner_id AND bank_id=NEW.bank_id AND account_id=NEW.account_id AND status=NEW.status))<>1
  THEN RAISE(ABORT,'Lending outcome requires exactly one durable original') END;
END;
DROP TRIGGER loan_pending_financial_view_insert;
DROP TRIGGER loan_pending_financial_view_update;
CREATE TRIGGER loan_pending_financial_view_insert AFTER INSERT ON financial_snapshots WHEN NEW.invalidated_at<=NEW.synced_at AND (
  EXISTS(SELECT 1 FROM loan_operations WHERE bank_id=NEW.bank_id AND action='disburse' AND status IN ('executing','uncertain')) OR
  EXISTS(SELECT 1 FROM loan_repayment_operations WHERE bank_id=NEW.bank_id AND status IN ('executing','uncertain')))
BEGIN UPDATE financial_snapshots SET invalidated_at=NEW.synced_at+1 WHERE bank_id=NEW.bank_id; END;
CREATE TRIGGER loan_pending_financial_view_update AFTER UPDATE ON financial_snapshots WHEN NEW.invalidated_at<=NEW.synced_at AND (
  EXISTS(SELECT 1 FROM loan_operations WHERE bank_id=NEW.bank_id AND action='disburse' AND status IN ('executing','uncertain')) OR
  EXISTS(SELECT 1 FROM loan_repayment_operations WHERE bank_id=NEW.bank_id AND status IN ('executing','uncertain')))
BEGIN UPDATE financial_snapshots SET invalidated_at=NEW.synced_at+1 WHERE bank_id=NEW.bank_id; END;
CREATE TRIGGER repayment_pending_core_view_insert AFTER INSERT ON loan_core_views WHEN NEW.stale=0 AND EXISTS(
  SELECT 1 FROM loan_repayment_operations WHERE loan_id=NEW.loan_id AND status IN ('executing','uncertain'))
BEGIN UPDATE loan_core_views SET stale=1 WHERE loan_id=NEW.loan_id; END;
CREATE TRIGGER repayment_pending_core_view_update AFTER UPDATE ON loan_core_views WHEN NEW.stale=0 AND EXISTS(
  SELECT 1 FROM loan_repayment_operations WHERE loan_id=NEW.loan_id AND status IN ('executing','uncertain'))
BEGIN UPDATE loan_core_views SET stale=1 WHERE loan_id=NEW.loan_id; END;
