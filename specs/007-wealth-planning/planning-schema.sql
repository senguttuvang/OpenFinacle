-- Planning-only schema contract, pending Finacle4 migration identity lease.
-- No actual banking balances or postings are stored here.
CREATE TABLE planning_households (
  bank_id TEXT NOT NULL REFERENCES banks(id),
  household_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(json_valid(state)),
  version INTEGER NOT NULL CHECK(version >= 0),
  PRIMARY KEY(bank_id, household_id)
);
CREATE TABLE planning_events (
  id TEXT PRIMARY KEY,
  bank_id TEXT NOT NULL REFERENCES banks(id),
  household_id TEXT NOT NULL,
  command_key TEXT NOT NULL,
  payload TEXT NOT NULL,
  actor TEXT NOT NULL CHECK(actor = 'customer'),
  action TEXT NOT NULL CHECK(action IN ('initialize','save')),
  state TEXT NOT NULL CHECK(json_valid(state)),
  version INTEGER NOT NULL CHECK(version >= 0),
  created_at TEXT NOT NULL,
  UNIQUE(bank_id,command_key),
  UNIQUE(bank_id,household_id,version)
);
CREATE TRIGGER planning_apply AFTER INSERT ON planning_events BEGIN
  INSERT INTO planning_households(bank_id,household_id,state,version)
  VALUES(NEW.bank_id,NEW.household_id,NEW.state,NEW.version)
  ON CONFLICT(bank_id,household_id) DO UPDATE SET state=excluded.state,version=excluded.version;
END;
CREATE TRIGGER planning_immutable_update BEFORE UPDATE ON planning_events BEGIN
  SELECT RAISE(ABORT,'Planning audit events are immutable');
END;
CREATE TRIGGER planning_immutable_delete BEFORE DELETE ON planning_events BEGIN
  SELECT RAISE(ABORT,'Planning audit events are immutable');
END;
