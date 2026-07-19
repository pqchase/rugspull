import { readFile } from "node:fs/promises";

const root = await read("../apps/web/public/apis.json");
const wellKnown = await read("../apps/web/public/.well-known/apis.json");
assert(JSON.stringify(root) === JSON.stringify(wellKnown), "Root and well-known APIs.json must mirror.");
assert(root.specificationVersion === "0.21" && root.type === "Index", "APIs.json version/type drifted.");
assert(root.url === "https://rugspull.com/.well-known/apis.json", "Canonical APIs.json URL drifted.");
assert(root.apis?.length === 1, "Expected one public API entry.");
const api = root.apis[0];
assert(api.humanURL === "https://rugspull.com/api-reference", "APIs.json humanURL must link the human-readable API Reference.");
for (const type of ["Documentation", "OpenAPI", "PostmanCollection", "LlmsText", "Security", "GitHubRepository"]) {
  assert(api.properties?.some((entry) => entry.type === type), `Missing APIs.json property ${type}.`);
}
for (const phrase of ["Read-only", "financial truth", "Independent audit is pending", "total loss", "no numeric uptime or rate-limit SLA", "NO-GO"]) {
  assert(root.description.includes(phrase), `APIs.json boundary missing: ${phrase}`);
}
assert(api.description.includes("Nine GET-only") && api.description.includes("no settlement or transaction-proxy"), "API write boundary missing.");
console.log("Public APIs.json healthy: v0.21 well-known mirror; OpenAPI, Postman, docs, LLM, security, and repository linked");

async function read(path) { return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8")); }
function assert(condition, message) { if (!condition) throw new Error(message); }
