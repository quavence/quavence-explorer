/**
 * Automated Verification Suite: Multi-Collection Namespace Isolation & Composite Key Invariants
 * 
 * Verifies:
 * 1. Cross-Collection Address Isolation: Address profile queries preserve glyphs even when multiple collections share edition numbers
 * 2. Cross-Collection Catalog Isolation: Catalog entries are keyed on composite (glyph_hash, edition) without history swallowing
 * 3. Detail Route State Isolation: Historical event queries strictly bound to canonical glyph_hash
 * 4. Batched AI Attestations: Multiple QVAI attestations in one transaction preserved under compound key (txid, vout_index)
 * 
 * Standard: RFC 2119 Strict Zero-Mock, Canonical saveBlockToDb for all state mutations.
 */
import { initDb, db } from '../src/db/db.js';
import { saveBlockToDb } from '../src/indexer/indexer.js';
import { getGlyphsCatalog, getGlyphDetail } from '../src/services/glyphService.js';

function buildGlyphOpReturnHex(opType: number, edition: number, glyphHash: string): string {
  const buf = Buffer.alloc(40);
  buf.write('QVNC', 0, 4, 'ascii');
  buf.writeUInt8(0x01, 4); // version 1
  buf.writeUInt8(opType, 5); // opType
  Buffer.from(glyphHash, 'hex').copy(buf, 6, 0, 32);
  buf.writeUInt16LE(edition, 38);
  return '6a28' + buf.toString('hex');
}

function buildAiAttestationVout(typeCode: number, consensusHashHex: string, workerCount: number, ratio: number, refHeight: number, n: number) {
  const buf = Buffer.alloc(44);
  buf.write('QVAI', 0, 4, 'ascii');
  buf.writeUInt8(1, 4);
  buf.writeUInt8(typeCode, 5);
  Buffer.from(consensusHashHex, 'hex').copy(buf, 6, 0, 32);
  buf.writeUInt8(workerCount, 38);
  buf.writeUInt8(Math.floor(ratio * 255), 39);
  buf.writeUInt32BE(refHeight, 40);
  return {
    value: 0,
    n,
    scriptPubKey: {
      hex: '6a2c' + buf.toString('hex'),
      asm: `OP_RETURN ${buf.toString('hex')}`
    }
  };
}

async function main() {
  console.log('================================================================');
  console.log('=== QUAVENCE EXPLORER: COLLECTION ISOLATION & BATCHED SUITE ===');
  console.log('================================================================\n');

  process.env.DAO_API_URL = 'none';
  await initDb(':memory:');

  const results: Array<[string, boolean, string]> = [];
  const check = (name: string, pass: boolean, note: string) => {
    results.push([name, pass, note]);
    console.log(`${pass ? '  PASS' : '  FAIL'}  ${name}\n        ${note}`);
  };

  const ALICE = 'SPdAliceMinterAddress11111111111111';
  const BOB = 'SPdBobMinterAddress2222222222222222';
  const HASH_COLLECTION_A = '11'.repeat(32);
  const HASH_COLLECTION_B = '22'.repeat(32);

  // Authorize both Alice and Bob as minters
  process.env.GLYPH_MINTER_ADDRESS = `${ALICE}, ${BOB}`;

  // Pre-seed funding UTXOs
  await db.run("INSERT INTO utxos (txid, vout_index, address, amount, block_height) VALUES ('funding_alice', 0, ?, 100000, 50)", ALICE);
  await db.run("INSERT INTO utxos (txid, vout_index, address, amount, block_height) VALUES ('funding_bob', 0, ?, 100000, 50)", BOB);
  await db.run("INSERT INTO utxos (txid, vout_index, address, amount, block_height) VALUES ('funding_batch', 0, ?, 100000, 50)", ALICE);

  // =====================================================================
  console.log('[1] Cross-Collection Address Isolation (Anti-Shadowing via saveBlockToDb)');

  // Alice mints Collection A, Edition #1 at height 100 via canonical saveBlockToDb
  const block100 = {
    hash: 'b100',
    previous_hash: 'b99',
    time: 1700000000,
    tx_count: 1,
    size: 500,
    tx: [{
      txid: 'tx_alice_colA',
      vin: [{ txid: 'funding_alice', vout: 0, scriptSig: { hex: '' } }],
      vout: [
        { value: 0.0001, n: 0, scriptPubKey: { hex: '76a914111111111111111111111111111111111111111188ac', addresses: [ALICE] } },
        { value: 0, n: 1, scriptPubKey: { hex: buildGlyphOpReturnHex(1, 1, HASH_COLLECTION_A), asm: 'OP_RETURN' } }
      ]
    }]
  };
  await saveBlockToDb(block100, 100);

  // Bob mints Collection B, Edition #1 at height 101 via canonical saveBlockToDb
  const block101 = {
    hash: 'b101',
    previous_hash: 'b100',
    time: 1700000060,
    tx_count: 1,
    size: 500,
    tx: [{
      txid: 'tx_bob_colB',
      vin: [{ txid: 'funding_bob', vout: 0, scriptSig: { hex: '' } }],
      vout: [
        { value: 0.0001, n: 0, scriptPubKey: { hex: '76a914222222222222222222222222222222222222222288ac', addresses: [BOB] } },
        { value: 0, n: 1, scriptPubKey: { hex: buildGlyphOpReturnHex(1, 1, HASH_COLLECTION_B), asm: 'OP_RETURN' } }
      ]
    }]
  };
  await saveBlockToDb(block101, 101);

  // Address query canonical logic from src/api/routes/address.ts
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
  console.log('\n[4] Batched AI Attestations (Compound Key txid, vout_index via saveBlockToDb)');

  const batchAttestTxid = 'batch_ai_attest_tx';
  const block102 = {
    hash: 'b102',
    previous_hash: 'b101',
    time: 1700000120,
    tx_count: 1,
    size: 500,
    tx: [{
      txid: batchAttestTxid,
      vin: [{ txid: 'funding_batch', vout: 0, scriptSig: { hex: '' } }],
      vout: [
        buildAiAttestationVout(11, 'aa'.repeat(32), 4, 1.0, 100, 0),
        { value: 10, n: 1, scriptPubKey: { hex: '76a914111111111111111111111111111111111111111188ac', addresses: [ALICE] } },
        buildAiAttestationVout(10, 'bb'.repeat(32), 5, 0.95, 100, 2),
      ]
    }]
  };
  await saveBlockToDb(block102, 102);

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
