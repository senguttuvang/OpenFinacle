ALTER TABLE service_requests ADD COLUMN payload TEXT NOT NULL DEFAULT '{}';
ALTER TABLE service_requests ADD COLUMN submitted_payload TEXT NOT NULL DEFAULT '{}';
ALTER TABLE service_requests ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE service_requests ADD COLUMN request_key TEXT;
ALTER TABLE service_requests ADD COLUMN outcome_note TEXT NOT NULL DEFAULT '';
ALTER TABLE service_requests ADD COLUMN updated_by TEXT NOT NULL DEFAULT 'system';
ALTER TABLE service_requests ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
ALTER TABLE service_requests ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'not_recorded';
UPDATE service_requests SET updated_at=created_at;
CREATE UNIQUE INDEX service_request_key ON service_requests(bank_id,request_key);
CREATE TABLE service_case_events (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  request_id TEXT NOT NULL REFERENCES service_requests(id),
  bank_id TEXT NOT NULL REFERENCES banks(id),
  actor TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT NOT NULL,
  detail TEXT NOT NULL,
  payload TEXT NOT NULL,
  delivery_status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX service_case_event_order ON service_case_events(bank_id,request_id,created_at);
CREATE TRIGGER service_case_version_guard BEFORE UPDATE ON service_requests
WHEN OLD.request_key IS NOT NULL AND NEW.version<>OLD.version+1
BEGIN
  SELECT RAISE(ABORT,'Managed service cases require a versioned update');
END;
CREATE TRIGGER service_case_identity_guard BEFORE UPDATE ON service_requests
WHEN OLD.request_key IS NOT NULL AND (NEW.request_key IS NOT OLD.request_key OR NEW.submitted_payload<>OLD.submitted_payload OR NEW.kind<>OLD.kind OR NEW.bank_id<>OLD.bank_id)
BEGIN
  SELECT RAISE(ABORT,'The service case submission identity is immutable');
END;
INSERT INTO service_case_events(request_id,bank_id,actor,from_status,to_status,note,detail,payload,delivery_status,created_at)
SELECT id,bank_id,'system',NULL,status,'Existing request imported; earlier processing history is unavailable.',detail,payload,delivery_status,created_at FROM service_requests;
CREATE TRIGGER service_case_created AFTER INSERT ON service_requests WHEN NEW.request_key IS NOT NULL
BEGIN
  INSERT INTO service_case_events(request_id,bank_id,actor,from_status,to_status,note,detail,payload,delivery_status,created_at)
  VALUES(NEW.id,NEW.bank_id,NEW.updated_by,NULL,NEW.status,NEW.outcome_note,NEW.detail,NEW.payload,NEW.delivery_status,NEW.updated_at);
  INSERT INTO audit(id,bank_id,actor,action,detail,created_at)
  VALUES(lower(hex(randomblob(16))),NEW.bank_id,NEW.updated_by,'service.submitted',NEW.kind,NEW.updated_at);
END;
CREATE TRIGGER service_case_changed AFTER UPDATE ON service_requests WHEN NEW.version=OLD.version+1
BEGIN
  INSERT INTO service_case_events(request_id,bank_id,actor,from_status,to_status,note,detail,payload,delivery_status,created_at)
  SELECT OLD.id,OLD.bank_id,'system',NULL,OLD.status,'Existing request imported; earlier processing history is unavailable.',OLD.detail,OLD.payload,OLD.delivery_status,OLD.created_at
  WHERE OLD.request_key IS NULL AND NOT EXISTS (SELECT 1 FROM service_case_events WHERE request_id=OLD.id);
  INSERT INTO service_case_events(request_id,bank_id,actor,from_status,to_status,note,detail,payload,delivery_status,created_at)
  VALUES(NEW.id,NEW.bank_id,NEW.updated_by,OLD.status,NEW.status,NEW.outcome_note,NEW.detail,NEW.payload,NEW.delivery_status,NEW.updated_at);
  INSERT INTO audit(id,bank_id,actor,action,detail,created_at)
  VALUES(lower(hex(randomblob(16))),NEW.bank_id,NEW.updated_by,CASE WHEN NEW.status=OLD.status AND NEW.delivery_status<>OLD.delivery_status THEN 'service.delivery_updated' ELSE 'service.'||NEW.status END,NEW.kind,NEW.updated_at);
END;
