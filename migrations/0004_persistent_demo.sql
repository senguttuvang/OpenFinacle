CREATE TABLE IF NOT EXISTS financial_snapshots (
  bank_id TEXT PRIMARY KEY REFERENCES banks(id),
  payload TEXT NOT NULL,
  synced_at INTEGER NOT NULL,
  invalidated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS demo_seed_lease (
  id INTEGER PRIMARY KEY CHECK(id=1),
  owner TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
