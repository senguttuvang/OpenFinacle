-- Synthetic workflow declarations only. These are not physical or financial ledger evidence.
CREATE TABLE branch_cash_count_events (
  id TEXT PRIMARY KEY NOT NULL,
  branch_id TEXT NOT NULL REFERENCES banks(id),
  count_id TEXT NOT NULL,
  command_key TEXT NOT NULL,
  actor TEXT NOT NULL CHECK(actor IN ('officer','approver')),
  action TEXT NOT NULL CHECK(action IN ('declare','review','return','resubmit','withdraw')),
  expected_version INTEGER NOT NULL CHECK(typeof(expected_version)='integer' AND expected_version>=0),
  version INTEGER NOT NULL CHECK(typeof(version)='integer' AND version=expected_version+1),
  status TEXT NOT NULL CHECK(status IN ('submitted','reviewed','returned','withdrawn')),
  request_json TEXT NOT NULL CHECK(json_valid(request_json)),
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  note TEXT NOT NULL CHECK(length(trim(note)) BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL,
  UNIQUE(branch_id,command_key),
  UNIQUE(count_id,version)
);
CREATE INDEX branch_cash_count_latest ON branch_cash_count_events(branch_id,count_id,version DESC);
CREATE TRIGGER branch_cash_count_validate BEFORE INSERT ON branch_cash_count_events BEGIN
  SELECT RAISE(ABORT,'Invalid declaration identity') WHERE length(NEW.id)=0 OR length(NEW.count_id)=0 OR length(NEW.command_key) NOT BETWEEN 8 AND 100;
  SELECT RAISE(ABORT,'Count source is a synthetic declaration') WHERE json_extract(NEW.snapshot_json,'$.source') IS NOT 'synthetic_declaration' OR json_extract(NEW.snapshot_json,'$.currency') IS NOT 'INR';
  SELECT RAISE(ABORT,'Command identity differs from the saved event') WHERE json_extract(NEW.request_json,'$.actor') IS NOT NEW.actor OR json_extract(NEW.request_json,'$.command.action') IS NOT NEW.action OR json_extract(NEW.request_json,'$.command.version') IS NOT NEW.expected_version OR json_extract(NEW.request_json,'$.command.note') IS NOT NEW.note OR (NEW.action<>'declare' AND json_extract(NEW.request_json,'$.command.id') IS NOT NEW.count_id);
  SELECT RAISE(ABORT,'Declaration identity differs from the request') WHERE NEW.action='declare' AND (json_extract(NEW.request_json,'$.command.boxType') IS NOT json_extract(NEW.snapshot_json,'$.boxType') OR json_extract(NEW.request_json,'$.command.label') IS NOT json_extract(NEW.snapshot_json,'$.label') OR json_extract(NEW.request_json,'$.command.countDate') IS NOT json_extract(NEW.snapshot_json,'$.countDate'));
  SELECT RAISE(ABORT,'Declared quantities differ from the request') WHERE NEW.action IN ('declare','resubmit') AND json_extract(NEW.request_json,'$.command.quantities') IS NOT json_extract(NEW.snapshot_json,'$.quantities');
  SELECT RAISE(ABORT,'Invalid declared count scope') WHERE json_type(NEW.snapshot_json,'$.boxType') IS NOT 'text' OR json_type(NEW.snapshot_json,'$.label') IS NOT 'text' OR json_extract(NEW.snapshot_json,'$.boxType') NOT IN ('teller','vault') OR length(trim(json_extract(NEW.snapshot_json,'$.label'))) NOT BETWEEN 1 AND 80 OR json_extract(NEW.snapshot_json,'$.countDate') IS NULL OR date(json_extract(NEW.snapshot_json,'$.countDate'),'+0 days') IS NOT json_extract(NEW.snapshot_json,'$.countDate');
  SELECT RAISE(ABORT,'Every supported quantity must be declared') WHERE json_type(NEW.snapshot_json,'$.quantities') IS NOT 'array' OR json_array_length(NEW.snapshot_json,'$.quantities')<>10 OR (SELECT count(DISTINCT json_extract(value,'$.denominationMinor')) FROM json_each(NEW.snapshot_json,'$.quantities'))<>10;
  SELECT RAISE(ABORT,'Invalid denomination quantity') WHERE EXISTS(SELECT 1 FROM json_each(NEW.snapshot_json,'$.quantities') WHERE json_type(value,'$.denominationMinor') IS NOT 'integer' OR json_extract(value,'$.denominationMinor') NOT IN (50000,20000,10000,5000,2000,1000,500,200,100,50) OR json_type(value,'$.quantity') IS NOT 'integer' OR json_extract(value,'$.quantity') NOT BETWEEN 0 AND 1000000);
  SELECT RAISE(ABORT,'Declared total does not match quantities') WHERE json_type(NEW.snapshot_json,'$.totalMinor') IS NOT 'integer' OR json_extract(NEW.snapshot_json,'$.totalMinor') IS NOT (SELECT sum(json_extract(value,'$.denominationMinor')*json_extract(value,'$.quantity')) FROM json_each(NEW.snapshot_json,'$.quantities'));
  SELECT RAISE(ABORT,'Declaration requires officer and first version') WHERE NEW.action='declare' AND (NEW.actor<>'officer' OR NEW.expected_version<>0 OR NEW.status<>'submitted' OR EXISTS(SELECT 1 FROM branch_cash_count_events WHERE count_id=NEW.count_id));
  SELECT RAISE(ABORT,'Count history or branch differs') WHERE NEW.action<>'declare' AND NOT EXISTS(SELECT 1 FROM branch_cash_count_events WHERE count_id=NEW.count_id AND branch_id=NEW.branch_id AND version=NEW.expected_version);
  SELECT RAISE(ABORT,'Stale count version') WHERE NEW.action<>'declare' AND NEW.expected_version IS NOT (SELECT max(version) FROM branch_cash_count_events WHERE count_id=NEW.count_id);
  SELECT RAISE(ABORT,'Count identity cannot change') WHERE NEW.action<>'declare' AND (json_extract(NEW.snapshot_json,'$.boxType') IS NOT (SELECT json_extract(snapshot_json,'$.boxType') FROM branch_cash_count_events WHERE count_id=NEW.count_id AND version=1) OR json_extract(NEW.snapshot_json,'$.label') IS NOT (SELECT json_extract(snapshot_json,'$.label') FROM branch_cash_count_events WHERE count_id=NEW.count_id AND version=1) OR json_extract(NEW.snapshot_json,'$.countDate') IS NOT (SELECT json_extract(snapshot_json,'$.countDate') FROM branch_cash_count_events WHERE count_id=NEW.count_id AND version=1));
  SELECT RAISE(ABORT,'Only approver may review or return submitted declarations') WHERE NEW.action IN ('review','return') AND (NEW.actor<>'approver' OR (SELECT status FROM branch_cash_count_events WHERE count_id=NEW.count_id AND version=NEW.expected_version)<>'submitted' OR NEW.status<>CASE WHEN NEW.action='review' THEN 'reviewed' ELSE 'returned' END);
  SELECT RAISE(ABORT,'Only officer may resubmit returned declarations') WHERE NEW.action='resubmit' AND (NEW.actor<>'officer' OR (SELECT status FROM branch_cash_count_events WHERE count_id=NEW.count_id AND version=NEW.expected_version)<>'returned' OR NEW.status<>'submitted');
  SELECT RAISE(ABORT,'Only officer may withdraw open declarations') WHERE NEW.action='withdraw' AND (NEW.actor<>'officer' OR (SELECT status FROM branch_cash_count_events WHERE count_id=NEW.count_id AND version=NEW.expected_version) NOT IN ('submitted','returned') OR NEW.status<>'withdrawn');
  SELECT RAISE(ABORT,'Action must retain the declared snapshot') WHERE NEW.action IN ('review','return','withdraw') AND NEW.snapshot_json IS NOT (SELECT snapshot_json FROM branch_cash_count_events WHERE count_id=NEW.count_id AND version=NEW.expected_version);
END;
CREATE TRIGGER branch_cash_count_no_update BEFORE UPDATE ON branch_cash_count_events BEGIN SELECT RAISE(ABORT,'Cash declaration history is immutable'); END;
CREATE TRIGGER branch_cash_count_no_delete BEFORE DELETE ON branch_cash_count_events BEGIN SELECT RAISE(ABORT,'Cash declaration history cannot be reset'); END;
