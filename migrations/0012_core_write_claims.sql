-- Workflow reservations only. Core remains the owner of balances and postings.
CREATE TABLE core_write_claims (
  id TEXT PRIMARY KEY NOT NULL,
  owner_kind TEXT NOT NULL CHECK(owner_kind IN ('command','loan')),
  owner_id TEXT NOT NULL CHECK(length(owner_id)>0),
  bank_id TEXT NOT NULL REFERENCES banks(id), account_id INTEGER NOT NULL CHECK(account_id>0),
  origin TEXT NOT NULL CHECK(origin IN ('command','loan','legacy')),
  status TEXT NOT NULL CHECK(status IN ('executing','uncertain','confirmed','failed')),
  version INTEGER NOT NULL CHECK(version>=0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(owner_kind,owner_id), CHECK(id=owner_kind||':'||owner_id)
);
CREATE UNIQUE INDEX one_unresolved_core_write ON core_write_claims(bank_id,account_id) WHERE status IN ('executing','uncertain');
CREATE TABLE core_write_claim_events (
  claim_id TEXT NOT NULL REFERENCES core_write_claims(id), version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('executing','uncertain','confirmed','failed')),
  observed_at TEXT NOT NULL, PRIMARY KEY(claim_id,version)
);
CREATE TRIGGER core_write_claim_insert_guard BEFORE INSERT ON core_write_claims
BEGIN
  SELECT CASE WHEN NEW.version<>0 OR NEW.created_at<>NEW.updated_at OR NEW.status NOT IN ('executing','uncertain') OR
    NOT EXISTS(SELECT 1 FROM banks WHERE id=NEW.bank_id AND status='ready' AND customer_account=NEW.account_id) OR
    (NEW.owner_kind='loan' AND (NEW.origin<>'loan' OR NEW.status<>'executing')) OR
    (NEW.owner_kind='command' AND (NEW.origin NOT IN ('command','legacy') OR NOT EXISTS(
      SELECT 1 FROM commands WHERE id=NEW.owner_id AND bank_id=NEW.bank_id AND account_id=NEW.account_id AND status=NEW.status
    )))
  THEN RAISE(ABORT,'Invalid owned Core write reservation') END;
END;
CREATE TRIGGER core_write_claim_update_guard BEFORE UPDATE ON core_write_claims
BEGIN
  SELECT CASE WHEN NEW.id<>OLD.id OR NEW.owner_kind<>OLD.owner_kind OR NEW.owner_id<>OLD.owner_id OR NEW.bank_id<>OLD.bank_id OR
    NEW.account_id<>OLD.account_id OR NEW.origin<>OLD.origin OR NEW.created_at<>OLD.created_at OR NEW.version<>OLD.version+1 OR
    NOT ((OLD.status='executing' AND NEW.status IN ('uncertain','confirmed','failed')) OR (OLD.status='uncertain' AND NEW.status='confirmed')) OR
    (NEW.owner_kind='command' AND NOT EXISTS(
      SELECT 1 FROM commands WHERE id=NEW.owner_id AND bank_id=NEW.bank_id AND account_id=NEW.account_id AND
        ((status='uncertain' AND NEW.status='uncertain') OR (status='posted' AND NEW.status='confirmed') OR (status='failed' AND NEW.status='failed'))
    ))
  THEN RAISE(ABORT,'Core write reservations require a valid original outcome') END;
END;
CREATE TRIGGER core_write_claim_no_delete BEFORE DELETE ON core_write_claims
BEGIN SELECT RAISE(ABORT,'Core write reservations cannot be deleted or reset'); END;
CREATE TRIGGER core_write_claim_event_insert_guard BEFORE INSERT ON core_write_claim_events
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM core_write_claims WHERE id=NEW.claim_id AND version=NEW.version AND status=NEW.status AND updated_at=NEW.observed_at)
  THEN RAISE(ABORT,'Core write history must match its reservation') END;
END;
CREATE TRIGGER core_write_claim_event_no_update BEFORE UPDATE ON core_write_claim_events
BEGIN SELECT RAISE(ABORT,'Core write history is immutable'); END;
CREATE TRIGGER core_write_claim_event_no_delete BEFORE DELETE ON core_write_claim_events
BEGIN SELECT RAISE(ABORT,'Core write history is immutable'); END;
CREATE TRIGGER core_write_claim_initial_history AFTER INSERT ON core_write_claims
BEGIN
  INSERT INTO core_write_claim_events(claim_id,version,status,observed_at) VALUES(NEW.id,NEW.version,NEW.status,NEW.updated_at);
END;
CREATE TRIGGER core_write_claim_outcome_history AFTER UPDATE ON core_write_claims
BEGIN
  INSERT INTO core_write_claim_events(claim_id,version,status,observed_at) VALUES(NEW.id,NEW.version,NEW.status,NEW.updated_at);
END;

-- Record only currently unresolved legacy commands, observed at migration time.
-- Duplicate unresolved owners of one account fail the unique index; never discard one.
INSERT INTO core_write_claims(id,owner_kind,owner_id,bank_id,account_id,origin,status,version,created_at,updated_at)
  SELECT 'command:'||id,'command',id,bank_id,account_id,'legacy',status,0,
    strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM commands WHERE status IN ('executing','uncertain');

CREATE TRIGGER command_core_claim_on_insert AFTER INSERT ON commands WHEN NEW.status IN ('executing','uncertain')
BEGIN
  INSERT INTO core_write_claims(id,owner_kind,owner_id,bank_id,account_id,origin,status,version,created_at,updated_at)
    VALUES('command:'||NEW.id,'command',NEW.id,NEW.bank_id,NEW.account_id,'command',NEW.status,0,
      strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER command_core_claim_pending_guard BEFORE INSERT ON commands WHEN NEW.status='pending' AND EXISTS(
  SELECT 1 FROM core_write_claims WHERE bank_id=NEW.bank_id AND account_id=NEW.account_id AND status IN ('executing','uncertain')
)
BEGIN SELECT RAISE(ABORT,'Resolve the original Core write before creating another instruction'); END;
CREATE TRIGGER command_core_claim_on_execution AFTER UPDATE OF status ON commands WHEN NEW.status='executing' AND OLD.status<>'executing'
BEGIN
  SELECT CASE WHEN OLD.status<>'pending' THEN RAISE(ABORT,'Only an original pending command may reserve a Core write') END;
  INSERT INTO core_write_claims(id,owner_kind,owner_id,bank_id,account_id,origin,status,version,created_at,updated_at)
    VALUES('command:'||NEW.id,'command',NEW.id,NEW.bank_id,NEW.account_id,'command','executing',0,
      strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER command_core_claim_outcome AFTER UPDATE OF status ON commands WHEN NEW.status IN ('uncertain','posted','failed') AND NEW.status<>OLD.status
BEGIN
  UPDATE core_write_claims SET status=CASE NEW.status WHEN 'posted' THEN 'confirmed' ELSE NEW.status END,
    version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE owner_kind='command' AND owner_id=NEW.id AND status<>CASE NEW.status WHEN 'posted' THEN 'confirmed' ELSE NEW.status END;
END;
CREATE TRIGGER command_core_claim_original_guard BEFORE UPDATE ON commands WHEN EXISTS(SELECT 1 FROM core_write_claims WHERE owner_kind='command' AND owner_id=OLD.id)
BEGIN
  SELECT CASE WHEN NEW.id<>OLD.id OR NEW.bank_id<>OLD.bank_id OR NEW.account_id<>OLD.account_id OR NEW.key<>OLD.key OR
    NEW.kind<>OLD.kind OR NEW.amount_minor<>OLD.amount_minor OR NEW.payload<>OLD.payload OR NEW.description<>OLD.description OR
    NEW.created_at<>OLD.created_at OR NEW.maker<>OLD.maker OR NEW.approver IS NOT OLD.approver OR
    (OLD.status IN ('posted','failed') AND (NEW.status<>OLD.status OR NEW.core_id IS NOT OLD.core_id)) OR
    (NEW.status='posted' AND (NEW.core_id IS NULL OR typeof(NEW.core_id)<>'integer' OR NEW.core_id<=0)) OR
    (OLD.status='uncertain' AND NEW.status NOT IN ('uncertain','posted')) OR
    (OLD.status='executing' AND NEW.status NOT IN ('executing','uncertain','posted','failed'))
  THEN RAISE(ABORT,'A reserved Core instruction keeps its original identity and authorization') END;
END;
CREATE TRIGGER command_core_claim_no_delete BEFORE DELETE ON commands WHEN EXISTS(SELECT 1 FROM core_write_claims WHERE owner_kind='command' AND owner_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'A reserved Core instruction cannot be deleted'); END;
CREATE TRIGGER bank_core_claim_account_guard BEFORE UPDATE OF customer_account,status ON banks WHEN
  (NEW.customer_account<>OLD.customer_account OR NEW.status<>OLD.status) AND EXISTS(SELECT 1 FROM core_write_claims WHERE bank_id=OLD.id AND status IN ('executing','uncertain'))
BEGIN SELECT RAISE(ABORT,'Resolve the original Core write before changing its relationship'); END;
