#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"

forge build --quiet

node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync("packages/contracts-ts/src/abi.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const abiModule = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const contracts = [
  {
    name: "RugFactory",
    artifact: "out/RugFactory.sol/RugFactory.json",
    exportedAbi: abiModule.rugFactoryAbi,
  },
  {
    name: "RugInstance",
    artifact: "out/RugInstance.sol/RugInstance.json",
    exportedAbi: abiModule.rugInstanceAbi,
  },
  {
    name: "RugPool",
    artifact: "out/RugPool.sol/RugPool.json",
    exportedAbi: abiModule.rugPoolAbi,
  },
];

const publicAbis = ["RugFactory", "RugInstance", "RugPool", "RugToken"];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function canonicalType(parameter) {
  if (!parameter.type.startsWith("tuple")) return parameter.type;
  const suffix = parameter.type.slice("tuple".length);
  const components = parameter.components ?? [];
  return `(${components.map(canonicalType).join(",")})${suffix}`;
}

function abiKey(entry) {
  if (entry.type === "function") {
    const inputs = (entry.inputs ?? []).map(canonicalType).join(",");
    const outputs = (entry.outputs ?? []).map(canonicalType).join(",");
    return `function ${entry.name}(${inputs}) returns (${outputs}) ${entry.stateMutability}`;
  }
  if (entry.type === "event") {
    const inputs = (entry.inputs ?? [])
      .map((input) => `${input.indexed ? "indexed " : ""}${canonicalType(input)}`)
      .join(",");
    return `event ${entry.name}(${inputs})`;
  }
  return null;
}

for (const contract of contracts) {
  const artifact = JSON.parse(readFileSync(contract.artifact, "utf8"));
  const artifactKeys = new Set(artifact.abi.map(abiKey).filter(Boolean));
  const exportedKeys = contract.exportedAbi.map(abiKey).filter(Boolean);
  if (exportedKeys.length === 0) fail(`${contract.name} exported ABI is empty.`);
  const missing = exportedKeys.filter((key) => !artifactKeys.has(key));
  if (missing.length > 0) {
    fail(`${contract.name} exported ABI has entries not present in compiled artifact:\n${missing.join("\n")}`);
  }
}

for (const name of publicAbis) {
  const artifact = JSON.parse(readFileSync(`out/${name}.sol/${name}.json`, "utf8"));
  const published = JSON.parse(readFileSync(`apps/web/public/abi/${name}.json`, "utf8"));
  if (JSON.stringify(published) !== JSON.stringify(artifact.abi)) {
    fail(`${name} public ABI does not exactly match the compiled artifact.`);
  }
}

console.log("ABI consistency check passed.");
NODE
