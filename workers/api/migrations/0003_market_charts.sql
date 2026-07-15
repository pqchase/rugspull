CREATE TABLE IF NOT EXISTS block_times (
  chain_id INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  block_timestamp INTEGER NOT NULL,
  PRIMARY KEY (chain_id, block_number)
);

CREATE TABLE IF NOT EXISTS rug_market_stats (
  chain_id INTEGER NOT NULL,
  rug_address TEXT NOT NULL,
  trade_count INTEGER NOT NULL DEFAULT 0,
  buy_quote_volume TEXT NOT NULL DEFAULT '0',
  sell_quote_volume TEXT NOT NULL DEFAULT '0',
  protocol_fee_quote TEXT NOT NULL DEFAULT '0',
  latest_price_x18 TEXT NOT NULL DEFAULT '0',
  updated_block INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chain_id, rug_address)
);

CREATE INDEX IF NOT EXISTS idx_block_times_timestamp
  ON block_times (chain_id, block_timestamp);

CREATE INDEX IF NOT EXISTS idx_market_stats_activity
  ON rug_market_stats (chain_id, updated_block DESC);
