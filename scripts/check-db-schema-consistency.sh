#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_FILE="$(mktemp "${TMPDIR:-/tmp}/rugspull-schema.XXXXXX.sqlite")"

cleanup() {
  rm -f "$DB_FILE"
}
trap cleanup EXIT

require_column() {
  local table="$1"
  local column="$2"
  if ! sqlite3 "$DB_FILE" "PRAGMA table_info($table);" | awk -F'|' '{ print $2 }' | grep -qx "$column"; then
    echo "Missing D1 column: $table.$column" >&2
    exit 1
  fi
}

require_pk_columns() {
  local table="$1"
  local expected="$2"
  local actual
  actual="$(sqlite3 "$DB_FILE" "PRAGMA table_info($table);" | awk -F'|' '$6 > 0 { print $6 ":" $2 }' | sort -n | cut -d: -f2- | paste -sd, -)"
  if [ "$actual" != "$expected" ]; then
    echo "Unexpected primary key for $table: '$actual', expected '$expected'." >&2
    exit 1
  fi
}

cd "$ROOT"

for migration in workers/api/migrations/*.sql; do
  sqlite3 "$DB_FILE" < "$migration"
done

for table in rugs rug_events sync_state metadata_objects block_times rug_market_stats; do
  if ! sqlite3 "$DB_FILE" ".tables" | tr ' ' '\n' | grep -qx "$table"; then
    echo "Missing D1 table: $table" >&2
    exit 1
  fi
done

for column in \
  chain_id rug_address factory_address creator token_address pool_address status name symbol \
  metadata_uri metadata_hash disclosure_hash creator_stake total_contributed \
  accepted_contribution founder_allocation founder_remaining opening_start \
  opening_end founder_unlock_time created_block updated_block; do
  require_column rugs "$column"
done
require_pk_columns rugs "chain_id,rug_address"

for column in chain_id tx_hash log_index block_number rug_address event_name event_json; do
  require_column rug_events "$column"
done
require_pk_columns rug_events "chain_id,tx_hash,log_index"

for column in chain_id contract_address last_scanned_block; do
  require_column sync_state "$column"
done
require_pk_columns sync_state "chain_id,contract_address"

for column in hash r2_key mime_type byte_size created_at uploader; do
  require_column metadata_objects "$column"
done
require_pk_columns metadata_objects "hash"

for column in chain_id block_number block_timestamp; do
  require_column block_times "$column"
done
require_pk_columns block_times "chain_id,block_number"

for column in \
  chain_id rug_address trade_count buy_quote_volume sell_quote_volume \
  protocol_fee_quote latest_price_x18 updated_block; do
  require_column rug_market_stats "$column"
done
require_pk_columns rug_market_stats "chain_id,rug_address"

sqlite3 "$DB_FILE" <<'SQL' >/dev/null
INSERT INTO rugs (
  chain_id, rug_address, factory_address, creator, status, name, symbol, metadata_uri, metadata_hash,
  disclosure_hash, creator_stake, opening_start, opening_end, created_block, updated_block
) VALUES (
  97, '0x0000000000000000000000000000000000000001',
  '0x0000000000000000000000000000000000000004',
  '0x0000000000000000000000000000000000000002', 'Opening', 'Schema Rug',
  'SCHEMA', 'r2://metadata/schema.json', '0x00', '0x00', '1', 1, 2, 3, 3
);
INSERT INTO rug_events (
  chain_id, tx_hash, log_index, block_number, rug_address, event_name, event_json
) VALUES (
  97, '0x01', 0, 3, '0x0000000000000000000000000000000000000001', 'RugCreated', '{}'
);
INSERT INTO sync_state (chain_id, contract_address, last_scanned_block)
VALUES (97, '0x0000000000000000000000000000000000000003', 4);
INSERT INTO metadata_objects (hash, r2_key, mime_type, byte_size, created_at, uploader)
VALUES ('0x02', 'metadata/0x02.json', 'application/json', 2, 5, NULL);
INSERT INTO block_times (chain_id, block_number, block_timestamp)
VALUES (97, 3, 6);
INSERT INTO rug_market_stats (
  chain_id, rug_address, trade_count, buy_quote_volume, sell_quote_volume,
  protocol_fee_quote, latest_price_x18, updated_block
) VALUES (
  97, '0x0000000000000000000000000000000000000001', 1, '10', '0', '1', '100', 3
);

SELECT * FROM rugs ORDER BY updated_block DESC LIMIT 1;
SELECT * FROM rugs WHERE chain_id = 97 AND lower(rug_address) = lower('0x0000000000000000000000000000000000000001');
SELECT * FROM rug_events WHERE chain_id = 97 AND lower(rug_address) = lower('0x0000000000000000000000000000000000000001')
  ORDER BY block_number, log_index LIMIT 100;
SELECT contract_address, last_scanned_block FROM sync_state WHERE chain_id = 97 ORDER BY contract_address;
SELECT block_timestamp FROM block_times WHERE chain_id = 97 AND block_number = 3;
SELECT * FROM rug_market_stats WHERE chain_id = 97 AND lower(rug_address) = lower('0x0000000000000000000000000000000000000001');
SQL

echo "D1 schema consistency check passed."
