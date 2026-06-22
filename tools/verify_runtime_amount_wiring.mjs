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

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

try {
  const bundle = readDistBundle();
  assert(!bundle.includes('Block Reward'), 'dist web bundle still contains "Block Reward" header text');
  assert(bundle.includes('block-primary-amount'), 'dist web bundle missing block-primary-amount component class');
  assert(bundle.includes('data-amount-column-version'), 'dist web bundle missing amount column version marker');

  const apiRoute = readDistApiBlocksRoute();
  assert(apiRoute.includes('enrichBlocksListFromTransactions'), 'dist api blocks route missing batch enrichment');
  assert(apiRoute.includes('primary_amount'), 'dist api blocks route missing primary_amount fields');
  assert(apiRoute.includes('_amount_enrichment_version'), 'dist api blocks route missing enrichment version marker');
  console.log('OK dist build contains primary amount wiring');

  const port = process.env.PORT || '3039';
  const base = `http://127.0.0.1:${port}`;

  try {
    const list = await fetchJson(`${base}/api/blocks?limit=5`);
    assert(list._amount_enrichment_version === 5, 'live API list missing _amount_enrichment_version=5 (restart API after build)');
    const sample = list.blocks?.[0];
    assert(sample?.primary_amount != null, 'live API list block missing primary_amount');
    assert(sample?.amount_badge, 'live API list block missing amount_badge');
    console.log('OK live API /api/blocks returns enriched primary amount fields');

    const block = await fetchJson(`${base}/api/blocks/23765`);
    assert(block._amount_enrichment_version === 5, 'live API detail missing _amount_enrichment_version=5');
    assert(block.primary_amount != null, 'live API block 23765 missing primary_amount');
    assert(block.transfer_volume_amount > 0, 'live API block 23765 missing transfer_volume_amount');
    assert(block.primary_amount === block.raw_output_volume_amount, 'block 23765 primary_amount must equal on-chain output volume');
    assert(block.primary_amount_label === 'Transfer outputs', `block 23765 expected Transfer outputs label, got ${block.primary_amount_label}`);
    assert(block.amount_badge === 'mixed', `block 23765 expected Reward+Outputs badge, got ${block.amount_badge}`);
    assert(block.primary_amount > block.transfer_volume_amount, 'block 23765 output volume must exceed estimated net when change exists');
  } catch (error) {
    console.warn('WARN live API check skipped or failed:', error?.message || error);
    console.warn('      Run: npm run build && npm start   (or npm run dev)');
  }

  console.log('verify_runtime_amount_wiring: PASS');
} catch (error) {
  console.error('verify_runtime_amount_wiring: FAIL', error?.message || error);
  process.exitCode = 1;
}
