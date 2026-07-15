CREATE TABLE IF NOT EXISTS rugs (
  chain_id INTEGER NOT NULL,
  rug_address TEXT NOT NULL,
  creator TEXT NOT NULL,
  token_address TEXT,
  pool_address TEXT,
  status TEXT NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  metadata_uri TEXT NOT NULL,
  metadata_hash TEXT NOT NULL,
  disclosure_hash TEXT NOT NULL,
  creator_stake TEXT NOT NULL,
  total_contributed TEXT NOT NULL DEFAULT '0',
  accepted_contribution TEXT,
  founder_allocation TEXT,
  founder_remaining TEXT,
  opening_start INTEGER NOT NULL,
  opening_end INTEGER NOT NULL,
  founder_unlock_time INTEGER,
  created_block INTEGER NOT NULL,
  updated_block INTEGER NOT NULL,
  PRIMARY KEY (chain_id, rug_address)
);

CREATE TABLE IF NOT EXISTS rug_events (
  chain_id INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  rug_address TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_json TEXT NOT NULL,
  PRIMARY KEY (chain_id, tx_hash, log_index)
);

CREATE TABLE IF NOT EXISTS sync_state (
  chain_id INTEGER NOT NULL,
  contract_address TEXT NOT NULL,
  last_scanned_block INTEGER NOT NULL,
  PRIMARY KEY (chain_id, contract_address)
);

CREATE TABLE IF NOT EXISTS metadata_objects (
  hash TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  uploader TEXT
);
