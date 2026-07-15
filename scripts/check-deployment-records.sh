#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"

node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";

const mainnet = JSON.parse(readFileSync("deployments/bsc-mainnet.json", "utf8"));
const testnet = JSON.parse(readFileSync("deployments/bsc-testnet.json", "utf8"));
const e2e = JSON.parse(readFileSync("deployments/bsc-testnet-e2e.json", "utf8"));
const contractsTs = readFileSync("packages/contracts-ts/src/index.ts", "utf8");
const wrangler = readFileSync("workers/api/wrangler.toml", "utf8");
const envExample = readFileSync(".env.example", "utf8");
const e2eScript = readFileSync("scripts/check-bsc-testnet-e2e.sh", "utf8");
const verifyDryRunScript = readFileSync("scripts/check-bsc-verification-dry-run.sh", "utf8");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function tomlVar(name) {
  const match = wrangler.match(new RegExp(`^${name}\\s*=\\s*"([^"]*)"`, "m"));
  return match?.[1] ?? "";
}

function envVar(name) {
  const match = envExample.match(new RegExp(`^${name}=([^\\n]*)`, "m"));
  return match?.[1]?.trim() ?? "";
}

function includesAddress(source, address, label) {
  if (!source.toLowerCase().includes(address.toLowerCase())) fail(`${label} does not include ${address}.`);
}

function requireAddress(value, label) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value ?? "")) fail(`${label} is not an address: ${value}`);
}

function requireTx(value, label) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(value ?? "")) fail(`${label} is not a transaction hash: ${value}`);
}

if (mainnet.chainId !== 56) fail("deployments/bsc-mainnet.json chainId must be 56.");
if (testnet.chainId !== 97) fail("deployments/bsc-testnet.json chainId must be 97.");
if (e2e.chainId !== 97) fail("deployments/bsc-testnet-e2e.json chainId must be 97.");
requireAddress(mainnet.factory, "mainnet factory");
requireAddress(mainnet.deployer, "mainnet deployer");
requireAddress(mainnet.owner, "mainnet owner");
requireAddress(mainnet.protocolTreasury, "mainnet protocol treasury");
requireAddress(mainnet.wbnb, "mainnet WBNB");
requireTx(mainnet.txHash, "mainnet txHash");
if (!Number.isInteger(mainnet.deployBlock) || mainnet.deployBlock <= 0) {
  fail("mainnet deployBlock must be a positive integer.");
}
if (mainnet.sourceVerification?.status !== "exact_match") {
  fail("mainnet source verification must be exact_match.");
}
if (mainnet.sourceVerification?.bscScanMirror?.status !== "exact_match") {
  fail("mainnet BscScan mirror verification must be exact_match.");
}
if (mainnet.openOperationalGates?.includes("BscScan mirror source verification")) {
  fail("completed BscScan verification must not remain an open operational gate.");
}
if (mainnet.postDeployChecks?.mainnetForkE2E !== "passed") {
  fail("mainnet fork E2E must be recorded as passed.");
}
requireTx(e2e.factoryTxHash, "e2e factoryTxHash");
if (!Number.isInteger(e2e.factoryDeployBlock) || e2e.factoryDeployBlock <= 0) {
  fail("e2e factoryDeployBlock must be a positive integer.");
}

for (const [key, value] of Object.entries({
  shortDurationFactory: e2e.shortDurationFactory,
  failedPathRug: e2e.failedPathRug,
  successfulPathRug: e2e.successfulPathRug,
  successfulPathToken: e2e.successfulPathToken,
  successfulPathPool: e2e.successfulPathPool,
})) {
  requireAddress(value, `e2e ${key}`);
}

if (e2e.status?.failedPathRug !== "Failed") fail("E2E failedPathRug status must be Failed.");
if (e2e.status?.successfulPathRug !== "Rugged") fail("E2E successfulPathRug status must be Rugged.");
if (e2e.status?.founderRemaining !== "0") fail("E2E founderRemaining must be 0.");

includesAddress(contractsTs, mainnet.factory, "packages/contracts-ts/src/index.ts");
includesAddress(contractsTs, mainnet.wbnb, "packages/contracts-ts/src/index.ts");
includesAddress(contractsTs, testnet.factory, "packages/contracts-ts/src/index.ts");
includesAddress(contractsTs, testnet.wbnb, "packages/contracts-ts/src/index.ts");
if (tomlVar("FACTORY_ADDRESS").toLowerCase() !== mainnet.factory.toLowerCase()) {
  fail("wrangler FACTORY_ADDRESS does not match deployments/bsc-mainnet.json.");
}
if (envVar("FACTORY_ADDRESS").toLowerCase() !== mainnet.factory.toLowerCase()) {
  fail(".env.example FACTORY_ADDRESS does not match deployments/bsc-mainnet.json.");
}
if (envVar("VITE_FACTORY_ADDRESS").toLowerCase() !== mainnet.factory.toLowerCase()) {
  fail(".env.example VITE_FACTORY_ADDRESS does not match deployments/bsc-mainnet.json.");
}
if (envVar("WBNB").toLowerCase() !== mainnet.wbnb.toLowerCase()) {
  fail(".env.example WBNB does not match deployments/bsc-mainnet.json.");
}

const sources = tomlVar("FACTORY_SOURCES").toLowerCase();
if (!sources.includes(`${mainnet.factory.toLowerCase()}@${mainnet.deployBlock}`)) {
  fail("wrangler FACTORY_SOURCES does not include mainnet factory and deploy block.");
}

for (const [source, label, fields] of [
  [e2eScript, "scripts/check-bsc-testnet-e2e.sh", ["shortDurationFactory", "failedPathRug", "successfulPathRug", "successfulPathToken", "successfulPathPool"]],
  [verifyDryRunScript, "scripts/check-bsc-verification-dry-run.sh", ["shortDurationFactory", "successfulPathRug", "successfulPathToken", "successfulPathPool"]],
]) {
  if (!source.includes("deployments/bsc-testnet-e2e.json")) {
    fail(`${label} does not read deployments/bsc-testnet-e2e.json.`);
  }
  for (const field of fields) {
    if (!source.includes(field)) fail(`${label} does not read deployment field ${field}.`);
  }
}

console.log("Deployment records consistency check passed.");
NODE
