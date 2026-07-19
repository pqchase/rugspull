import { readFile } from "node:fs/promises";

const value = JSON.parse(await readFile(new URL("../apps/web/public/openapi.json", import.meta.url), "utf8"));
const operations = Object.entries(value.paths ?? {}).flatMap(([path, item]) =>
  Object.entries(item).filter(([method]) => method === "get").map(([, operation]) => ({ path, operation })),
);

assert(value.openapi === "3.1.0", "OpenAPI version drifted.");
assert(value.servers?.[0]?.url === "https://rugspull.com", "Canonical OpenAPI server drifted.");
assert(value.info?.contact?.email === "info@rugspull.com", "Public OpenAPI contact email drifted.");
assert(value.info?.contact?.url === "https://rugspull.com/security-model", "Public OpenAPI contact URL drifted.");
assert(operations.length === 9, `Expected nine GET operations, found ${operations.length}.`);
assert(operations.every(({ operation }) => typeof operation.operationId === "string"), "Every GET operation needs an operationId.");
assert(!Object.values(value.paths).some((item) => Object.keys(item).some((method) => ["post", "put", "patch", "delete"].includes(method))), "Public OpenAPI must remain read-only.");
for (const path of ["/api/health", "/api/config", "/api/indexer/status", "/api/rugs", "/api/rugs/{chainId}/{rug}", "/api/rugs/{chainId}/{rug}/events", "/api/rugs/{chainId}/{rug}/market", "/api/market/sparklines", "/api/r2/{key}"]) {
  assert(value.paths[path]?.get, `Missing GET ${path}.`);
}
for (const phrase of ["financial truth", "does not buy, sell, rug, claim, refund", "No numeric rate-limit or uptime SLA", "Independent audit is pending", "total loss", "does not claim third-party integration"]) {
  assert(value.info.description.includes(phrase), `OpenAPI boundary missing: ${phrase}`);
}
assert(value["x-rugspull-boundaries"]?.transactionExecution === false, "Transaction execution boundary drifted.");
assert(value["x-rugspull-boundaries"]?.organizedMainnetPromotion === "NO-GO", "Mainnet gate boundary drifted.");
assert(value["x-rugspull-boundaries"]?.thirdPartyIntegrationClaimed === false, "Integration-claim boundary drifted.");
assert(value["x-rugspull-resources"]?.postmanCollection === "https://rugspull.com/rugspull-read.postman_collection.json", "OpenAPI must link the public Postman Collection.");
assert(value.externalDocs?.url === "https://rugspull.com/api-reference", "OpenAPI externalDocs must link the human-readable API Reference.");

console.log(`Public OpenAPI healthy: ${operations.length} GET operations; no write operations; financial-truth and NO-GO boundaries present`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
