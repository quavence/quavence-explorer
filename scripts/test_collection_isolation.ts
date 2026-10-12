/**
 * Automated Verification Suite: Multi-Collection Namespace Isolation & Composite Key Invariants
 * 
 * Verifies:
 * 1. Cross-Collection Address Isolation: Address profile queries preserve glyphs even when multiple collections share edition numbers
 * 2. Cross-Collection Catalog Isolation: Catalog entries are keyed on composite (glyph_hash, edition) without history swallowing
 * 3. Detail Route State Isolation: Historical event queries strictly bound to canonical glyph_hash
 * 4. Batched AI Attestations: Multiple QVAI attestations in one transaction preserved under (txid, vout_index)
 */
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getGlyphsCatalog, getGlyphDetail } from '../src/services/glyphService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('================================================================');
  console.log('=== QUAVENCE EXPLORER: COLLECTION ISOLATION & BATCHED SUITE ===');
  console.log('================================================================\n');

  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const schemaPath = path.resolve(__dirname, '../src/db/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await db.exec(schema);

  const results: Array<[string, boolean, string]> = [];
  const check = (name: string, pass: boolean, note: string) => {
    results.push([name, pass, note]);
    console.log(`${pass ? '  PASS' : '  FAIL'}  ${name}\n        ${note}`);
  };

  const ALICE = 'S_ALICE_ADDRESS';
  const BOB = 'S_BOB_ADDRESS';
  const HASH_COLLECTION_A = '11'.repeat(32);
  const HASH_COLLECTION_B = '22'.repeat(32);

  // Seed blocks
  await db.run("INSERT INTO blocks (height, hash, previous_hash, time, tx_count, size) VALUES (100, 'b100', 'b99', 1700000000, 1, 500)");
  await db.run("INSERT INTO blocks (height, hash, previous_hash, time, tx_count, size) VALUES (101, 'b101', 'b100', 1700000060, 1, 500)");

  // =====================================================================
  console.log('[1] Cross-Collection Address Isolation (Anti-Shadowing)');

  // Alice mints Collection A, Edition #1 at height 100
  await db.run(`
    INSERT INTO glyphs (
      txid, op_vout, block_hash, block_height, block_time,
      glyph_hash, edition, op_type, op_label,
      carrier_address, carrier_vout, rarity, name
    ) VALUES (
      'tx_alice_colA', 1, 'b100', 100, 1700000000,
      ?, 1, 1, 'CLAIM',
      ?, 0, 'Legendary', 'Collection A Genesis'
    )
  `, HASH_COLLECTION_A, ALICE);
  await db.run("INSERT INTO utxos (txid, vout_index, address, amount, block_height) VALUES ('tx_alice_colA', 0, ?, 10000, 100)", ALICE);

  // Bob mints Collection B, Edition #1 at height 101 (higher block height)
  await db.run(`
    INSERT INTO glyphs (
      txid, op_vout, block_hash, block_height, block_time,
      glyph_hash, edition, op_type, op_label,
      carrier_address, carrier_vout, rarity, name
    ) VALUES (
      'tx_bob_colB', 1, 'b101', 101, 1700000060,
      ?, 1, 1, 'CLAIM',
      ?, 0, 'Rare', 'Collection B Genesis'
    )
  `, HASH_COLLECTION_B, BOB);
  await db.run("INSERT INTO utxos (txid, vout_index, address, amount, block_height) VALUES ('tx_bob_colB', 0, ?, 10000, 101)", BOB);

  // Address query emulation from src/api/routes/address.ts
  const addressQuery = `
    SELECT g.*, u.amount as carrier_amount, u.block_height as utxo_block_height
    FROM glyphs g
    JOIN utxos u ON g.txid = u.txid AND g.carrier_vout = u.vout_index
    WHERE u.address = ?
      AND g.op_label != 'BURN'
      AND g.rowid = (
        SELECT g2.rowid FROM glyphs g2
        WHERE g2.glyph_hash = g.glyph_hash AND g2.edition = g.edition
        ORDER BY g2.block_height DESC, g2.rowid DESC
        LIMIT 1
      )
    ORDER BY g.block_height DESC
  `;

  const aliceHeld = await db.all(addressQuery, ALICE);
  check('Alice retains Edition #1 in Collection A after Bob mints Edition #1 in Collection B',
    aliceHeld.length === 1 && aliceHeld[0].glyph_hash === HASH_COLLECTION_A,
    aliceHeld.length === 1 ? 'ok - zero shadowing across collections' : `FAILED: Alice sees ${aliceHeld.length} glyphs`);

  const bobHeld = await db.all(addressQuery, BOB);
  check('Bob independently holds Edition #1 in Collection B',
    bobHeld.length === 1 && bobHeld[0].glyph_hash === HASH_COLLECTION_B,
    bobHeld.length === 1 ? 'ok - independent collection holding' : `FAILED: Bob sees ${bobHeld.length} glyphs`);

  // =====================================================================
  console.log('\n[2] Cross-Collection Catalog Namespace Isolation');

  const catalog = await getGlyphsCatalog({ limit: 10 }, db);
  check('catalog returns both collections sharing Edition #1 as distinct entries',
    catalog.pagination.total === 2 && catalog.items.length === 2,
    `total=${catalog.pagination.total}, items=${catalog.items.length}`);

  const colAItem = catalog.items.find((g: any) => g.glyphHash === HASH_COLLECTION_A);
  const colBItem = catalog.items.find((g: any) => g.glyphHash === HASH_COLLECTION_B);
  check('both collection items exist independently with historyCount = 1',
    Boolean(colAItem && colBItem && colAItem.historyCount === 1 && colBItem.historyCount === 1),
    `colA history=${colAItem?.historyCount}, colB history=${colBItem?.historyCount}`);

  // =====================================================================
  console.log('\n[3] Detail Route State & History Isolation');

  const detailA = await getGlyphDetail(HASH_COLLECTION_A, db);
  check('getGlyphDetail for Collection A returns clean isolated state',
    Boolean(detailA && detailA.glyphHash === HASH_COLLECTION_A && detailA.history.every((h: any) => h.glyph_hash === undefined || h.txid === 'tx_alice_colA')),
    detailA ? `history length=${detailA.history.length}` : 'null');

  const detailB = await getGlyphDetail(HASH_COLLECTION_B, db);
  check('getGlyphDetail for Collection B returns clean isolated state',
    Boolean(detailB && detailB.glyphHash === HASH_COLLECTION_B && detailB.history.every((h: any) => h.glyph_hash === undefined || h.txid === 'tx_bob_colB')),
    detailB ? `history length=${detailB.history.length}` : 'null');

  // =====================================================================
  console.log('\n[4] Batched AI Attestations (Compound Key txid, vout_index)');

  const batchAttestTxid = 'batch_ai_attest_tx';
  await db.run(`
    INSERT INTO ai_attestations (
      txid, vout_index, block_hash, block_height, block_time, consensus_hash,
      task_type, task_type_code, worker_count, agreement_ratio, ref_block_height
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(txid, vout_index) DO UPDATE SET block_hash = excluded.block_hash
  `, batchAttestTxid, 0, 'b101', 101, 1700000060, 'cons_hash_1', 'TASK_EMBEDDING', 11, 4, 1.0, 100);

  await db.run(`
    INSERT INTO ai_attestations (
      txid, vout_index, block_hash, block_height, block_time, consensus_hash,
      task_type, task_type_code, worker_count, agreement_ratio, ref_block_height
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(txid, vout_index) DO UPDATE SET block_hash = excluded.block_hash
  `, batchAttestTxid, 2, 'b101', 101, 1700000060, 'cons_hash_2', 'TASK_EXTERNAL_INFERENCE', 10, 5, 0.95, 100);

  const attestRows = await db.all('SELECT txid, vout_index, task_type FROM ai_attestations WHERE txid = ? ORDER BY vout_index ASC', batchAttestTxid);
  check('multiple AI attestations in one transaction preserved under compound key (txid, vout_index)',
    attestRows.length === 2 && attestRows[0].vout_index === 0 && attestRows[1].vout_index === 2,
    `stored rows=${attestRows.length}`);

  // =====================================================================
  const failed = results.filter(([, p]) => !p);
  console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length) {
    console.log('\nFAILURES:');
    for (const [n, , note] of failed) console.log(`  - ${n}: ${note}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
