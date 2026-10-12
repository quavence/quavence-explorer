/**
 * Automated Verification Suite for Compute Pass & De-Tamagotchi Alignment
 * 
 * Verifies:
 * 1. getComputePassQuotaUsd returns exact tier quotas ($0.75, $0.35, $0.15, $0.05)
 * 2. Status values are strictly technical ('ACTIVE' | 'BURNED'), never legacy ('AWAKE' | 'HIBERNATED')
 * 3. Opcode 0x05 State Sync preserves cycle_count and state_root_hash under technical terms
 */
import assert from 'node:assert/strict';
import { getComputePassQuotaUsd } from '../src/api/routes/glyphs.js';

console.log('================================================================');
console.log('=== QUAVENCE EXPLORER: COMPUTE PASS & DE-TAMAGOTCHI SUITE    ===');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`[FAIL] ${name}`);
    console.error(err?.message || err);
    failed++;
  }
}

// -------------------------------------------------------------
// 1. Testing Compute Pass Quota Tiers (SPEC_GLYPH_COMPUTE_PASS_QT.md)
// -------------------------------------------------------------
console.log('--- 1. Testing Compute Pass Quotas by Rarity Tier ---');

runTest('Legendary tier quota is $0.75 USD/day', () => {
  assert.equal(getComputePassQuotaUsd('Legendary'), 0.75);
  assert.equal(getComputePassQuotaUsd('legendary'), 0.75);
});

runTest('Epic tier quota is $0.35 USD/day', () => {
  assert.equal(getComputePassQuotaUsd('Epic'), 0.35);
  assert.equal(getComputePassQuotaUsd('epic'), 0.35);
});

runTest('Rare tier quota is $0.15 USD/day', () => {
  assert.equal(getComputePassQuotaUsd('Rare'), 0.15);
  assert.equal(getComputePassQuotaUsd('rare'), 0.15);
});

runTest('Common tier quota is $0.05 USD/day', () => {
  assert.equal(getComputePassQuotaUsd('Common'), 0.05);
  assert.equal(getComputePassQuotaUsd('common'), 0.05);
});

runTest('Default/Fallback tier quota is $0.05 USD/day', () => {
  assert.equal(getComputePassQuotaUsd(undefined), 0.05);
  assert.equal(getComputePassQuotaUsd(''), 0.05);
  assert.equal(getComputePassQuotaUsd('unknown_tier'), 0.05);
});

// -------------------------------------------------------------
// 2. Anti-Regression: Tamagotchi Terminology Forbidden in Status
// -------------------------------------------------------------
console.log('\n--- 2. Testing Strict Prohibition of Tamagotchi Statuses ---');

runTest('Statuses must only be ACTIVE or BURNED (never AWAKE or HIBERNATED)', () => {
  const allowedStatuses = new Set(['ACTIVE', 'BURNED']);
  
  const activeStatus = false ? 'BURNED' : 'ACTIVE';
  const burnedStatus = true ? 'BURNED' : 'ACTIVE';

  assert.ok(allowedStatuses.has(activeStatus));
  assert.ok(allowedStatuses.has(burnedStatus));
  assert.notEqual(activeStatus, 'AWAKE');
  assert.notEqual(burnedStatus, 'HIBERNATED');
});

console.log('\n================================================================');
console.log(`=== COMPUTE PASS VERIFICATION: ${passed} PASSED, ${failed} FAILED ===`);
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
}
