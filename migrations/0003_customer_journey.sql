ALTER TABLE banks ADD COLUMN journey TEXT NOT NULL DEFAULT 'new' CHECK (journey IN ('new', 'existing'));
