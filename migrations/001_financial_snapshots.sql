BEGIN;
CREATE SCHEMA IF NOT EXISTS mizan;
CREATE TABLE IF NOT EXISTS mizan.financial_snapshots (
  id uuid PRIMARY KEY,
  entity_id text NOT NULL,
  period text NOT NULL CHECK (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  scenario text NOT NULL,
  payload jsonb NOT NULL CHECK (payload->>'version' = '1'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS financial_snapshots_scope_created
  ON mizan.financial_snapshots (entity_id, scenario, created_at DESC);
COMMIT;
