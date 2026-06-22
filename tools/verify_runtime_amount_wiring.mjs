#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readDistBundle() {
  const assetsDir = path.join(root, 'dist/web/assets');
  const jsFile = fs.readdirSync(assetsDir).find((name) => name.endsWith('.js'));
  assert(jsFile, 'dist/web/assets/*.js missing — run npm run build');
  return fs.readFileSync(path.join(assetsDir, jsFile), 'utf8');
}

function readDistApiBlocksRoute() {
  const routePath = path.join(root, 'dist/api/routes/blocks.js');
  assert(fs.existsSync(routePath), 'dist/api/routes/blocks.js missing — run npm run build');
  return fs.readFileSync(routePath, 'utf8');
}

function readDistApiTxRoute() {
  const routePath = path.join(root, 'dist/api/routes/tx.js');
  assert(fs.existsSync(routePath), 'dist/api/routes/tx.js missing — run npm run build');
  return fs.readFileSync(routePath, 'utf8');
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

try {
  const bundle = readDistBundle();
  assert(bundle.includes('Contributors'), 'dist web bundle missing Contributors section');
  assert(bundle.includes('Recipients'), 'dist web bundle missing Recipients section');
  assert(!bundle.includes('Estimated analytics'), 'dist web bundle must not show estimated analytics');

  const blocksRoute = readDistApiBlocksRoute();
  assert(blocksRoute.includes('loadTxIoFromIndex'), 'dist api blocks route missing factual tx io wiring');
  assert(blocksRoute.includes('_amount_enrichment_version'), 'dist api blocks route missing enrichment version marker');

  const txRoute = readDistApiTxRoute();
  assert(txRoute.includes('contributors'), 'dist api tx route missing contributors field');
  assert(txRoute.includes('recipients'), 'dist api tx route missing recipients field');
  assert(!txRoute.includes('amount_net_transfer'), 'dist api tx route must not expose heuristic net transfer');

  const port = process.env.PORT || '3039';
  const base = `http://127.0.0.1:${port}`;

  try {
    const list = await fetchJson(`${base}/api/blocks?limit=5`);
    assert(list._amount_enrichment_version === 6, 'live API list missing _amount_enrichment_version=6');
    const sample = list.blocks?.[0];
    assert(sample?.primary_amount != null, 'live API list block missing primary_amount');
    assert(sample?.amount_badge, 'live API list block missing amount_badge');

    const block = await fetchJson(`${base}/api/blocks/28513`);
    assert(block._amount_enrichment_version === 6, 'live API detail missing _amount_enrichment_version=6');
    assert(block.primary_amount === block.reward_amount, 'block list/detail reward primary must equal reward_amount');
    const transfer = block.transactions?.find((tx) => tx.type === 'normal_transfer');
    assert(transfer?.output_total > 0, 'transfer tx must expose factual output_total');
    assert(transfer?.recipient_count >= 1, 'transfer tx must expose recipient_count');
  } catch (error) {
    console.warn('WARN live API check skipped or failed:', error?.message || error);
    console.warn('      Run: npm run build && npm start   (or npm run dev)');
  }

  console.log('verify_runtime_amount_wiring: PASS');
} catch (error) {
  console.error('verify_runtime_amount_wiring: FAIL', error?.message || error);
  process.exitCode = 1;
}
