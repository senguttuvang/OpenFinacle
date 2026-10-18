-- Saved recipients are application metadata. No Core accounts or money are changed.
CREATE TABLE customer_payees (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES customers(id),
  recipient_id TEXT NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL CHECK(status IN ('active','removed')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  UNIQUE(owner_id,recipient_id),
  CHECK(owner_id<>recipient_id)
);
CREATE TRIGGER customer_payee_insert BEFORE INSERT ON customer_payees BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers s JOIN customers r ON r.branch_id=s.branch_id WHERE s.id=NEW.owner_id AND r.id=NEW.recipient_id AND s.status='active' AND r.status='active' AND s.account_id<>r.account_id) THEN RAISE(ABORT,'Payee must be an active different registered account in the same branch') END;
  SELECT CASE WHEN NEW.status='active' AND (SELECT count(*) FROM customer_payees WHERE owner_id=NEW.owner_id AND status='active')>=50 AND NOT EXISTS(SELECT 1 FROM customer_payees WHERE owner_id=NEW.owner_id AND recipient_id=NEW.recipient_id) THEN RAISE(ABORT,'Demo safety limit of 50 active payees reached') END;
END;
CREATE TRIGGER customer_payee_update BEFORE UPDATE ON customer_payees BEGIN
  SELECT CASE WHEN NEW.id<>OLD.id OR NEW.owner_id<>OLD.owner_id OR NEW.recipient_id<>OLD.recipient_id OR NEW.status=OLD.status OR NEW.version<>OLD.version+1 THEN RAISE(ABORT,'Payee identity is immutable; each status change advances its version') END;
  SELECT CASE WHEN NEW.status='active' AND ((SELECT count(*) FROM customer_payees WHERE owner_id=NEW.owner_id AND status='active')>=50 OR NOT EXISTS(SELECT 1 FROM customers s JOIN customers r ON r.branch_id=s.branch_id WHERE s.id=NEW.owner_id AND r.id=NEW.recipient_id AND s.status='active' AND r.status='active')) THEN RAISE(ABORT,'Cannot activate this saved payee') END;
END;
CREATE TRIGGER customer_payee_no_delete BEFORE DELETE ON customer_payees BEGIN SELECT RAISE(ABORT,'Removed payees retain their original identity'); END;
CREATE TABLE customer_payee_reviews (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES customers(id),
  recipient_id TEXT NOT NULL REFERENCES customers(id),
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open','confirmed'))
);
CREATE TRIGGER customer_payee_review_update BEFORE UPDATE ON customer_payee_reviews BEGIN
  SELECT CASE WHEN NEW.id<>OLD.id OR NEW.owner_id<>OLD.owner_id OR NEW.recipient_id<>OLD.recipient_id OR NEW.expires_at<>OLD.expires_at OR OLD.status<>'open' OR NEW.status<>'confirmed' THEN RAISE(ABORT,'Payee review cannot be replayed or changed') END;
END;
CREATE TRIGGER customer_payee_review_confirm AFTER UPDATE OF status ON customer_payee_reviews WHEN NEW.status='confirmed' BEGIN
  INSERT INTO customer_payees(id,owner_id,recipient_id,status) VALUES(NEW.id,NEW.owner_id,NEW.recipient_id,'active')
    ON CONFLICT(owner_id,recipient_id) DO UPDATE SET status='active',version=version+1 WHERE status='removed';
END;
CREATE TRIGGER customer_payee_review_no_delete BEFORE DELETE ON customer_payee_reviews BEGIN SELECT RAISE(ABORT,'Payee reviews cannot be reset'); END;
ALTER TABLE customer_transfer_offers ADD COLUMN payee_id TEXT REFERENCES customer_payees(id);
ALTER TABLE customer_transfer_offers ADD COLUMN payee_version INTEGER;
CREATE TRIGGER customer_offer_payee BEFORE INSERT ON customer_transfer_offers BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customer_payees p WHERE p.id=NEW.payee_id AND p.owner_id=NEW.sender_id AND p.recipient_id=NEW.recipient_id AND p.status='active' AND p.version=NEW.payee_version) THEN RAISE(ABORT,'Review requires an active owned payee') END;
END;
CREATE TRIGGER customer_transfer_payee_execution BEFORE UPDATE OF status ON commands WHEN NEW.status='executing' AND json_extract(NEW.payload,'$.customerOfferId') IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customer_transfer_offers o JOIN customer_payees p ON p.id=o.payee_id JOIN customers s ON s.id=p.owner_id JOIN customers r ON r.id=p.recipient_id WHERE o.id=json_extract(NEW.payload,'$.customerOfferId') AND o.bank_id=NEW.bank_id AND p.owner_id=o.sender_id AND p.recipient_id=o.recipient_id AND p.version=o.payee_version AND p.status='active' AND s.status='active' AND r.status='active' AND s.branch_id=r.branch_id) THEN RAISE(ABORT,'New transfer execution requires its original active saved payee') END;
END;
CREATE TABLE customer_payee_seed_rosters (
  branch_id TEXT PRIMARY KEY REFERENCES banks(id),
  customer_ids TEXT NOT NULL CHECK(json_valid(customer_ids))
);
CREATE TRIGGER customer_payee_roster_no_update BEFORE UPDATE ON customer_payee_seed_rosters BEGIN SELECT RAISE(ABORT,'Payee seed roster is frozen'); END;
CREATE TRIGGER customer_payee_roster_no_delete BEFORE DELETE ON customer_payee_seed_rosters BEGIN SELECT RAISE(ABORT,'Payee seed roster cannot be reset'); END;
CREATE TABLE customer_payee_seed_owners (
  owner_id TEXT PRIMARY KEY REFERENCES customers(id),
  branch_id TEXT NOT NULL REFERENCES customer_payee_seed_rosters(branch_id),
  ordinal INTEGER NOT NULL,
  recipient_ids TEXT NOT NULL CHECK(json_valid(recipient_ids)),
  status TEXT NOT NULL CHECK(status IN ('planned','complete')),
  UNIQUE(branch_id,ordinal)
);
CREATE TRIGGER customer_payee_seed_guard BEFORE UPDATE ON customer_payee_seed_owners BEGIN
  SELECT CASE WHEN NEW.owner_id<>OLD.owner_id OR NEW.branch_id<>OLD.branch_id OR NEW.ordinal<>OLD.ordinal OR NEW.recipient_ids<>OLD.recipient_ids OR OLD.status<>'planned' OR NEW.status<>'complete' THEN RAISE(ABORT,'Payee seed plan is immutable') END;
END;
CREATE TRIGGER customer_payee_seed_no_delete BEFORE DELETE ON customer_payee_seed_owners BEGIN SELECT RAISE(ABORT,'Payee seed plans cannot be reset'); END;
