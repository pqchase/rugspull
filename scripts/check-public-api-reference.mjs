import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [web, worker, sitemap, openapi, integration, apis, llms] = await Promise.all([
  readFile(new URL("apps/web/src/main.tsx", root), "utf8"),
  readFile(new URL("workers/api/src/index.ts", root), "utf8"),
  readFile(new URL("apps/web/public/sitemap.xml", root), "utf8"),
  readFile(new URL("apps/web/public/openapi.json", root), "utf8").then(JSON.parse),
  readFile(new URL("apps/web/public/integration.json", root), "utf8").then(JSON.parse),
  readFile(new URL("apps/web/public/apis.json", root), "utf8").then(JSON.parse),
  readFile(new URL("apps/web/public/llms.txt", root), "utf8"),
]);

for (const phrase of [
  '"/api-reference": "Read API reference"',
  "READ THE CACHE. VERIFY THE CHAIN.",
  "Nine public GET endpoints",
  "No execution surface",
  "No numeric rate limit or uptime SLA",
  "Independent audit remains pending",
  "organized new mainnet activity remains NO-GO",
  'href="/openapi.json"',
  'href="/rugspull-read.postman_collection.json"',
  'href="/.well-known/apis.json"',
  'href="/.well-known/api-onboarding"',
  'href="/.well-known/api-catalog"',
]) assert(web.includes(phrase), `API Reference source is missing: ${phrase}`);

assert(worker.includes('"/api-reference": "Read API reference"'), "Worker route registry is missing API Reference.");
assert(worker.includes('title: "Read API Reference | Rugspull"'), "Worker SSR metadata is missing API Reference.");
assert(sitemap.includes("<loc>https://rugspull.com/api-reference</loc>"), "Sitemap is missing API Reference.");
assert(openapi.externalDocs?.url === "https://rugspull.com/api-reference", "OpenAPI externalDocs must use API Reference.");
assert(openapi["x-rugspull-resources"]?.apiReference === "https://rugspull.com/api-reference", "OpenAPI resource map is missing API Reference.");
assert(integration.source?.apiReference === "https://rugspull.com/api-reference", "Integration package is missing API Reference.");
assert(apis.apis?.[0]?.humanURL === "https://rugspull.com/api-reference", "APIs.json humanURL must use API Reference.");
assert(llms.includes("[Human-readable Read API reference](https://rugspull.com/api-reference)"), "llms.txt is missing API Reference.");

const gets = Object.values(openapi.paths ?? {}).filter((item) => item.get).length;
assert(gets === 9, `API Reference claim requires nine OpenAPI GET operations, found ${gets}.`);
assert(!Object.values(openapi.paths ?? {}).some((item) => Object.keys(item).some((method) => ["post", "put", "patch", "delete"].includes(method))), "API Reference must remain read-only.");

console.log("Public API Reference healthy: route, SSR metadata, 9 GET-only operations, discovery resources, and risk boundaries aligned");

function assert(condition, message) { if (!condition) throw new Error(message); }
