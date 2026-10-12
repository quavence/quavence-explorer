/**
 * Zero-Mock Automated Verification Suite for PoUS Glyph Service & Lineage
 * 
 * Verifies:
 * 1. Zero-Mock in-memory SQLite database indexing of CLAIM, STATE_SYNC and BURN transactions
 * 2. Direct integration with getGlyphsCatalog & getGlyphDetail from src/services/glyphService.ts
 * 3. Strict enforcement of H-2: Burned glyph returns carrierAddress: null, carrierAmount: 0, carrierVout: 0
 * 4. Strict enforcement of M-2: rarity='synced'|'sync' and search='synced'|'sync'|'epoch' correctly matches synced glyphs
 * 5. Strict prohibition of Tamagotchi statuses: values must only be 'ACTIVE' or 'BURNED', never 'AWAKE' or 'HIBERNATED'
 * 6. Full parity between catalog getGlyphsCatalog and detail getGlyphDetail responses
 */
import assert from 'node:assert/strict';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getGlyphsCatalog, getGlyphDetail } from '../src/services/glyphService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runZeroMockStatusTests() {
  console.log('================================================================');
  console.log('=== QUAVENCE EXPLORER: ZERO-MOCK GLYPH STATUS VERIFICATION   ===');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function runTest(name: string, fn: () => void | Promise<void>) {
    try {
      const res = fn();
      if (res && typeof (res as any).then === 'function') {
        return (res as Promise<void>).then(() => {
          console.log(`[PASS] ${name}`);
          passed++;
        }).catch((err: any) => {
          console.error(`[FAIL] ${name}`);
          console.error(err?.message || err);
          failed++;
        });
      }
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}`);
      console.error(err?.message || err);
      failed++;
    }
  }

  // 1. Initialize in-memory SQLite with production schema
  const db = await open({
    filename: ':memory:',
    driver: sqlite3.Database,
  });

  const schemaPath = path.resolve(__dirname, '../src/db/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await db.exec(schema);

  console.log('--- 1. Seeding Genuine L1 Transactions (CLAIM, STATE_SYNC, BURN) ---');

  // Insert mock blocks
  await db.run(`INSERT INTO blocks (height, hash, previous_hash, time, tx_count, size) VALUES (100, 'b100', 'b99', 1700000000, 1, 500)`);
  await db.run(`INSERT INTO blocks (height, hash, previous_hash, time, tx_count, size) VALUES (101, 'b101', 'b100', 1700000060, 1, 500)`);
  await db.run(`INSERT INTO blocks (height, hash, previous_hash, time, tx_count, size) VALUES (102, 'b102', 'b101', 1700000120, 1, 500)`);
  await db.run(`INSERT INTO blocks (height, hash, previous_hash, time, tx_count, size) VALUES (103, 'b103', 'b102', 1700000180, 1, 500)`);

  // Glyph #1: Active Synced Living Agent
  // 1.1 CLAIM at block 100
  const txClaim1 = 'tx_claim_edition_1';
  await db.run(`
    INSERT INTO glyphs (
      txid, block_hash, block_height, block_time,
      glyph_hash, edition, op_type, op_label,
      carrier_address, carrier_vout, rarity, name
    ) VALUES (
      ?, 'b100', 100, 1700000000,
      'hash_ed_1', 1, 1, 'CLAIM',
      's1_alice_address', 1, 'Legendary', 'Cyber Prime'
    )
  `, txClaim1);
  await db.run(`
    INSERT INTO utxos (txid, vout_index, address, amount, block_height)
    VALUES (?, 1, 's1_alice_address', 10000, 100)
  `, txClaim1);

  // 1.2 STATE_SYNC at block 101
  const txSync1 = 'tx_sync_edition_1';
  await db.run(`
    INSERT INTO glyphs (
      txid, block_hash, block_height, block_time,
      glyph_hash, edition, op_type, op_label,
      carrier_address, carrier_vout, state_root_hash, cycle_count
    ) VALUES (
      ?, 'b101', 101, 1700000060,
      'hash_ed_1', 1, 5, 'STATE_SYNC',
      's1_alice_address', 1, '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 1
    )
  `, txSync1);
  await db.run(`DELETE FROM utxos WHERE txid = ? AND vout_index = 1`, txClaim1);
  await db.run(`
    INSERT INTO utxos (txid, vout_index, address, amount, block_height)
    VALUES (?, 1, 's1_alice_address', 10000, 101)
  `, txSync1);

  // Glyph #2: Burned Glyph
  // 2.1 CLAIM at block 102
  const txClaim2 = 'tx_claim_edition_2';
  await db.run(`
    INSERT INTO glyphs (
      txid, block_hash, block_height, block_time,
      glyph_hash, edition, op_type, op_label,
      carrier_address, carrier_vout, rarity, name
    ) VALUES (
      ?, 'b102', 102, 1700000120,
      'hash_ed_2', 2, 1, 'CLAIM',
      's1_bob_address', 1, 'Rare', 'Quantum Ember'
    )
  `, txClaim2);
  await db.run(`
    INSERT INTO utxos (txid, vout_index, address, amount, block_height)
    VALUES (?, 1, 's1_bob_address', 10000, 102)
  `, txClaim2);

  // 2.2 BURN at block 103 (Carrier spent without unspent UTXO creation)
  const txBurn2 = 'tx_burn_edition_2';
  await db.run(`
    INSERT INTO glyphs (
      txid, block_hash, block_height, block_time,
      glyph_hash, edition, op_type, op_label,
      carrier_address, carrier_vout
    ) VALUES (
      ?, 'b103', 103, 1700000180,
      'hash_ed_2', 2, 4, 'BURN',
      's1_bob_address', 0
    )
  `, txBurn2);
  await db.run(`DELETE FROM utxos WHERE txid = ? AND vout_index = 1`, txClaim2);

  console.log('\n--- 2. Executing Service Layer getGlyphsCatalog ---');

  const catalog = await getGlyphsCatalog({ limit: 100 }, db);
  const activeItem = catalog.items.find(i => i.edition === 1)!;
  const burnedItem = catalog.items.find(i => i.edition === 2)!;

  console.log('\n--- 3. Testing H-2: Carrier UTXO & Address Eradication for Burned Glyphs ---');

  runTest('Active glyph #1 maintains valid carrierAddress', () => {
    assert.equal(activeItem.status, 'ACTIVE');
    assert.equal(activeItem.isBurned, false);
    assert.equal(activeItem.carrierAddress, 's1_alice_address');
    assert.equal(activeItem.carrierAmount, 10000);
    assert.equal(activeItem.carrierVout, 1);
  });

  runTest('H-2 Regression Guard: Burned glyph #2 zeroes carrierAddress (strictly null)', () => {
    assert.equal(burnedItem.status, 'BURNED');
    assert.equal(burnedItem.isBurned, true);
    assert.equal(burnedItem.carrierAddress, null);
  });

  runTest('H-2 Regression Guard: Burned glyph #2 zeroes carrierAmount (strictly 0 sat)', () => {
    assert.equal(burnedItem.carrierAmount, 0);
  });

  runTest('H-2 Regression Guard: Burned glyph #2 zeroes carrierVout (strictly 0)', () => {
    assert.equal(burnedItem.carrierVout, 0);
  });

  console.log('\n--- 4. Testing Strict Prohibition of Tamagotchi Terms in API Output ---');

  runTest('API status values strictly omit AWAKE and HIBERNATED', () => {
    for (const item of catalog.items) {
      assert.notEqual(item.status, 'AWAKE');
      assert.notEqual(item.status, 'HIBERNATED');
      assert.notEqual(item.agent_status, 'AWAKE');
      assert.notEqual(item.agent_status, 'HIBERNATED');
      assert.ok(item.status === 'ACTIVE' || item.status === 'BURNED');
    }
  });

  console.log('\n--- 5. Testing M-2: Synced / Sync / Epoch Filter & Search Aliases ---');

  await runTest('M-2: rarityFilter="synced" successfully returns synced glyph #1', async () => {
    const res = await getGlyphsCatalog({ rarity: 'synced' }, db);
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].edition, 1);
  });

  await runTest('M-2: rarityFilter="sync" successfully returns synced glyph #1', async () => {
    const res = await getGlyphsCatalog({ rarity: 'sync' }, db);
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].edition, 1);
  });

  await runTest('M-2: search="synced" finds synced glyph #1', async () => {
    const res = await getGlyphsCatalog({ search: 'synced' }, db);
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].edition, 1);
  });

  await runTest('M-2: search="epoch" finds synced glyph #1', async () => {
    const res = await getGlyphsCatalog({ search: 'epoch' }, db);
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].edition, 1);
  });

  await runTest('M-2: search="sync" finds synced glyph #1', async () => {
    const res = await getGlyphsCatalog({ search: 'sync' }, db);
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].edition, 1);
  });

  console.log('\n--- 6. Testing /api/glyphs/:id Endpoint Parity via getGlyphDetail ---');

  const detail2 = await getGlyphDetail(2, db);
  assert.ok(detail2 !== null, 'detail2 should not be null');

  runTest('Single endpoint /api/glyphs/2 returns currentHolder === null', () => {
    assert.equal(detail2!.currentHolder, null);
  });

  runTest('Single endpoint /api/glyphs/2 returns carrierAmount === 0', () => {
    assert.equal(detail2!.carrierAmount, 0);
  });

  runTest('Parity between catalog and detail: carrierAmount matches (0 === 0)', () => {
    assert.equal(burnedItem.carrierAmount, detail2!.carrierAmount);
    assert.equal(burnedItem.carrierAddress, detail2!.currentHolder);
  });

  await db.close();

  console.log('\n================================================================');
  console.log(`=== ZERO-MOCK STATUS VERIFICATION: ${passed} PASSED, ${failed} FAILED ===`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runZeroMockStatusTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
