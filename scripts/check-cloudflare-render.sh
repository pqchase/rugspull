#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT/workers/api"
PORT="${PORT:-8792}"
INSPECTOR_PORT="${INSPECTOR_PORT:-9242}"
BASE="http://127.0.0.1:$PORT"
LOG_FILE="${TMPDIR:-/tmp}/rugspull-render-wrangler.log"
STATE_DIR="$ROOT/.wrangler/render-state"
CURL=(curl -fsS --max-time 15)

cd "$ROOT"
npm run build -w @rugspull/web >/dev/null
npm run build -w @rugspull/api >/dev/null
rm -rf "$STATE_DIR"

cd "$API_DIR"
npx wrangler d1 migrations apply rugspull --local --persist-to "$STATE_DIR" >/dev/null

npx wrangler dev --local --port "$PORT" --inspector-port "$INSPECTOR_PORT" --persist-to "$STATE_DIR" >"$LOG_FILE" 2>&1 &
PID=$!
cleanup() {
  kill "$PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

READY=0
for _ in $(seq 1 120); do
  if "${CURL[@]}" "$BASE/api/health" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.5
done
if [ "$READY" -ne 1 ]; then
  echo "Wrangler dev server did not become ready at $BASE" >&2
  tail -n 80 "$LOG_FILE" >&2 || true
  exit 1
fi

cd "$ROOT"
BASE="$BASE" node --input-type=module <<'NODE'
import { chromium } from "playwright";

const base = process.env.BASE;
const routes = [
  { path: "/", text: "WE PUT THE RUG" },
  { path: "/create", text: "HOST YOUR OWN" },
  { path: "/rug/56/not-an-address", text: "BRING A REAL" },
  { path: "/account/0x0000000000000000000000000000000000000001", text: "YOUR SEAT IN" },
  { path: "/docs/risk", text: "READ THIS BEFORE" },
  { path: "/can-the-creator-contribute", text: "ONE ADDRESS IS BLOCKED. IDENTITIES ARE NOT SOLVED" },
  { path: "/can-the-creator-cancel-opening", text: "OPENING HAS NO CANCEL BUTTON" },
  { path: "/what-happens-to-excess-contributions", text: "THE CAP ACCEPTS LESS. CLAIM THE REST" },
  { path: "/ops", text: "BACKSTAGE" },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  for (const route of routes) {
    await page.goto(`${base}${route.path}`, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.getByText(route.text, { exact: false }).first().waitFor({ timeout: 10_000 });
    const rootText = await page.locator("#root").innerText({ timeout: 10_000 });
    if (!rootText.includes(route.text)) {
      throw new Error(`Route ${route.path} did not render expected text "${route.text}".`);
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.getByText("WE PUT THE RUG", { exact: false }).first().waitFor({ timeout: 10_000 });
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  if (hasHorizontalOverflow) {
    throw new Error("Mobile homepage has horizontal overflow.");
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(195, 420);
  await page.mouse.wheel(0, 500);
  await page.waitForFunction(() => window.scrollY > 0, undefined, { timeout: 5_000 });

  const bodyText = await page.locator("body").innerText();
  if (bodyText.includes("Application error") || bodyText.includes("Internal server error")) {
    throw new Error("Rendered app contains an application/server error.");
  }
  if (errors.length > 0) {
    throw new Error(`Browser console/page errors:\n${errors.join("\n")}`);
  }
} finally {
  await browser.close();
}
NODE

echo "Cloudflare render check passed at $BASE"
