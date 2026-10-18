/**
 * Automated Verification Suite for PoUS AI Glyph Rarity Filter & Search
 * 
 * Verifies:
 * 1. DB schema migration (rarity, name, theme, archetype columns and index)
 * 2. Exact match filtering for all rarity tiers ('legendary', 'epic', 'rare', 'common')
 * 3. Prevention of regression: Edition <= 10 is NOT falsely forced to Legendary
 * 4. Prevention of regression: 'epic' filter returns matching items, not empty
 * 5. Search filtering by edition, glyph name, and holder address
 */
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
process.env.DAO_API_URL = 'none';
import { getGlyphsCatalog } from '../src/services/glyphService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runRarityFilterTests() {
  console.log('================================================================');
  console.log('=== QUAVENCE EXPLORER: GLYPH RARITY FILTER VERIFICATION     ===');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      if (detail) console.error(`       Detail: ${detail}`);
      failed++;
    }
  }

  // Setup temporary in-memory database with production schema
  const db = await open({
    filename: ':memory:',
    driver: sqlite3.Database,
  });

  const schemaPath = path.resolve(__dirname, '../src/db/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await db.exec(schema);

  // --------------------------------------------------------------------------
  // TEST 1: Schema Migration & Columns Check
  // --------------------------------------------------------------------------
  console.log('--- 1. Testing Schema Migration & Metadata Columns ---');
  const columns = await db.all('PRAGMA table_info(glyphs)') as Array<{ name: string }>;
  const colNames = new Set(columns.map(c => c.name));

  assert(colNames.has('rarity'), 'glyphs table contains rarity column');
  assert(colNames.has('name'), 'glyphs table contains name column');
  assert(colNames.has('theme'), 'glyphs table contains theme column');
  assert(colNames.has('archetype'), 'glyphs table contains archetype column');

  const indexes = await db.all("PRAGMA index_list(glyphs)") as Array<{ name: string }>;
  const indexNames = new Set(indexes.map(i => i.name));
  assert(indexNames.has('idx_glyphs_rarity'), 'glyphs table has idx_glyphs_rarity index');

  // --------------------------------------------------------------------------
  // TEST 2: Seed Test Glyphs with Known Rarity Tiers
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Seeding Multi-Tier Glyph Dataset ---');
  const testGlyphs = [
    { edition: 1, hash: '11'.repeat(32), rarity: 'Legendary', name: 'Genesis Matrix', holder: 's1_alice' },
    { edition: 2, hash: '22'.repeat(32), rarity: 'Epic', name: 'Quantum Core', holder: 's1_bob' },
    { edition: 3, hash: '33'.repeat(32), rarity: 'Rare', name: 'Cyber Sentinel', holder: 's1_charlie' },
    { edition: 4, hash: '44'.repeat(32), rarity: 'Common', name: 'Solar Relay', holder: 's1_david' },
    { edition: 10, hash: 'aa'.repeat(32), rarity: 'Rare', name: 'Neural Pulse', holder: 's1_eve' },
  ];

  for (const g of testGlyphs) {
    await db.run(`
      INSERT INTO glyphs (
        txid, block_hash, block_height, block_time, glyph_hash,
        edition, op_type, op_label, carrier_address, carrier_vout,
        rarity, name, theme, archetype
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      `tx_mint_${g.edition}`, 'blk_100', 100 + g.edition, 1700000000 + g.edition,
      g.hash, g.edition, 1, 'CLAIM', g.holder, 0,
      g.rarity, g.name, 'Genesis Matrix', 'PoUS L1 Consensus'
    );
  }

  // --------------------------------------------------------------------------
  // TEST 3: Rarity Filtering Verification (Real getGlyphsCatalog Service)
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Testing Rarity Filtering via Production getGlyphsCatalog ---');

  // A. Filter 'epic'
  const { items: epicItems } = await getGlyphsCatalog({ rarity: 'epic' }, db as any);
  assert(epicItems.length === 1, 'Filter "epic" returns exactly 1 item', `Expected 1, got ${epicItems.length}`);
  assert(epicItems[0]?.edition === 2, 'Filter "epic" returns Edition #2 (Quantum Core)');
  assert(epicItems[0]?.rarity === 'Epic', 'Item rarity matches "Epic"');

  // B. Filter 'legendary'
  const { items: legendaryItems } = await getGlyphsCatalog({ rarity: 'legendary' }, db as any);
  assert(legendaryItems.length === 1, 'Filter "legendary" returns exactly 1 item (Edition #1)');
  assert(legendaryItems[0]?.edition === 1, 'Filter "legendary" returns Edition #1');
  assert(
    !legendaryItems.some(i => i.edition === 4 || i.edition === 10),
    'Edition #4 (Common) and Edition #10 (Rare) are NOT in "legendary" filter'
  );

  // C. Filter 'rare'
  const { items: rareItems } = await getGlyphsCatalog({ rarity: 'rare' }, db as any);
  assert(rareItems.length === 2, 'Filter "rare" returns exactly 2 items (Edition #3 and #10)');
  assert(
    rareItems.some(i => i.edition === 3) && rareItems.some(i => i.edition === 10),
    'Filter "rare" correctly includes Edition #3 and #10'
  );

  // D. Filter 'common'
  const { items: commonItems } = await getGlyphsCatalog({ rarity: 'common' }, db as any);
  assert(commonItems.length === 1, 'Filter "common" returns exactly 1 item (Edition #4)');
  assert(commonItems[0]?.edition === 4, 'Filter "common" correctly returns Edition #4');

  // E. Filter 'all'
  const { items: allItems } = await getGlyphsCatalog({ rarity: 'all' }, db as any);
  assert(allItems.length === 5, 'Filter "all" returns all 5 seed items');

  // --------------------------------------------------------------------------
  // TEST 4: Search Filtering Verification (Real getGlyphsCatalog Service)
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Testing Search Filtering via Production getGlyphsCatalog ---');

  // A. Search by name
  const { items: nameSearch } = await getGlyphsCatalog({ search: 'quantum' }, db as any);
  assert(nameSearch.length === 1 && nameSearch[0]?.edition === 2, 'Search by name "quantum" finds Edition #2');

  // B. Search by edition #
  const { items: edSearch } = await getGlyphsCatalog({ search: '#10' }, db as any);
  assert(edSearch.length === 1 && edSearch[0]?.edition === 10, 'Search by edition "#10" finds Edition #10');

  // C. Search by holder address
  const { items: holderSearch } = await getGlyphsCatalog({ search: 's1_david' }, db as any);
  assert(holderSearch.length === 1 && holderSearch[0]?.edition === 4, 'Search by holder address finds Edition #4');

  // D. Combined search and rarity filter
  const { items: combined } = await getGlyphsCatalog({ rarity: 'rare', search: 'cyber' }, db as any);
  assert(combined.length === 1 && combined[0]?.edition === 3, 'Combined search "cyber" + rarity "rare" finds Edition #3');

  const { items: combinedMiss } = await getGlyphsCatalog({ rarity: 'epic', search: 'cyber' }, db as any);
  assert(combinedMiss.length === 0, 'Combined search "cyber" + rarity "epic" returns 0 (no false positives)');

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`=== RARITY FILTER VERIFICATION: ${passed} PASSED, ${failed} FAILED ===`);
  console.log('================================================================');

  await db.close();

  if (failed > 0) {
    process.exit(1);
  }
}

runRarityFilterTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
