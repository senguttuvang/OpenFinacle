-- Workflow responsibility only: never a financial record or authority grant.
CREATE TABLE branch_responsibilities (
  branch_id TEXT NOT NULL REFERENCES banks(id),
  command_id TEXT NOT NULL REFERENCES commands(id),
  owner TEXT NOT NULL CHECK(owner IN ('teller','checker','manager','accountant')),
  version INTEGER NOT NULL CHECK(version>0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(branch_id,command_id)
);
