import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(root, "apps/web/public");
const sitemapPath = join(publicDir, "sitemap.xml");
const endpoint = process.env.INDEXNOW_ENDPOINT ?? "https://api.indexnow.org/indexnow";

const keyFile = readdirSync(publicDir).find((name) => {
  if (!/^[A-Za-z0-9-]{8,128}\.txt$/.test(name)) return false;
  const key = basename(name, ".txt");
  return readFileSync(join(publicDir, name), "utf8").trim() === key;
});

if (!keyFile) throw new Error("No valid IndexNow key file exists in apps/web/public.");

const key = basename(keyFile, ".txt");
const sitemap = readFileSync(sitemapPath, "utf8");
const sitemapUrls = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]))];
if (sitemapUrls.length === 0) throw new Error("The sitemap contains no URLs to submit.");
const machineReadableUrls = [
  "/.well-known/security.txt",
  "/security.txt",
  "/llms.txt",
  "/feed.xml",
  "/integration.json",
  "/openapi.json",
  "/rugspull-read.postman_collection.json",
  "/apis.json",
  "/.well-known/apis.json",
  "/.well-known/api-onboarding",
  "/.well-known/api-catalog",
  "/abi/RugFactory.json",
  "/abi/RugInstance.json",
  "/abi/RugPool.json",
  "/abi/RugToken.json",
].map((path) => new URL(path, sitemapUrls[0]).href);
const urlList = [...new Set([...sitemapUrls, ...machineReadableUrls])];

if (urlList.length > 10_000) throw new Error("IndexNow accepts at most 10,000 URLs per request.");

const host = new URL(urlList[0]).host;
if (urlList.some((url) => new URL(url).host !== host)) {
  throw new Error("Every submitted URL must use the same host.");
}

const payload = {
  host,
  key,
  keyLocation: `https://${host}/${keyFile}`,
  urlList,
};

if (process.env.INDEXNOW_DRY_RUN === "1") {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const response = await fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify(payload),
});
const body = await response.text();

if (![200, 202].includes(response.status)) {
  throw new Error(`IndexNow returned HTTP ${response.status}${body ? `: ${body}` : ""}`);
}

console.log(`IndexNow accepted ${urlList.length} URL(s) with HTTP ${response.status} (${sitemapUrls.length} sitemap + ${machineReadableUrls.length} machine-readable).`);
console.log(`Key location: ${payload.keyLocation}`);
