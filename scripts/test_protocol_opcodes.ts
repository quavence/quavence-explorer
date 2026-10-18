/**
 * Protocol Opcode Decoding & Lineage Automated Verification Suite
 * 
 * Tests for:
 * 1. Protocol opcode matching (BURN=0x04 vs GENESIS=0x02 vs CLAIM=0x01 vs TRANSFER=0x03)
 * 2. carrierVout preservation in Explorer API (/api/glyphs) & Lineage matching
 */
import { initDb, db } from '../src/db/db.js';
import { saveBlockToDb } from '../src/indexer/indexer.js';
import { getGlyphsCatalog, getGlyphDetail } from '../src/services/glyphService.js';
import { parseGlyphFromVout } from '../src/indexer/parser.js';

process.env.DAO_API_URL = 'none';

// Canonical Protocol Opcodes (from vault txBuilder.ts & marketTxBuilder.js)
const PROTOCOL_OPS = {
  MINT: 0x01,
  GENESIS: 0x02,
  TRANSFER: 0x03,
  BURN: 0x04,
} as const;

function buildTestGlyphScriptHex(opType: number, edition: number, glyphHashHex: string): string {
  const buf = Buffer.alloc(40);
  buf.write('QVNC', 0, 4, 'ascii');
  buf.writeUInt8(0x01, 4); // version 1
  buf.writeUInt8(opType, 5); // opType
  Buffer.from(glyphHashHex, 'hex').copy(buf, 6, 0, 32);
  buf.writeUInt16LE(edition, 38);

  // OP_RETURN (0x6a) + push 40 bytes (0x28) + payload
  return '6a28' + buf.toString('hex');
}

async function runProtocolOpcodeTests() {
  console.log('================================================================');
  console.log('=== QUAVENCE EXPLORER: PROTOCOL OPCODES & LINEAGE SUITE      ===');
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

  // --------------------------------------------------------------------------
  // TEST 1: Protocol Opcode Decoding (PUB-01)
  // --------------------------------------------------------------------------
  console.log('--- 1. Testing Protocol Opcode Decoding (PUB-01) ---');
  const dummyHash = '11'.repeat(32);

  // 1a. Opcode 0x01 -> CLAIM / MINT
  const claimHex = buildTestGlyphScriptHex(PROTOCOL_OPS.MINT, 1, dummyHash);
  const parsedClaim = parseGlyphFromVout({ scriptPubKey: { hex: claimHex } });
  assert(parsedClaim !== null && parsedClaim.opLabel === 'CLAIM', 'Opcode 0x01 parsed as CLAIM');

  // 1b. Opcode 0x03 -> TRANSFER
  const transferHex = buildTestGlyphScriptHex(PROTOCOL_OPS.TRANSFER, 1, dummyHash);
  const parsedTransfer = parseGlyphFromVout({ scriptPubKey: { hex: transferHex } });
  assert(parsedTransfer !== null && parsedTransfer.opLabel === 'TRANSFER', 'Opcode 0x03 parsed as TRANSFER');

  // 1c. Opcode 0x04 -> BURN (Standard per txBuilder & marketTxBuilder)
  const burnHex = buildTestGlyphScriptHex(PROTOCOL_OPS.BURN, 1, dummyHash);
  const parsedBurn = parseGlyphFromVout({ scriptPubKey: { hex: burnHex } });
  assert(
    parsedBurn !== null && parsedBurn.opLabel === 'BURN',
    'Opcode 0x04 (BURN) correctly parsed as BURN',
    `Expected opLabel 'BURN', got '${parsedBurn?.opLabel}' (opType=${parsedBurn?.opType})`
  );

  // 1d. Opcode 0x02 -> GENESIS (Should NOT be parsed as BURN!)
  const genesisHex = buildTestGlyphScriptHex(PROTOCOL_OPS.GENESIS, 1, dummyHash);
  const parsedGenesis = parseGlyphFromVout({ scriptPubKey: { hex: genesisHex } });
  assert(
    parsedGenesis !== null && parsedGenesis.opLabel !== 'BURN',
    'Opcode 0x02 (GENESIS) is NOT confused with BURN',
    `Opcode 0x02 was erroneously decoded as '${parsedGenesis?.opLabel}'`
  );

  // --------------------------------------------------------------------------
  // TEST 2: Indexer Processing of BURN opType=0x04 via Production saveBlockToDb
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Testing Indexer Processing of BURN (OpCode 0x04 Lineage) ---');
  await initDb(':memory:');

  const glyphHash = 'aa'.repeat(32);
  const edition = 7;
  const minterAddr = 'S_OFFICIAL_MINTER';
  const ownerAddr = 'S_HONEST_OWNER';

  await db.run(`INSERT INTO blocks (height, hash, previous_hash, time, tx_count) VALUES (100, 'block_100', 'b99', 1700000000, 1)`);
  await db.run(`INSERT INTO blocks (height, hash, previous_hash, time, tx_count) VALUES (101, 'block_101', 'block_100', 1700000010, 1)`);

  // Insert initial MINT / CLAIM at height 100 with carrier at vout 1
  await db.run(
    `INSERT INTO glyphs (txid, block_hash, block_height, block_time, glyph_hash, edition, op_type, op_label, carrier_address, carrier_vout)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    'tx_mint_1', 'block_100', 100, 1700000000, glyphHash, edition, 1, 'CLAIM', minterAddr, 1
  );

  // Insert TRANSFER to owner at height 101 with carrier at vout 0
  await db.run(
    `INSERT INTO glyphs (txid, block_hash, block_height, block_time, glyph_hash, edition, op_type, op_label, carrier_address, carrier_vout)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    'tx_transfer_1', 'block_101', 101, 1700000010, glyphHash, edition, 3, 'TRANSFER', ownerAddr, 0
  );
  await db.run(
    `INSERT INTO utxos (txid, vout_index, address, amount, block_height)
     VALUES (?, ?, ?, ?, ?)`,
    'tx_transfer_1', 0, ownerAddr, 10000, 101
  );

  // Check active carrier before BURN
  let activeCarrier: any = await db.get(
    `SELECT txid, carrier_vout, carrier_address, op_label, glyph_hash
     FROM glyphs WHERE glyph_hash = ? AND edition = ?
     ORDER BY block_height DESC, rowid DESC LIMIT 1`,
    glyphHash,
    edition
  );
  assert(activeCarrier && activeCarrier.carrier_address === ownerAddr, 'Active carrier before burn belongs to owner');

  // Process a BURN transaction through production saveBlockToDb
  const burnTxid = 'tx_burn_1';
  const burnBlock = {
    hash: 'block_102',
    previousblockhash: 'block_101',
    time: 1700000020,
    tx_count: 1,
    size: 500,
    tx: [
      {
        txid: burnTxid,
        vin: [{ txid: 'tx_transfer_1', vout: 0, scriptSig: { hex: '' } }],
        vout: [
          {
            value: 0,
            n: 0,
            scriptPubKey: { hex: buildTestGlyphScriptHex(PROTOCOL_OPS.BURN, edition, glyphHash), asm: 'OP_RETURN' }
          }
        ]
      }
    ]
  };

  await saveBlockToDb(burnBlock, 102);

  const burnRow = await db.get('SELECT * FROM glyphs WHERE txid = ?', burnTxid);
  assert(burnRow !== undefined && burnRow.op_label === 'BURN', 'BURN transaction with opType 0x04 accepted by indexer', 'Indexer failed to recognize opType 0x04 as BURN');

  // Verify glyph is now officially burned in active state
  activeCarrier = await db.get(
    `SELECT txid, carrier_vout, carrier_address, op_label, glyph_hash
     FROM glyphs WHERE glyph_hash = ? AND edition = ?
     ORDER BY block_height DESC, rowid DESC LIMIT 1`,
    glyphHash,
    edition
  );
  assert(activeCarrier && activeCarrier.op_label === 'BURN', 'Glyph active carrier state is BURN');

  // --------------------------------------------------------------------------
  // TEST 3: Production API carrierVout preservation (/api/glyphs) (PUB-02)
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Testing /api/glyphs carrierVout Output (PUB-02) ---');

  // Setup glyph with carrier at vout = 2 (non-zero index)
  const editionSpecial = 88;
  const hashSpecial = '33'.repeat(32);
  await db.run(`INSERT INTO blocks (height, hash, previous_hash, time, tx_count) VALUES (103, 'block_103', 'block_102', 1700000030, 1)`);
  await db.run(
    `INSERT INTO glyphs (txid, block_hash, block_height, block_time, glyph_hash, edition, op_type, op_label, carrier_address, carrier_vout)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    'tx_special_carrier', 'block_103', 103, 1700000030, hashSpecial, editionSpecial, 1, 'CLAIM', 'S_SPECIAL_HOLDER', 2
  );
  await db.run(
    `INSERT INTO utxos (txid, vout_index, address, amount, block_height)
     VALUES (?, ?, ?, ?, ?)`,
    'tx_special_carrier', 2, 'S_SPECIAL_HOLDER', 10000, 103
  );

  // Invoke real production getGlyphsCatalog service
  const catalog = await getGlyphsCatalog({ limit: 100 }, db);
  const catalogItem = catalog.items.find(i => i.edition === editionSpecial);
  assert(catalogItem !== undefined && catalogItem.carrierVout === 2, 'DB query selected carrier_vout = 2');

  // Invoke real production getGlyphDetail service
  const detailItem = await getGlyphDetail(editionSpecial, db);
  assert(
    detailItem !== null && typeof detailItem.carrierVout === 'number' && detailItem.carrierVout === 2,
    'Serialized API item contains carrierVout = 2',
    `carrierVout field missing or not a number in getGlyphDetail serialization (got ${detailItem?.carrierVout})`
  );

  console.log('\n================================================================');
  console.log(`=== PROTOCOL OPCODES RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runProtocolOpcodeTests().catch((err) => {
  console.error('[FATAL ERROR]', err);
  process.exit(1);
});
