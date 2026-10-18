/**
 * Zero-Mock Automated Verification Suite for PoUS Glyph Service & Lineage
 * 
 * Verifies:
 * 1. Zero-Mock in-memory SQLite database indexing of CLAIM, STATE_SYNC and BURN transactions
 * 2. Direct integration with getGlyphsCatalog & getGlyphDetail from src/services/glyphService.ts
 * 3. Strict enforcement of Carrier zeroing: Burned glyph returns carrierAddress: null, carrierAmount: 0, carrierVout: 0
 * 4. Strict enforcement of Synced filter aliases: rarity='synced'|'sync' and search='synced'|'sync'|'epoch' correctly matches synced glyphs
 * 5. Strict prohibition of Tamagotchi statuses: values must only be 'ACTIVE' or 'BURNED', never 'AWAKE' or 'HIBERNATED'
 * 6. Full parity between catalog getGlyphsCatalog and detail getGlyphDetail responses
 */
import assert from 'node:assert/strict';
import express from 'express';
import { getGlyphsCatalog, getGlyphDetail, glyphMetadataCache } from '../src/services/glyphService.js';
import { initDb, db } from '../src/db/db.js';
import supplyRouter from '../src/api/routes/supply.js';
import statusRouter from '../src/api/routes/status.js';
import richlistRouter from '../src/api/routes/richlist.js';

async function runZeroMockStatusTests() {
  console.log('================================================================');
  console.log('=== QUAVENCE EXPLORER: ZERO-MOCK GLYPH STATUS VERIFICATION   ===');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  async function runTest(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}`);
      console.error(err?.message || err);
      failed++;
    }
  }

  // 1. Initialize in-memory SQLite with production schema
  await initDb(':memory:');

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

  console.log('\n--- 3. Testing Carrier UTXO & Address Eradication for Burned Glyphs ---');

  runTest('Active glyph #1 maintains valid carrierAddress', () => {
    assert.equal(activeItem.status, 'ACTIVE');
    assert.equal(activeItem.isBurned, false);
    assert.equal(activeItem.carrierAddress, 's1_alice_address');
    assert.equal(activeItem.carrierAmount, 10000);
    assert.equal(activeItem.carrierVout, 1);
  });

  runTest('Regression Guard: Burned glyph #2 zeroes carrierAddress (strictly null)', () => {
    assert.equal(burnedItem.status, 'BURNED');
    assert.equal(burnedItem.isBurned, true);
    assert.equal(burnedItem.carrierAddress, null);
  });

  runTest('Regression Guard: Burned glyph #2 zeroes carrierAmount (strictly 0 sat)', () => {
    assert.equal(burnedItem.carrierAmount, 0);
  });

  runTest('Regression Guard: Burned glyph #2 zeroes carrierVout (strictly 0)', () => {
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

  console.log('\n--- 5. Testing Synced / Sync / Epoch Filter & Search Aliases ---');

  await runTest('rarityFilter="synced" successfully returns synced glyph #1', async () => {
    const res = await getGlyphsCatalog({ rarity: 'synced' }, db);
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].edition, 1);
  });

  await runTest('rarityFilter="sync" successfully returns synced glyph #1', async () => {
    const res = await getGlyphsCatalog({ rarity: 'sync' }, db);
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].edition, 1);
  });

  await runTest('search="synced" finds synced glyph #1', async () => {
    const res = await getGlyphsCatalog({ search: 'synced' }, db);
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].edition, 1);
  });

  await runTest('search="epoch" finds synced glyph #1', async () => {
    const res = await getGlyphsCatalog({ search: 'epoch' }, db);
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].edition, 1);
  });

  await runTest('search="sync" finds synced glyph #1', async () => {
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

  console.log('\n--- 7. Testing Cold-Cache Rarity & Name Integrity Guard ---');

  // Seed edition 7860 in db
  await db.run(`
    INSERT INTO glyphs (
      txid, block_hash, block_height, block_time,
      glyph_hash, edition, op_type, op_label,
      carrier_address, carrier_vout
    ) VALUES (
      'tx_legendary_7860', 'b104', 104, 1700000200,
      'hash_ed_7860', 7860, 1, 'CLAIM',
      's1_legendary_holder', 0
    )
  `);

  glyphMetadataCache.clear();

  const coldCatalog = await getGlyphsCatalog({ limit: 100 }, db);
  const coldItem = coldCatalog.items.find((i: any) => i.edition === 7860)!;

  runTest('Cold cache catalog authoritative DAO artifact priority (Legendary, not Common fallback)', () => {
    assert.ok(coldItem, 'coldItem should exist');
    assert.equal(coldItem.rarity, 'Legendary');
  });

  runTest('Cold cache catalog cleans edition suffix from DAO artifact name', () => {
    assert.equal(coldItem.name, 'Quavence Genesis Solar');
    assert.equal(coldItem.fullName, 'Quavence Genesis Solar #7860');
  });

  console.log('\n--- 8. Testing Cross-Collection Metadata Isolation (Zero Edition-Based Poisoning) ---');

  // Seed two distinct collections that share edition #99
  const hashAlpha = '0xalpha_collection_hash_99';
  const hashBeta = '0xbeta_collection_hash_99';

  await db.run(`
    INSERT INTO glyphs (
      txid, block_hash, block_height, block_time,
      glyph_hash, edition, op_type, op_label,
      carrier_address, carrier_vout, rarity, name
    ) VALUES (
      'tx_alpha_99', 'b104', 104, 1700000210,
      ?, 99, 1, 'CLAIM',
      's1_alpha_holder', 0, 'Mythic', 'Alpha Prime'
    )
  `, hashAlpha);

  await db.run(`
    INSERT INTO glyphs (
      txid, block_hash, block_height, block_time,
      glyph_hash, edition, op_type, op_label,
      carrier_address, carrier_vout, rarity, name
    ) VALUES (
      'tx_beta_99', 'b104', 104, 1700000210,
      ?, 99, 1, 'CLAIM',
      's1_beta_holder', 0, 'Common', 'Beta Core'
    )
  `, hashBeta);

  // Cache artifact keyed EXCLUSIVELY by hashAlpha
  glyphMetadataCache.set(hashAlpha, {
    name: 'Alpha Overlord #99',
    rarity: 'Legendary',
    theme: 'Cybernetic',
    archetype: 'Supreme AI',
  });

  const multiCatalog = await getGlyphsCatalog({ limit: 100 }, db);
  const alphaItem = multiCatalog.items.find((i: any) => i.glyphHash === hashAlpha)!;
  const betaItem = multiCatalog.items.find((i: any) => i.glyphHash === hashBeta)!;

  runTest('Alpha collection item enriches with Alpha metadata from cache', () => {
    assert.ok(alphaItem, 'alphaItem should exist');
    assert.equal(alphaItem.name, 'Alpha Overlord');
    assert.equal(alphaItem.rarity, 'Legendary');
  });

  runTest('Beta collection sharing edition #99 is NOT poisoned by Alpha metadata', () => {
    assert.ok(betaItem, 'betaItem should exist');
    assert.notEqual(betaItem.name, 'Alpha Overlord', 'Beta must not adopt Alpha name');
    assert.notEqual(betaItem.rarity, 'Legendary', 'Beta must not adopt Alpha rarity');
  });

  runTest('Edition number is NEVER cached as a metadata key', () => {
    assert.equal(glyphMetadataCache.has('99'), false, 'Edition 99 must not exist in metadata cache');
  });

  console.log('\n--- 9. Testing Real HTTP Endpoint Fail-Closed On Desynchronized / Empty UTXO Set ---');

  const app = express();
  app.use(express.json());
  app.use('/api/supply', supplyRouter);
  app.use('/api/status', statusRouter);
  app.use('/api/richlist', richlistRouter);

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // 9.1 Test Fail-Closed when height > 0 but UTXO set is empty / desynchronized
  await db.run('DELETE FROM utxos');

  await runTest('Real HTTP /api/supply returns 503 Fail-Closed on empty UTXO set', async () => {
    const res = await fetch(`${baseUrl}/api/supply`);
    assert.equal(res.status, 503, 'Must return HTTP 503 Service Unavailable');
    const data: any = await res.json();
    assert.equal(data.status, 'UTXO_UNAVAILABLE');
    assert.equal(data.error, 'UTXO set unindexed or desynchronized');
    assert.equal(data.circulating, 0);
  });

  await runTest('Real HTTP /api/richlist returns 503 Fail-Closed on empty UTXO set', async () => {
    const res = await fetch(`${baseUrl}/api/richlist`);
    assert.equal(res.status, 503, 'Must return HTTP 503 Service Unavailable');
    const data: any = await res.json();
    assert.equal(data.status, 'UTXO_UNAVAILABLE');
    assert.equal(data.error, 'UTXO set unindexed or desynchronized');
    assert.equal(data.items.length, 0);
  });

  await runTest('Real HTTP /api/status flags UTXO_UNAVAILABLE without synthetic supply calculation', async () => {
    const res = await fetch(`${baseUrl}/api/status`);
    assert.equal(res.status, 200);
    const data: any = await res.json();
    assert.equal(data.supply.status, 'UTXO_UNAVAILABLE');
    assert.equal(data.supply.circulating, null);
  });

  // 9.2 Test Healthy Synchronized State when UTXO set is populated
  await db.run(`
    INSERT INTO utxos (txid, vout_index, address, amount, block_height)
    VALUES ('tx_live_utxo_1', 0, 's1_alice_address', 5000000000, 104)
  `);

  await runTest('Real HTTP /api/supply returns 200 with strictly verified UTXO sum', async () => {
    const res = await fetch(`${baseUrl}/api/supply`);
    assert.equal(res.status, 200);
    const data: any = await res.json();
    assert.equal(data.circulating, 5000000000);
    assert.equal(data.circulatingFormatted, '50.00000000');
  });

  await runTest('Real HTTP /api/richlist returns 200 with verified balances from UTXO set', async () => {
    const res = await fetch(`${baseUrl}/api/richlist`);
    assert.equal(res.status, 200);
    const data: any = await res.json();
    assert.equal(data.total, 1);
    assert.equal(data.items[0].address, 's1_alice_address');
    assert.equal(data.items[0].balance, 5000000000);
  });

  await runTest('Real HTTP /api/status reports SYNCHRONIZED status with real circulating supply', async () => {
    const res = await fetch(`${baseUrl}/api/status`);
    assert.equal(res.status, 200);
    const data: any = await res.json();
    assert.equal(data.supply.status, 'SYNCHRONIZED');
    assert.equal(data.supply.circulating, 5000000000);
  });

  await new Promise<void>((resolve) => server.close(() => resolve()));
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
