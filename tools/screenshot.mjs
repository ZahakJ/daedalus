#!/usr/bin/env node
/**
 * Smoke test: build (unless --no-build), serve `vite preview` on :6701, load
 * every route in headless Chromium, wait for body[data-app-ready="1"], fail on
 * console errors, save screenshots/<route>.png.
 *
 *   node tools/screenshot.mjs [--no-build]
 */
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 6701;
const ROUTES = [
  ['campaign', '#/campaign'],
  ['bureau', '#/bureau/karman-line'],
  ['frr', '#/frr/karman-line'],
  ['flight', '#/flight/karman-line'],
  ['debrief', '#/debrief/karman-line'],
  ['handbook', '#/handbook/tsiolkovsky'],
  ['museum', '#/museum'],
];

const noBuild = process.argv.includes('--no-build');

if (await portHeld(PORT)) {
  console.error(`FAIL — port :${PORT} already in use; kill the stale server first`);
  process.exit(1);
}
if (!noBuild) {
  console.log('building…');
  execSync('pnpm build', { cwd: ROOT, stdio: 'pipe' });
}
mkdirSync(join(ROOT, 'screenshots'), { recursive: true });

const server = spawn('pnpm', ['preview'], { cwd: ROOT, stdio: 'pipe', detached: true });
let failed = false;
try {
  await waitForPort(PORT, 20000);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  // Seed localStorage (completed mission + committed flight) so every route
  // renders real state instead of bouncing off the route guards.
  const seedPath = join(ROOT, 'tools', 'smoke-seed.json');
  if (existsSync(seedPath)) {
    const seed = JSON.parse(readFileSync(seedPath, 'utf8'));
    await page.addInitScript((kv) => {
      for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v);
    }, seed);
  }
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));

  for (const [name, hash] of ROUTES) {
    await page.goto(`http://localhost:${PORT}/${hash}`, { waitUntil: 'domcontentloaded' });
    try {
      await page.waitForSelector('body[data-app-ready="1"]', { timeout: 30000 });
    } catch {
      errors.push(`[${name}] timed out waiting for body[data-app-ready="1"]`);
    }
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(ROOT, 'screenshots', `${name}.png`) });
    console.log(`[${name}] → screenshots/${name}.png`);
  }
  await browser.close();
  if (errors.length > 0) {
    failed = true;
    console.error(`FAIL — ${errors.length} console error(s):`);
    for (const e of errors.slice(0, 10)) console.error(`    ${e.slice(0, 300)}`);
  } else {
    console.log('OK — all routes clean');
  }
} catch (err) {
  failed = true;
  console.error(`FAIL — ${err.message}`);
} finally {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {}
}
process.exit(failed ? 1 : 0);

async function portHeld(port) {
  try {
    await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(700) });
    return true;
  } catch {
    return false;
  }
}

async function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1000) });
      if (res.ok || res.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`preview server on :${port} did not come up`);
}
