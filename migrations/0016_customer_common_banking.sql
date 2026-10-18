-- Additive application scopes; never reset existing Core accounts or scenarios.
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES banks(id),
  bank_id TEXT NOT NULL UNIQUE REFERENCES banks(id),
  reference TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL CHECK(length(trim(display_name)) BETWEEN 2 AND 120),
  client_id INTEGER NOT NULL UNIQUE CHECK(client_id>0),
  account_id INTEGER NOT NULL UNIQUE CHECK(account_id>0),
  account_no TEXT NOT NULL CHECK(length(account_no)>0),
  origin TEXT NOT NULL CHECK(origin IN ('legacy','seed','onboarding')),
  status TEXT NOT NULL CHECK(status IN ('active','disabled'))
);
CREATE TRIGGER customer_owned_scope_insert BEFORE INSERT ON customers BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM banks WHERE id=NEW.bank_id AND status='ready' AND customer_client=NEW.client_id AND customer_account=NEW.account_id)
    OR NOT EXISTS(SELECT 1 FROM banks WHERE id=NEW.branch_id AND status='ready')
    THEN RAISE(ABORT,'Customer requires an owned ready scope and branch') END;
END;
CREATE TRIGGER customer_identity_immutable BEFORE UPDATE ON customers BEGIN
  SELECT CASE WHEN NEW.id<>OLD.id OR NEW.branch_id<>OLD.branch_id OR NEW.bank_id<>OLD.bank_id OR NEW.client_id<>OLD.client_id OR NEW.account_id<>OLD.account_id OR NEW.reference<>OLD.reference OR NEW.origin<>OLD.origin OR NEW.account_no<>OLD.account_no
    THEN RAISE(ABORT,'Registered customer ownership is immutable') END;
END;
CREATE TRIGGER customer_no_delete BEFORE DELETE ON customers BEGIN
  SELECT RAISE(ABORT,'Registered customers are disabled rather than deleted');
END;
CREATE TRIGGER customer_bank_ownership_guard BEFORE UPDATE OF customer_client,customer_account,status ON banks WHEN EXISTS(SELECT 1 FROM customers WHERE bank_id=OLD.id) BEGIN
  SELECT CASE WHEN NEW.customer_client<>OLD.customer_client OR NEW.customer_account<>OLD.customer_account OR NEW.status<>OLD.status THEN RAISE(ABORT,'Registered customer scope ownership is immutable') END;
END;
CREATE TABLE customer_transfer_offers (
  id TEXT PRIMARY KEY,
  bank_id TEXT NOT NULL REFERENCES banks(id),
  sender_id TEXT NOT NULL REFERENCES customers(id),
  recipient_id TEXT NOT NULL REFERENCES customers(id),
  amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor BETWEEN 1 AND 1000000000),
  payment_date TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  CHECK(sender_id<>recipient_id)
);
CREATE TABLE customer_transfers (
  command_id TEXT PRIMARY KEY REFERENCES commands(id),
  offer_id TEXT NOT NULL UNIQUE REFERENCES customer_transfer_offers(id),
  bank_id TEXT NOT NULL REFERENCES banks(id),
  receipt_json TEXT
);
CREATE TRIGGER customer_transfer_binding BEFORE INSERT ON customer_transfers BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM customer_transfer_offers o JOIN customers s ON s.id=o.sender_id JOIN customers r ON r.id=o.recipient_id JOIN commands c ON c.id=NEW.command_id
    WHERE o.id=NEW.offer_id AND o.bank_id=NEW.bank_id AND c.bank_id=NEW.bank_id AND s.bank_id=NEW.bank_id AND s.branch_id=r.branch_id AND s.account_id=c.account_id AND c.amount_minor=o.amount_minor AND c.kind='transfer' AND c.maker='customer' AND c.status='pending'
  ) THEN RAISE(ABORT,'Transfer must bind its owned original command and offer') END;
END;
CREATE TRIGGER customer_transfer_immutable BEFORE UPDATE ON customer_transfers BEGIN
  SELECT CASE WHEN NEW.command_id<>OLD.command_id OR NEW.offer_id<>OLD.offer_id OR NEW.bank_id<>OLD.bank_id OR OLD.receipt_json IS NOT NULL THEN RAISE(ABORT,'Original transfer identity and receipt are immutable') END;
END;
CREATE TRIGGER customer_transfer_command_binding AFTER INSERT ON commands WHEN json_extract(NEW.payload,'$.customerOfferId') IS NOT NULL BEGIN
  INSERT INTO customer_transfers(command_id,offer_id,bank_id) VALUES(NEW.id,json_extract(NEW.payload,'$.customerOfferId'),NEW.bank_id);
END;
CREATE TABLE customer_seed_manifest (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES banks(id),
  ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 1 AND 100),
  reference TEXT NOT NULL UNIQUE,
  firstname TEXT NOT NULL,
  lastname TEXT NOT NULL,
  funding_minor INTEGER NOT NULL CHECK(funding_minor>0),
  client_id INTEGER,
  account_id INTEGER,
  account_no TEXT,
  UNIQUE(branch_id,ordinal)
);
CREATE TABLE customer_seed_operations (
  seed_id TEXT NOT NULL REFERENCES customer_seed_manifest(id),
  stage TEXT NOT NULL CHECK(stage IN ('client','account','approve','activate','fund')),
  command_key TEXT NOT NULL UNIQUE,
  payment_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('executing','uncertain','confirmed','failed')),
  resource_id INTEGER,
  PRIMARY KEY(seed_id,stage)
);
CREATE TRIGGER customer_seed_manifest_identity BEFORE UPDATE ON customer_seed_manifest BEGIN
  SELECT CASE WHEN NEW.id<>OLD.id OR NEW.branch_id<>OLD.branch_id OR NEW.ordinal<>OLD.ordinal OR NEW.reference<>OLD.reference OR NEW.firstname<>OLD.firstname OR NEW.lastname<>OLD.lastname OR NEW.funding_minor<>OLD.funding_minor OR (OLD.client_id IS NOT NULL AND NEW.client_id IS NOT OLD.client_id) OR (OLD.account_id IS NOT NULL AND NEW.account_id IS NOT OLD.account_id) OR (OLD.account_no IS NOT NULL AND NEW.account_no IS NOT OLD.account_no)
    THEN RAISE(ABORT,'Synthetic customer manifest retains its original identity') END;
END;
CREATE TRIGGER customer_seed_operation_guard BEFORE UPDATE ON customer_seed_operations BEGIN
  SELECT CASE WHEN NEW.seed_id<>OLD.seed_id OR NEW.stage<>OLD.stage OR NEW.command_key<>OLD.command_key OR NEW.payment_date<>OLD.payment_date OR OLD.status IN ('confirmed','failed') OR NEW.status NOT IN ('uncertain','confirmed','failed') OR (NEW.status='confirmed' AND (NEW.resource_id IS NULL OR NEW.resource_id<=0)) OR (OLD.status='uncertain' AND NEW.status<>'confirmed')
    THEN RAISE(ABORT,'Inspect original seed operation without reposting') END;
END;
CREATE TRIGGER customer_seed_operation_no_delete BEFORE DELETE ON customer_seed_operations BEGIN SELECT RAISE(ABORT,'Original seed operations cannot be reset'); END;
CREATE TRIGGER customer_seed_manifest_no_delete BEFORE DELETE ON customer_seed_manifest BEGIN SELECT RAISE(ABORT,'Synthetic customer manifest cannot be reset'); END;
CREATE TABLE customer_applicant_scopes (
  operation_id TEXT PRIMARY KEY,
  owner_session_hash TEXT NOT NULL,
  bank_id TEXT NOT NULL UNIQUE REFERENCES banks(id),
  customer_id TEXT NOT NULL UNIQUE,
  branch_id TEXT NOT NULL REFERENCES banks(id)
);
CREATE TRIGGER customer_offer_no_update BEFORE UPDATE ON customer_transfer_offers BEGIN SELECT RAISE(ABORT,'Transfer reviews retain their original terms'); END;
CREATE TRIGGER customer_offer_no_delete BEFORE DELETE ON customer_transfer_offers BEGIN SELECT RAISE(ABORT,'Transfer reviews cannot be reset'); END;
CREATE TRIGGER customer_transfer_command_execution BEFORE UPDATE OF status ON commands WHEN NEW.status='executing' AND json_extract(NEW.payload,'$.customerOfferId') IS NOT NULL BEGIN
  SELECT CASE WHEN NEW.approver<>'policy:registered-retail-transfer' OR NOT EXISTS(SELECT 1 FROM customer_transfers t WHERE t.command_id=NEW.id AND t.offer_id=json_extract(NEW.payload,'$.customerOfferId') AND t.bank_id=NEW.bank_id)
    THEN RAISE(ABORT,'Registered transfers execute only through their owned retail policy') END;
END;
-- Future individual scopes have their own explicit empty profile. Existing profiles are untouched.
DROP TRIGGER profile_for_relationship;
CREATE TRIGGER profile_for_relationship AFTER INSERT ON banks WHEN NEW.customer_account>0
BEGIN
  INSERT INTO synthetic_profiles(bank_id,fields) VALUES(NEW.id,'{"email":"","phone":"","address":"","city":"","pincode":"","home_branch":"Adyar · Chennai (demo)","employer":""}');
END;
