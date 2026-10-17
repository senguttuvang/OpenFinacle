CREATE TABLE synthetic_cards (
  id TEXT PRIMARY KEY,
  bank_id TEXT NOT NULL UNIQUE REFERENCES banks(id),
  suffix TEXT NOT NULL DEFAULT '4242',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','held','blocked')),
  settings TEXT NOT NULL DEFAULT '{"atm":true,"pos":true,"online":false,"contactless":false,"international":false,"daily_limit":25000}' CHECK(json_valid(settings)),
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE card_events (
  id TEXT PRIMARY KEY,
  bank_id TEXT NOT NULL REFERENCES banks(id),
  card_id TEXT NOT NULL REFERENCES synthetic_cards(id),
  command_key TEXT,
  command_payload TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  note TEXT NOT NULL,
  status TEXT NOT NULL,
  settings TEXT NOT NULL CHECK(json_valid(settings)),
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(bank_id,command_key),
  UNIQUE(card_id,version)
);
CREATE TRIGGER card_event_guard BEFORE INSERT ON card_events WHEN NEW.version>0
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM synthetic_cards WHERE id=NEW.card_id AND bank_id=NEW.bank_id AND version=NEW.version-1 AND status<>'blocked') THEN RAISE(ABORT,'Stale or blocked card') END;
END;
CREATE TRIGGER card_update_guard BEFORE UPDATE ON synthetic_cards
BEGIN
  SELECT CASE WHEN NEW.id<>OLD.id OR NEW.bank_id<>OLD.bank_id OR NEW.suffix<>OLD.suffix OR OLD.status='blocked' OR NEW.version<>OLD.version+1 OR NOT EXISTS(SELECT 1 FROM card_events WHERE card_id=OLD.id AND bank_id=OLD.bank_id AND version=NEW.version AND status=NEW.status AND settings=NEW.settings AND created_at=NEW.updated_at) THEN RAISE(ABORT,'Card updates require an immutable command event') END;
END;
CREATE TRIGGER card_event_apply AFTER INSERT ON card_events WHEN NEW.version>0
BEGIN
  UPDATE synthetic_cards SET status=NEW.status,settings=NEW.settings,version=NEW.version,updated_at=NEW.created_at WHERE id=NEW.card_id AND bank_id=NEW.bank_id AND version=NEW.version-1;
  INSERT INTO audit(id,bank_id,actor,action,detail,created_at) VALUES(NEW.id,NEW.bank_id,NEW.actor,'card.'||NEW.action,NEW.note,NEW.created_at);
END;
CREATE TRIGGER card_event_immutable BEFORE UPDATE ON card_events BEGIN SELECT RAISE(ABORT,'Card history is immutable'); END;
CREATE TRIGGER card_event_no_delete BEFORE DELETE ON card_events BEGIN SELECT RAISE(ABORT,'Card history is immutable'); END;
CREATE TRIGGER card_created AFTER INSERT ON synthetic_cards
BEGIN
  INSERT INTO card_events(id,bank_id,card_id,command_payload,actor,action,note,status,settings,version,created_at) VALUES(lower(hex(randomblob(16))),NEW.bank_id,NEW.id,'{}','system','issued','Synthetic demonstration card issued; no network credentials.',NEW.status,NEW.settings,0,NEW.updated_at);
END;
INSERT INTO synthetic_cards(id,bank_id) SELECT 'demo-debit:'||id,id FROM banks WHERE customer_account>0;
CREATE TRIGGER card_after_account_opened AFTER UPDATE OF customer_account ON banks WHEN NEW.customer_account>0
BEGIN
  INSERT INTO synthetic_cards(id,bank_id) VALUES('demo-debit:'||NEW.id,NEW.id) ON CONFLICT(bank_id) DO NOTHING;
END;
CREATE TRIGGER card_for_open_relationship AFTER INSERT ON banks WHEN NEW.customer_account>0
BEGIN
  INSERT INTO synthetic_cards(id,bank_id) VALUES('demo-debit:'||NEW.id,NEW.id) ON CONFLICT(bank_id) DO NOTHING;
END;
