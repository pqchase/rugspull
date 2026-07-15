ALTER TABLE rugs ADD COLUMN factory_address TEXT;

CREATE INDEX IF NOT EXISTS idx_rugs_factory_activity
  ON rugs (chain_id, factory_address, updated_block DESC);
