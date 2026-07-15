CREATE INDEX IF NOT EXISTS idx_rugs_status_updated
  ON rugs (status, updated_block DESC);

CREATE INDEX IF NOT EXISTS idx_rugs_chain_creator
  ON rugs (chain_id, creator);

CREATE INDEX IF NOT EXISTS idx_rug_events_rug_order
  ON rug_events (chain_id, rug_address, block_number, log_index);

CREATE INDEX IF NOT EXISTS idx_sync_state_progress
  ON sync_state (chain_id, last_scanned_block);
