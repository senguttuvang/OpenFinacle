-- Only the dedicated local planning preview uses these minimal tenancy/session tables.
-- These are not Fineract bank records, account balances or financial postings.
CREATE TABLE IF NOT EXISTS banks (id TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  bank_id TEXT NOT NULL REFERENCES banks(id),
  role TEXT NOT NULL CHECK(role IN ('customer','officer','approver')),
  expires_at INTEGER NOT NULL
);
