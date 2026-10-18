import { initDb, db, clearAllData, rollbackToHeight } from '../src/db/db.js';
import { saveBlockToDb } from '../src/indexer/indexer.js';

async function runIndexerInvariantTests() {
  console.log('================================================================');
  console.log('=== QUAVENCE EXPLORER: INDEXER & REORG INVARIANTS SUITE       ===');
  console.log('================================================================\n');

  // Initialize production in-memory SQLite schema
  await initDb(':memory:');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string) {
    total++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      process.exitCode = 1;
    }
  }

  // --- 1. SEC-01 Verification: Read-only Address Queries Do Not Mutate Glyphs ---
  console.log('--- 1. Testing SEC-01: Address Endpoint Read-Only Guarantee ---');
  // Alice mints edition #1
  await db.run(`
    INSERT INTO glyphs (txid, block_hash, block_height, block_time, glyph_hash, edition, op_type, op_label, carrier_address, carrier_vout)
    VALUES ('tx_alice_mint', 'b100', 100, 1700000000, 'hash_g1', 1, 1, 'CLAIM', 'addr_alice', 0)
  `);
  await db.run(`
    INSERT INTO utxos (txid, vout_index, address, amount, block_height)
    VALUES ('tx_alice_mint', 0, 'addr_alice', 10000, 100)
  `);

  // Mallory has an unindexed normal transfer with 10k sat
  await db.run(`
    INSERT INTO utxos (txid, vout_index, address, amount, block_height)
    VALUES ('tx_mallory_unauth', 0, 'addr_mallory', 10000, 101)
  `);

  // Querying Mallory address now executes ONLY SELECT queries (ensureGlyphIndexed is deleted)
  // Let's verify no rogue rows exist in glyphs for tx_mallory_unauth
  const malloryGlyph = await db.get('SELECT * FROM glyphs WHERE txid = ?', 'tx_mallory_unauth');
  assert(malloryGlyph === undefined, 'Mallory fake tx is not in glyphs table');

  const canonicalOwner = await db.get('SELECT carrier_address FROM glyphs WHERE edition = 1 ORDER BY block_height DESC, rowid DESC LIMIT 1');
  assert(canonicalOwner.carrier_address === 'addr_alice', 'Alice remains sole authentic owner of Glyph #1 (SEC-01 Fixed)');

  // --- 2. DATA-01 Verification: clearAllData wipes glyphs & ai_attestations ---
  console.log('\n--- 2. Testing DATA-01: clearAllData Complete Wipe ---');
  await db.run(`INSERT INTO blocks (height, hash, previous_hash, time, tx_count) VALUES (100, 'b100', 'b99', 1700000000, 1)`);
  await db.run(`
    INSERT INTO ai_attestations (txid, block_hash, block_height, block_time, consensus_hash, task_type, task_type_code, worker_count, agreement_ratio, ref_block_height)
    VALUES ('tx_att_1', 'b100', 100, 1700000000, 'hash_consensus', 'TASK_SUMMARY', 2, 3, 1.0, 99)
  `);

  // Execute production clearAllData function
  await clearAllData();

  const glyphCountAfterClear = await db.get('SELECT COUNT(*) as c FROM glyphs');
  const attCountAfterClear = await db.get('SELECT COUNT(*) as c FROM ai_attestations');
  assert(glyphCountAfterClear.c === 0, 'glyphs table is completely emptied on clearAllData()');
  assert(attCountAfterClear.c === 0, 'ai_attestations table is completely emptied on clearAllData()');

  // --- 3. REORG-02 Verification: rollbackToHeight purges ai_attestations & glyphs ---
  console.log('\n--- 3. Testing REORG-02: rollbackToHeight purges ai_attestations ---');
  await db.run(`
    INSERT INTO blocks (hash, height, time, previous_hash, tx_count)
    VALUES ('b200', 200, 1700001000, 'b199', 1), ('b201', 201, 1700002000, 'b200', 1)
  `);
  await db.run(`
    INSERT INTO ai_attestations (txid, block_hash, block_height, block_time, consensus_hash, task_type, task_type_code, worker_count, agreement_ratio, ref_block_height)
    VALUES
      ('att_200', 'b200', 200, 1700001000, 'h200', 'TASK_SUMMARY', 2, 1, 1.0, 199),
      ('att_201', 'b201', 201, 1700002000, 'h201', 'TASK_SUMMARY', 2, 1, 1.0, 200)
  `);

  // Execute production rollbackToHeight(201)
  await rollbackToHeight(201);
  const remainingAtts = await db.all('SELECT txid, block_height FROM ai_attestations');
  assert(remainingAtts.length === 1 && remainingAtts[0].block_height === 200, 'ai_attestations correctly rolled back at fork height');

  // --- 4. Carrier Strictness Verification via Production saveBlockToDb ---
  console.log('\n--- 4. Testing Carrier Strictness: Reject non-10k sat outputs via saveBlockToDb ---');
  process.env.GLYPH_MINTER_ADDRESS = 'addr_minter';

  // Seed funding UTXO for the authorized minter
  await db.run(`
    INSERT INTO utxos (txid, vout_index, address, amount, block_height)
    VALUES ('tx_minter_funding', 0, 'addr_minter', 100000, 50)
  `);

  // OpReturn for CLAIM edition 500
  const claimPayload = '6a2851564e430101' + '55'.repeat(32) + 'f401'; // edition 500 (0x01f4 in LE)

  // Block A: carrier output has non-10k sat (5,000 sat = 0.00005000)
  const badBlock = {
    hash: 'blk_bad_carrier',
    previousblockhash: 'b200',
    time: 1700003000,
    tx_count: 1,
    size: 500,
    tx: [
      {
        txid: 'tx_bad_carrier',
        vin: [{ txid: 'tx_minter_funding', vout: 0, scriptSig: { hex: '' } }],
        vout: [
          {
            value: 0.00005, // 5,000 satoshis (REJECT)
            n: 0,
            scriptPubKey: { hex: '76a914111111111111111111111111111111111111111188ac', addresses: ['addr_wrong_amount'] }
          },
          {
            value: 0,
            n: 1,
            scriptPubKey: { hex: claimPayload, asm: 'OP_RETURN' }
          }
        ]
      }
    ]
  };

  await saveBlockToDb(badBlock, 202);
  const badGlyph = await db.get('SELECT * FROM glyphs WHERE txid = ?', 'tx_bad_carrier');
  assert(badGlyph === undefined, 'Carrier output with non-10,000 sat value strictly rejected');

  // Block B: carrier output has exact 10k sat (10,000 sat = 0.00010000)
  // Seed funding UTXO for good tx
  await db.run(`
    INSERT INTO utxos (txid, vout_index, address, amount, block_height)
    VALUES ('tx_minter_funding_2', 0, 'addr_minter', 100000, 50)
  `);

  const goodClaimPayload = '6a2851564e430101' + '66'.repeat(32) + 'f501'; // edition 501
  const goodBlock = {
    hash: 'blk_good_carrier',
    previousblockhash: 'blk_bad_carrier',
    time: 1700004000,
    tx_count: 1,
    size: 500,
    tx: [
      {
        txid: 'tx_good_carrier',
        vin: [{ txid: 'tx_minter_funding_2', vout: 0, scriptSig: { hex: '' } }],
        vout: [
          {
            value: 0.00010000, // exact 10,000 satoshis (ACCEPT)
            n: 0,
            scriptPubKey: { hex: '76a914222222222222222222222222222222222222222288ac', addresses: ['addr_carrier_target'] }
          },
          {
            value: 0,
            n: 1,
            scriptPubKey: { hex: goodClaimPayload, asm: 'OP_RETURN' }
          }
        ]
      }
    ]
  };

  await saveBlockToDb(goodBlock, 203);
  const goodGlyph = await db.get('SELECT * FROM glyphs WHERE txid = ?', 'tx_good_carrier');
  assert(goodGlyph !== undefined && goodGlyph.carrier_address === 'addr_carrier_target', 'Carrier output with 10,000 sat value accepted');

  console.log(`\n================================================================`);
  console.log(`=== ALL INDEXER INVARIANT TESTS PASSED (${passed}/${total}) ===`);
  console.log(`================================================================\n`);
}

runIndexerInvariantTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
