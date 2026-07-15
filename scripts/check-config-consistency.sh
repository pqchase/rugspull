#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"

node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";

const files = {
  env: readFileSync(".env.example", "utf8"),
  contractsTs: readFileSync("packages/contracts-ts/src/index.ts", "utf8"),
  wrangler: readFileSync("workers/api/wrangler.toml", "utf8"),
  web: readFileSync("apps/web/src/main.tsx", "utf8"),
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

function tomlVar(name) {
  const match = files.wrangler.match(new RegExp(`^${name}\\s*=\\s*"([^"]*)"`, "m"));
  return match?.[1] ?? "";
}

function envVar(name) {
  const match = files.env.match(new RegExp(`^${name}=([^\\n]*)`, "m"));
  return match?.[1]?.trim() ?? "";
}

function deploymentFactory(chainId) {
  const deploymentMatch = files.contractsTs.match(new RegExp(`${chainId}:\\s*{[\\s\\S]*?rugFactory:\\s*"([^"]+)"`));
  return deploymentMatch?.[1] ?? "";
}

function wbnbAddress(chainId) {
  const match = files.contractsTs.match(new RegExp(`${chainId}:\\s*"([^"]+)"`));
  return match?.[1] ?? "";
}

const expectedChainId = "56";
const expectedWbnb = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const deployment = deploymentFactory(expectedChainId);
const wranglerFactory = tomlVar("FACTORY_ADDRESS");
const envFactory = envVar("FACTORY_ADDRESS");
const viteFactory = envVar("VITE_FACTORY_ADDRESS");
const wranglerChainId = tomlVar("CHAIN_ID");
const envChainId = envVar("CHAIN_ID");
const deployBlock = tomlVar("FACTORY_DEPLOY_BLOCK");
const sources = tomlVar("FACTORY_SOURCES");
const envSources = envVar("FACTORY_SOURCES");
const wbnb = wbnbAddress(expectedChainId);

if (!files.web.includes("const CHAIN_ID = 56;")) fail("Frontend CHAIN_ID constant is not 56.");
if (!files.web.includes("VITE_FACTORY_ADDRESS ?? DEPLOYMENTS[56].rugFactory")) {
  fail("Frontend no longer falls back to DEPLOYMENTS[56].rugFactory.");
}
if (!deployment) fail("packages/contracts-ts DEPLOYMENTS[56].rugFactory is missing.");
if (!wranglerFactory) fail("workers/api/wrangler.toml FACTORY_ADDRESS is missing.");
if (!envFactory) fail(".env.example FACTORY_ADDRESS is missing.");
if (!viteFactory) fail(".env.example VITE_FACTORY_ADDRESS is missing.");

const lower = (value) => value.toLowerCase();
if (lower(wranglerFactory) !== lower(deployment)) {
  fail(`wrangler FACTORY_ADDRESS ${wranglerFactory} does not match DEPLOYMENTS[56] ${deployment}.`);
}
if (lower(envFactory) !== lower(deployment)) {
  fail(`.env.example FACTORY_ADDRESS ${envFactory} does not match DEPLOYMENTS[56] ${deployment}.`);
}
if (lower(viteFactory) !== lower(deployment)) {
  fail(`.env.example VITE_FACTORY_ADDRESS ${viteFactory} does not match DEPLOYMENTS[56] ${deployment}.`);
}
if (wranglerChainId !== expectedChainId) fail(`wrangler CHAIN_ID ${wranglerChainId} is not ${expectedChainId}.`);
if (envChainId !== expectedChainId) fail(`.env.example CHAIN_ID ${envChainId} is not ${expectedChainId}.`);
if (lower(wbnb) !== lower(expectedWbnb)) fail(`WBNB_ADDRESSES[56] ${wbnb} is not expected BSC Mainnet WBNB.`);
if (!deployBlock) fail("FACTORY_DEPLOY_BLOCK is missing from wrangler.toml.");
if (!sources.includes(`${wranglerFactory}@${deployBlock}`)) {
  fail("wrangler FACTORY_SOURCES does not include FACTORY_ADDRESS@FACTORY_DEPLOY_BLOCK.");
}
if (envSources !== sources) fail(".env.example FACTORY_SOURCES does not match wrangler.toml.");

console.log("Config consistency check passed.");
NODE
