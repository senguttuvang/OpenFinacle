CREATE UNIQUE INDEX IF NOT EXISTS one_live_reversal_per_posting ON commands(bank_id,json_extract(payload,'$.originalId')) WHERE kind='reverse' AND status IN ('pending','executing','posted','uncertain');
CREATE TABLE IF NOT EXISTS usage_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0);
