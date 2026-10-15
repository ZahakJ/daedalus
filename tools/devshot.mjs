#!/usr/bin/env node
/**
 * Screenshot one route against a dev server, no build needed.
 *
 *   node tools/devshot.mjs --port 5711 --route '#/bureau/first-flight' --out bureau [--seed seed.json]
 *
 * --seed: JSON file of localStorage key→value pairs injected before load.
 * Prints console errors; exits 0 always (iteration tool, not a gate).
 */
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const port = Number(arg('port', '5711'));
const route = arg('route', '#/campaign');
const out = arg('out', 'devshot');
const seedFile = arg('seed', null);

const server = spawn('npx', ['vite', '--port', String(port)], { cwd: ROOT, stdio: 'pipe', detached: true });
try {
  const deadline = Date.now() + 30000;
  let up = false;
  while (Date.now() < deadline && !up) {
    try {
      await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(800) });
      up = true;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  if (!up) throw new Error('dev server did not come up');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (m) => {
    if (m.type() === 'error') console.error('[console.error]', m.text().slice(0, 400));
  });
  page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 400)));
  if (seedFile) {
    const seed = JSON.parse(readFileSync(seedFile, 'utf8'));
    await page.addInitScript((kv) => {
      for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v);
    }, seed);
  }
  await page.goto(`http://localhost:${port}/${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  mkdirSync(join(ROOT, 'screenshots'), { recursive: true });
  const path = join(ROOT, 'screenshots', `dev-${out}.png`);
  await page.screenshot({ path });
  console.log(`→ screenshots/dev-${out}.png`);
  await browser.close();
} catch (err) {
  console.error('devshot failed:', err.message);
} finally {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {}
}
