-- Responsibility labels only: no case decision, identity authority or financial effect.
CREATE TABLE branch_case_responsibility_events (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)>0),
  branch_id TEXT NOT NULL REFERENCES banks(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  request_id TEXT NOT NULL REFERENCES service_requests(id),
  command_key TEXT NOT NULL CHECK(length(command_key) BETWEEN 8 AND 100 AND command_key NOT GLOB '*[^a-zA-Z0-9_-]*'),
  actor TEXT NOT NULL CHECK(actor IN ('officer','approver')),
  owner TEXT CHECK(owner IN ('teller','checker','manager','accountant')),
  note TEXT NOT NULL CHECK(length(note) BETWEEN 5 AND 500 AND note=trim(note)),
  expected_version INTEGER NOT NULL CHECK(typeof(expected_version)='integer' AND expected_version BETWEEN 0 AND 9007199254740990),
  version INTEGER NOT NULL CHECK(typeof(version)='integer' AND version=expected_version+1 AND version<=9007199254740991),
  request_json TEXT NOT NULL CHECK(json_valid(request_json)),
  created_at TEXT NOT NULL,
  UNIQUE(branch_id,command_key),
  UNIQUE(request_id,version)
);
CREATE INDEX branch_case_responsibility_history ON branch_case_responsibility_events(branch_id,customer_id,request_id,version);
CREATE TRIGGER branch_case_responsibility_validate BEFORE INSERT ON branch_case_responsibility_events BEGIN
  SELECT RAISE(ABORT,'Assignment request must contain an explicit owner and integer version') WHERE (json_type(NEW.request_json,'$.command.owner') IS NOT 'text' AND json_type(NEW.request_json,'$.command.owner') IS NOT 'null') OR json_type(NEW.request_json,'$.command.version') IS NOT 'integer';
  SELECT RAISE(ABORT,'Invalid responsibility scope') WHERE NOT EXISTS(SELECT 1 FROM customers c JOIN service_requests s ON s.bank_id=c.bank_id WHERE c.id=NEW.customer_id AND c.branch_id=NEW.branch_id AND c.status='active' AND s.id=NEW.request_id);
  SELECT RAISE(ABORT,'Assignment identity differs from request') WHERE json_extract(NEW.request_json,'$.actor') IS NOT NEW.actor OR json_extract(NEW.request_json,'$.customerId') IS NOT NEW.customer_id OR json_extract(NEW.request_json,'$.requestId') IS NOT NEW.request_id OR json_extract(NEW.request_json,'$.command.version') IS NOT NEW.expected_version OR json_extract(NEW.request_json,'$.command.owner') IS NOT NEW.owner OR json_extract(NEW.request_json,'$.command.note') IS NOT NEW.note;
  SELECT RAISE(ABORT,'Assignment history scope cannot change') WHERE EXISTS(SELECT 1 FROM branch_case_responsibility_events e WHERE e.request_id=NEW.request_id AND (e.branch_id<>NEW.branch_id OR e.customer_id<>NEW.customer_id));
  SELECT RAISE(ABORT,'Stale responsibility version') WHERE NEW.expected_version IS NOT COALESCE((SELECT max(version) FROM branch_case_responsibility_events WHERE request_id=NEW.request_id),0);
  SELECT RAISE(ABORT,'Responsibility owner did not change') WHERE NEW.owner IS (SELECT owner FROM branch_case_responsibility_events WHERE request_id=NEW.request_id ORDER BY version DESC LIMIT 1);
END;
CREATE TRIGGER branch_case_responsibility_no_update BEFORE UPDATE ON branch_case_responsibility_events BEGIN SELECT RAISE(ABORT,'Responsibility history is immutable'); END;
CREATE TRIGGER branch_case_responsibility_no_delete BEFORE DELETE ON branch_case_responsibility_events BEGIN SELECT RAISE(ABORT,'Responsibility history cannot be reset'); END;
