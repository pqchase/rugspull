#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WRANGLER_TOML="${WRANGLER_TOML:-$ROOT/workers/api/wrangler.toml}"

: "${D1_DATABASE_ID:?D1_DATABASE_ID is required. Run 'wrangler d1 create rugspull' and copy the database_id.}"

DB_NAME="${DB_NAME:-rugspull}"
R2_BUCKET="${R2_BUCKET:-rugspull-metadata}"
WORKER_RPC_URLS="${WORKER_RPC_URLS:-}"

case "$D1_DATABASE_ID" in
  local-dev | "" )
    echo "D1_DATABASE_ID must be a real remote D1 database id, not '$D1_DATABASE_ID'." >&2
    exit 1
    ;;
esac

node --input-type=module - "$WRANGLER_TOML" "$DB_NAME" "$D1_DATABASE_ID" "$R2_BUCKET" "$WORKER_RPC_URLS" <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const [file, dbName, dbId, bucket, rpcUrls] = process.argv.slice(2);
let text = readFileSync(file, "utf8");

function replaceLine(key, value) {
  const pattern = new RegExp(`^(${key}\\s*=\\s*)".*"$`, "m");
  if (!pattern.test(text)) throw new Error(`Missing ${key} in ${file}`);
  text = text.replace(pattern, `$1"${value}"`);
}

function upsertLineAfter(anchorKey, key, value) {
  const pattern = new RegExp(`^(${key}\\s*=\\s*)".*"$`, "m");
  if (pattern.test(text)) {
    text = text.replace(pattern, `$1"${value}"`);
    return;
  }
  const anchorPattern = new RegExp(`^${anchorKey}\\s*=\\s*".*"$`, "m");
  if (!anchorPattern.test(text)) throw new Error(`Missing ${anchorKey} in ${file}`);
  text = text.replace(anchorPattern, (line) => `${line}\n${key} = "${value}"`);
}

replaceLine("database_name", dbName);
replaceLine("database_id", dbId);
replaceLine("bucket_name", bucket);
if (rpcUrls) upsertLineAfter("FACTORY_SOURCES", "RPC_URLS", rpcUrls);

writeFileSync(file, text);
NODE

echo "Updated workers/api/wrangler.toml Cloudflare bindings."
