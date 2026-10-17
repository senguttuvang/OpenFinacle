CREATE TABLE card_replacements (
  id TEXT PRIMARY KEY, bank_id TEXT NOT NULL REFERENCES banks(id),
  terms TEXT NOT NULL CHECK(json_valid(terms)),
  status TEXT NOT NULL CHECK(status IN ('submitted','recommended','issued','dispatched','delivered','activated','rejected','cancelled')),
  maker TEXT, checker TEXT, card_id TEXT UNIQUE REFERENCES replacement_cards(id),
  version INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX replacement_relationship ON card_replacements(bank_id,created_at,id);
CREATE UNIQUE INDEX replacement_one_successor ON card_replacements(bank_id,json_extract(terms,'$.source_card_id')) WHERE card_id IS NOT NULL;
CREATE TABLE card_replacement_events (
  id TEXT PRIMARY KEY, bank_id TEXT NOT NULL REFERENCES banks(id), replacement_id TEXT NOT NULL,
  command_key TEXT NOT NULL, command_payload TEXT NOT NULL,
  actor TEXT NOT NULL CHECK(actor IN ('customer','officer','approver')),
  action TEXT NOT NULL CHECK(action IN ('submit','recommend','issue','dispatch','deliver','activate','reject','cancel')),
  note TEXT NOT NULL CHECK(length(trim(note)) BETWEEN 5 AND 300), terms TEXT NOT NULL CHECK(json_valid(terms)),
  status TEXT NOT NULL, maker TEXT, checker TEXT, card_id TEXT,
  source_version INTEGER, card_version INTEGER, card TEXT CHECK(card IS NULL OR json_valid(card)),
  version INTEGER NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(bank_id,command_key), UNIQUE(replacement_id,version)
);
CREATE TABLE replacement_cards (
  id TEXT PRIMARY KEY, bank_id TEXT NOT NULL REFERENCES banks(id),
  replacement_id TEXT NOT NULL UNIQUE REFERENCES card_replacements(id),
  created_event_id TEXT NOT NULL UNIQUE REFERENCES card_replacement_events(id),
  suffix TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','held','blocked')),
  settings TEXT NOT NULL CHECK(json_valid(settings)), activation_required INTEGER NOT NULL CHECK(activation_required IN (0,1)),
  version INTEGER NOT NULL CHECK(version>=0), updated_at TEXT NOT NULL
);
CREATE TABLE replacement_card_events (
  id TEXT PRIMARY KEY, bank_id TEXT NOT NULL REFERENCES banks(id), card_id TEXT NOT NULL REFERENCES replacement_cards(id),
  command_key TEXT, command_payload TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, note TEXT NOT NULL,
  status TEXT NOT NULL, settings TEXT NOT NULL CHECK(json_valid(settings)), version INTEGER NOT NULL CHECK(version>=0), created_at TEXT NOT NULL,
  UNIQUE(bank_id,command_key), UNIQUE(card_id,version)
);
CREATE VIEW banking_cards AS
  SELECT id,bank_id,suffix,status,settings,version,updated_at,0 AS activation_required,NULL AS replacement_id FROM synthetic_cards
  UNION ALL SELECT id,bank_id,suffix,status,settings,version,updated_at,activation_required,replacement_id FROM replacement_cards;
CREATE VIEW banking_card_events AS
  SELECT id,bank_id,card_id,command_key,command_payload,actor,action,note,status,settings,version,created_at FROM card_events
  UNION ALL SELECT id,bank_id,card_id,command_key,command_payload,actor,action,note,status,settings,version,created_at FROM replacement_card_events;

CREATE TRIGGER replacement_event_guard BEFORE INSERT ON card_replacement_events
BEGIN
  SELECT CASE WHEN (NEW.action='issue')<>(NEW.source_version IS NOT NULL) OR (NEW.action='activate')<>(NEW.card_version IS NOT NULL) OR (NEW.action IN ('issue','activate'))<>(NEW.card IS NOT NULL) THEN RAISE(ABORT,'Invalid replacement command fields') END;
  SELECT CASE WHEN NEW.action='submit' AND (
    NEW.version<>0 OR NEW.actor<>'customer' OR NEW.status<>'submitted' OR NEW.maker IS NOT NULL OR NEW.checker IS NOT NULL OR NEW.card_id IS NOT NULL OR
    EXISTS(SELECT 1 FROM card_replacements WHERE id=NEW.replacement_id) OR
    NOT EXISTS(SELECT 1 FROM banks WHERE id=NEW.bank_id AND customer_account>0 AND status='ready') OR
    NOT EXISTS(SELECT 1 FROM banking_cards c WHERE c.id=json_extract(NEW.terms,'$.source_card_id') AND c.bank_id=NEW.bank_id AND c.version=json_extract(NEW.terms,'$.source_version') AND (json_extract(NEW.terms,'$.reason') IN ('damaged','expired') OR (json_extract(NEW.terms,'$.reason')='lost' AND c.status='blocked'))) OR
    COALESCE(length(trim(json_extract(NEW.terms,'$.address'))),0) NOT BETWEEN 10 AND 300 OR
    EXISTS(SELECT 1 FROM card_replacements r WHERE r.bank_id=NEW.bank_id AND json_extract(r.terms,'$.source_card_id')=json_extract(NEW.terms,'$.source_card_id') AND (r.card_id IS NOT NULL OR r.status IN ('submitted','recommended')))
  ) THEN RAISE(ABORT,'Invalid or duplicate replacement submission') END;
  SELECT CASE WHEN NEW.action<>'submit' AND NOT EXISTS(
    SELECT 1 FROM card_replacements r WHERE r.id=NEW.replacement_id AND r.bank_id=NEW.bank_id AND r.version=NEW.version-1 AND r.terms=NEW.terms AND (
      (r.status='submitted' AND NEW.actor='officer' AND NEW.action='recommend' AND NEW.status='recommended' AND NEW.maker='officer' AND NEW.checker IS NULL AND NEW.card_id IS NULL) OR
      (r.status='submitted' AND NEW.actor='officer' AND NEW.action='reject' AND NEW.status='rejected' AND NEW.maker IS NULL AND NEW.checker IS NULL AND NEW.card_id IS NULL) OR
      (r.status='submitted' AND NEW.actor='customer' AND NEW.action='cancel' AND NEW.status='cancelled' AND NEW.maker IS NULL AND NEW.checker IS NULL AND NEW.card_id IS NULL) OR
      (r.status='recommended' AND r.maker='officer' AND NEW.actor='approver' AND NEW.maker='officer' AND NEW.checker='approver' AND ((NEW.action='reject' AND NEW.status='rejected' AND NEW.card_id IS NULL) OR (NEW.action='issue' AND NEW.status='issued' AND NEW.card_id='replacement:'||r.id))) OR
      (r.status='issued' AND NEW.actor='officer' AND NEW.action='dispatch' AND NEW.status='dispatched' AND NEW.maker IS r.maker AND NEW.checker IS r.checker AND NEW.card_id=r.card_id) OR
      (r.status='dispatched' AND NEW.actor='officer' AND NEW.action='deliver' AND NEW.status='delivered' AND NEW.maker IS r.maker AND NEW.checker IS r.checker AND NEW.card_id=r.card_id) OR
      (r.status='delivered' AND NEW.actor='customer' AND NEW.action='activate' AND NEW.status='activated' AND NEW.maker='officer' AND NEW.checker='approver' AND NEW.maker IS r.maker AND NEW.checker IS r.checker AND NEW.card_id=r.card_id)
    )
  ) THEN RAISE(ABORT,'Stale or unauthorised replacement action') END;
  SELECT CASE WHEN NEW.action='issue' AND NOT EXISTS(SELECT 1 FROM banking_cards c WHERE c.id=json_extract(NEW.terms,'$.source_card_id') AND c.bank_id=NEW.bank_id AND c.version=NEW.source_version) THEN RAISE(ABORT,'Source card changed during issuance') END;
  SELECT CASE WHEN NEW.action='activate' AND NOT EXISTS(SELECT 1 FROM replacement_cards c WHERE c.id=NEW.card_id AND c.bank_id=NEW.bank_id AND c.replacement_id=NEW.replacement_id AND c.status='held' AND c.activation_required=1 AND c.version=NEW.card_version AND json_extract(NEW.card,'$.id')=c.id AND json_extract(NEW.card,'$.bank_id')=c.bank_id AND json_extract(NEW.card,'$.status')='active' AND json_extract(NEW.card,'$.version')=c.version+1 AND json(json_extract(NEW.card,'$.settings'))=json(c.settings)) THEN RAISE(ABORT,'Replacement card changed or blocked before activation') END;
END;
CREATE TRIGGER replacement_projection_guard BEFORE UPDATE ON card_replacements
BEGIN
  SELECT CASE WHEN NEW.id<>OLD.id OR NEW.bank_id<>OLD.bank_id OR NEW.terms<>OLD.terms OR NEW.created_at<>OLD.created_at OR NEW.version<>OLD.version+1 OR NOT EXISTS(SELECT 1 FROM card_replacement_events e WHERE e.replacement_id=OLD.id AND e.bank_id=OLD.bank_id AND e.version=NEW.version AND e.status=NEW.status AND e.maker IS NEW.maker AND e.checker IS NEW.checker AND e.card_id IS NEW.card_id AND e.created_at=NEW.updated_at) THEN RAISE(ABORT,'Replacement updates require an immutable command') END;
END;
CREATE TRIGGER replacement_insert_guard BEFORE INSERT ON card_replacements
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM card_replacement_events e WHERE e.replacement_id=NEW.id AND e.bank_id=NEW.bank_id AND e.action='submit' AND e.version=0 AND NEW.version=0 AND NEW.status='submitted' AND e.terms=NEW.terms AND NEW.maker IS NULL AND NEW.checker IS NULL AND NEW.card_id IS NULL AND NEW.created_at=e.created_at AND NEW.updated_at=e.created_at) THEN RAISE(ABORT,'Replacement requires an immutable submission') END;
END;
CREATE TRIGGER replacement_card_insert_guard BEFORE INSERT ON replacement_cards
BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM card_replacement_events e JOIN card_replacements r ON r.id=e.replacement_id JOIN banking_cards s ON s.id=json_extract(e.terms,'$.source_card_id') AND s.bank_id=e.bank_id
    WHERE e.id=NEW.created_event_id AND e.action='issue' AND e.actor='approver' AND e.maker='officer' AND e.checker='approver' AND e.status='issued' AND e.card_id=NEW.id AND e.bank_id=NEW.bank_id AND e.replacement_id=NEW.replacement_id AND r.status='recommended' AND s.status='blocked' AND
    NEW.id='replacement:'||e.replacement_id AND NEW.status='held' AND NEW.activation_required=1 AND NEW.version=0 AND NEW.updated_at=e.created_at AND NEW.suffix='R-'||upper(substr(NEW.replacement_id,1,6)) AND NEW.suffix=json_extract(e.card,'$.suffix') AND NEW.settings=json_extract(e.card,'$.settings') AND
    json_extract(e.card,'$.id')=NEW.id AND json_extract(e.card,'$.bank_id')=NEW.bank_id AND json_extract(e.card,'$.status')='held' AND json_extract(e.card,'$.version')=0 AND
    json_extract(NEW.settings,'$.atm')=0 AND json_extract(NEW.settings,'$.pos')=0 AND json_extract(NEW.settings,'$.online')=0 AND json_extract(NEW.settings,'$.contactless')=0 AND json_extract(NEW.settings,'$.international')=0 AND json_extract(NEW.settings,'$.daily_limit')=25000
  ) THEN RAISE(ABORT,'Replacement card requires independent issuance') END;
END;
CREATE TRIGGER replacement_card_event_guard BEFORE INSERT ON replacement_card_events
BEGIN
  SELECT CASE WHEN NEW.command_key IS NOT NULL AND EXISTS(SELECT 1 FROM card_events WHERE bank_id=NEW.bank_id AND command_key=NEW.command_key) THEN RAISE(ABORT,'Card command reference conflict') END;
  SELECT CASE WHEN NEW.version=0 AND NOT EXISTS(SELECT 1 FROM replacement_cards c WHERE c.id=NEW.card_id AND c.bank_id=NEW.bank_id AND c.version=0 AND NEW.id=c.created_event_id||':issued' AND NEW.actor='approver' AND NEW.action='issued' AND NEW.status=c.status AND NEW.settings=c.settings AND NEW.created_at=c.updated_at) THEN RAISE(ABORT,'Invalid replacement initial history') END;
  SELECT CASE WHEN NEW.version>0 AND NOT EXISTS(
    SELECT 1 FROM replacement_cards c WHERE c.id=NEW.card_id AND c.bank_id=NEW.bank_id AND c.version=NEW.version-1 AND c.status<>'blocked' AND (
      (NEW.action='activate' AND NEW.actor='customer' AND c.status='held' AND c.activation_required=1 AND NEW.status='active' AND NEW.settings=c.settings AND EXISTS(SELECT 1 FROM card_replacement_events e WHERE e.id||':activate'=NEW.id AND e.action='activate' AND e.actor='customer' AND e.card_id=c.id AND e.bank_id=c.bank_id AND e.card_version=c.version AND e.created_at=NEW.created_at)) OR
      (NEW.action='block' AND NEW.status='blocked' AND NEW.settings=c.settings AND (NEW.actor IN ('customer','officer') OR (NEW.actor='approver' AND EXISTS(SELECT 1 FROM card_replacement_events e WHERE e.id||':source'=NEW.id AND e.action='issue' AND e.actor='approver' AND e.bank_id=c.bank_id AND json_extract(e.terms,'$.source_card_id')=c.id)))) OR
      (c.activation_required=0 AND NEW.actor='customer' AND ((NEW.action='settings' AND c.status='active' AND NEW.status='active') OR (NEW.action='hold' AND c.status='active' AND NEW.status='held' AND NEW.settings=c.settings) OR (NEW.action='resume' AND c.status='held' AND NEW.status='active' AND NEW.settings=c.settings)))
    )
  ) THEN RAISE(ABORT,'Stale blocked or unauthorised replacement card') END;
END;
CREATE TRIGGER legacy_card_cross_key_guard BEFORE INSERT ON card_events WHEN NEW.command_key IS NOT NULL AND EXISTS(SELECT 1 FROM replacement_card_events WHERE bank_id=NEW.bank_id AND command_key=NEW.command_key)
BEGIN SELECT RAISE(ABORT,'Card command reference conflict'); END;
CREATE TRIGGER replacement_card_update_guard BEFORE UPDATE ON replacement_cards
BEGIN
  SELECT CASE WHEN NEW.id<>OLD.id OR NEW.bank_id<>OLD.bank_id OR NEW.suffix<>OLD.suffix OR NEW.replacement_id<>OLD.replacement_id OR NEW.created_event_id<>OLD.created_event_id OR OLD.status='blocked' OR NEW.version<>OLD.version+1 OR NOT EXISTS(SELECT 1 FROM replacement_card_events e WHERE e.card_id=OLD.id AND e.bank_id=OLD.bank_id AND e.version=NEW.version AND e.status=NEW.status AND e.settings=NEW.settings AND e.created_at=NEW.updated_at AND NEW.activation_required=CASE WHEN e.action='activate' THEN 0 ELSE OLD.activation_required END) THEN RAISE(ABORT,'Replacement card updates require an immutable command') END;
END;
CREATE TRIGGER replacement_card_event_apply AFTER INSERT ON replacement_card_events
BEGIN
  UPDATE replacement_cards SET status=NEW.status,settings=NEW.settings,activation_required=CASE WHEN NEW.action='activate' THEN 0 ELSE activation_required END,version=NEW.version,updated_at=NEW.created_at WHERE id=NEW.card_id AND bank_id=NEW.bank_id AND version=NEW.version-1;
  INSERT INTO audit(id,bank_id,actor,action,detail,created_at) VALUES(NEW.id,NEW.bank_id,NEW.actor,'card.'||NEW.action,NEW.note,NEW.created_at);
END;
CREATE TRIGGER replacement_card_created AFTER INSERT ON replacement_cards
BEGIN
  INSERT INTO replacement_card_events(id,bank_id,card_id,command_payload,actor,action,note,status,settings,version,created_at) VALUES(NEW.created_event_id||':issued',NEW.bank_id,NEW.id,'{}','approver','issued','Distinct synthetic replacement issued held; no network credentials.',NEW.status,NEW.settings,0,NEW.updated_at);
END;
CREATE TRIGGER replacement_event_apply AFTER INSERT ON card_replacement_events
BEGIN
  INSERT INTO card_replacements(id,bank_id,terms,status,maker,checker,card_id,version,created_at,updated_at) SELECT NEW.replacement_id,NEW.bank_id,NEW.terms,NEW.status,NEW.maker,NEW.checker,NEW.card_id,NEW.version,NEW.created_at,NEW.created_at WHERE NEW.action='submit';
  INSERT INTO card_events(id,bank_id,card_id,command_payload,actor,action,note,status,settings,version,created_at) SELECT NEW.id||':source',NEW.bank_id,id,'{}','approver','block','Source instrument retired by independent synthetic replacement issuance.','blocked',settings,version+1,NEW.created_at FROM synthetic_cards WHERE NEW.action='issue' AND id=json_extract(NEW.terms,'$.source_card_id') AND bank_id=NEW.bank_id AND status<>'blocked';
  INSERT INTO replacement_card_events(id,bank_id,card_id,command_payload,actor,action,note,status,settings,version,created_at) SELECT NEW.id||':source',NEW.bank_id,id,'{}','approver','block','Source instrument retired by independent synthetic replacement issuance.','blocked',settings,version+1,NEW.created_at FROM replacement_cards WHERE NEW.action='issue' AND id=json_extract(NEW.terms,'$.source_card_id') AND bank_id=NEW.bank_id AND status<>'blocked';
  INSERT INTO replacement_cards(id,bank_id,replacement_id,created_event_id,suffix,status,settings,activation_required,version,updated_at) SELECT NEW.card_id,NEW.bank_id,NEW.replacement_id,NEW.id,json_extract(NEW.card,'$.suffix'),'held',json_extract(NEW.card,'$.settings'),1,0,NEW.created_at WHERE NEW.action='issue';
  UPDATE card_replacements SET status=NEW.status,maker=NEW.maker,checker=NEW.checker,card_id=NEW.card_id,version=NEW.version,updated_at=NEW.created_at WHERE NEW.action<>'submit' AND id=NEW.replacement_id AND bank_id=NEW.bank_id AND version=NEW.version-1;
  INSERT INTO replacement_card_events(id,bank_id,card_id,command_payload,actor,action,note,status,settings,version,created_at) SELECT NEW.id||':activate',NEW.bank_id,NEW.card_id,'{}','customer','activate','Customer activated a delivered synthetic replacement; no PIN or network effect.','active',settings,version+1,NEW.created_at FROM replacement_cards WHERE NEW.action='activate' AND id=NEW.card_id AND bank_id=NEW.bank_id AND version=NEW.card_version;
  INSERT INTO audit(id,bank_id,actor,action,detail,created_at) VALUES(NEW.id,NEW.bank_id,NEW.actor,'card-replacement.'||NEW.action,NEW.note,NEW.created_at);
END;
CREATE TRIGGER replacement_no_delete BEFORE DELETE ON card_replacements BEGIN SELECT RAISE(ABORT,'Replacement records are immutable'); END;
CREATE TRIGGER replacement_event_no_update BEFORE UPDATE ON card_replacement_events BEGIN SELECT RAISE(ABORT,'Replacement history is immutable'); END;
CREATE TRIGGER replacement_event_no_delete BEFORE DELETE ON card_replacement_events BEGIN SELECT RAISE(ABORT,'Replacement history is immutable'); END;
CREATE TRIGGER replacement_card_no_delete BEFORE DELETE ON replacement_cards BEGIN SELECT RAISE(ABORT,'Replacement card is immutable'); END;
CREATE TRIGGER replacement_card_history_no_update BEFORE UPDATE ON replacement_card_events BEGIN SELECT RAISE(ABORT,'Replacement card history is immutable'); END;
CREATE TRIGGER replacement_card_history_no_delete BEFORE DELETE ON replacement_card_events BEGIN SELECT RAISE(ABORT,'Replacement card history is immutable'); END;
