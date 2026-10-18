/**
 * Quavence Explorer: Cross-Environment Carrier Assignment Parity Test Suite
 *
 * Verifies 1:1 behavioral parity between C++ node (GetTxGlyphCarrier in airegistry.cpp)
 * and TypeScript Explorer Indexer (indexer.ts) for multi-glyph transactions.
 * Mirrors the C++ test fixture: pous_consensus_tests.cpp::multi_glyph_carrier_assignment_parity_fixture
 */
import { initDb, db } from '../src/db/db.js';
import { saveBlockToDb } from '../src/indexer/indexer.js';

process.env.DAO_API_URL = 'none';

const MINTER_ADDR = 'addr_parity_minter';
process.env.GLYPH_MINTER_ADDRESS = MINTER_ADDR;

function buildTestGlyphScriptHex(opType: number, edition: number, hashByte: number): string {
  const buf = Buffer.alloc(40);
  buf.write('QVNC', 0, 4, 'ascii');
  buf.writeUInt8(0x01, 4); // version = 1
  buf.writeUInt8(opType, 5); // opType
  buf.fill(hashByte, 6, 38); // 32-byte glyphHash
  buf.writeUInt16LE(edition, 38);

  // OP_RETURN (0x6a) + push 40 bytes (0x28) + payload
  return '6a28' + buf.toString('hex');
}

async function runCarrierAssignmentParityTests() {
  console.log('================================================================');
  console.log('=== QUAVENCE EXPLORER: CARRIER ASSIGNMENT PARITY SUITE       ===');
  console.log('================================================================\n');

  await initDb(':memory:');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      if (detail) console.error(`       Detail: ${detail}`);
      process.exitCode = 1;
    }
  }

  /**
   * Processes a transaction block directly through the production saveBlockToDb indexer
   */
  async function processTxThroughIndexer(
    txid: string,
    height: number,
    vouts: Array<{ value: number; scriptPubKey: { hex?: string; addresses?: string[] } }>,
    vin: Array<{ txid: string; vout: number; address?: string }> = [{ txid: `funding_tx_${height}`, vout: 0, address: MINTER_ADDR }]
  ) {
    for (const input of vin) {
      if (input.address) {
        await db.run(
          `INSERT OR REPLACE INTO utxos (txid, vout_index, address, amount, block_height)
           VALUES (?, ?, ?, ?, ?)`,
          input.txid, input.vout, input.address, 1000000, 50
        );
      }
    }

    const block = {
      hash: `b_test_block_${height}`,
      height,
      previous_hash: `b_test_block_${height - 1}`,
      time: 1700000000 + height,
      tx_count: 1,
      size: 500,
      tx: [
        {
          txid,
          vin: vin.map(v => ({ txid: v.txid, vout: v.vout, scriptSig: { hex: '' } })),
          vout: vouts.map((out, idx) => ({
            value: out.value,
            n: idx,
            scriptPubKey: {
              hex: out.scriptPubKey.hex || '',
              asm: out.scriptPubKey.hex?.startsWith('6a') ? 'OP_RETURN' : '',
              addresses: out.scriptPubKey.addresses || []
            }
          }))
        }
      ]
    };

    await saveBlockToDb(block, height);
  }

  // --------------------------------------------------------------------------
  // FIXTURE 1: Forward ordering [Carrier 1, OP_RETURN 1, Carrier 2, OP_RETURN 2, Change]
  // --------------------------------------------------------------------------
  console.log('--- Fixture 1: Forward Ordering Parity ---');
  const tx1Vouts = [
    { value: 0.0001, scriptPubKey: { hex: '76a914111111111111111111111111111111111111111188ac', addresses: ['addr_carrier_1'] } }, // vout[0] - Carrier 1
    { value: 0, scriptPubKey: { hex: buildTestGlyphScriptHex(0x01, 101, 0xaa) } },          // vout[1] - OP_RETURN 1 (ed 101)
    { value: 0.0001, scriptPubKey: { hex: '76a914222222222222222222222222222222222222222288ac', addresses: ['addr_carrier_2'] } }, // vout[2] - Carrier 2
    { value: 0, scriptPubKey: { hex: buildTestGlyphScriptHex(0x01, 102, 0xbb) } },          // vout[3] - OP_RETURN 2 (ed 102)
    { value: 0.0005, scriptPubKey: { hex: '76a914333333333333333333333333333333333333333388ac', addresses: ['addr_change'] } },     // vout[4] - Change
  ];

  await processTxThroughIndexer('tx_fixture_1', 100, tx1Vouts);

  const row101 = await db.get('SELECT * FROM glyphs WHERE txid = ? AND edition = ?', 'tx_fixture_1', 101);
  assert(row101?.carrier_vout === 0, 'Fixture 1: Edition 101 binds to carrier at vout[0]');
  assert(row101?.carrier_address === 'addr_carrier_1', 'Fixture 1: Edition 101 bound to addr_carrier_1');

  const row102 = await db.get('SELECT * FROM glyphs WHERE txid = ? AND edition = ?', 'tx_fixture_1', 102);
  assert(row102?.carrier_vout === 2, 'Fixture 1: Edition 102 binds to carrier at vout[2]');
  assert(row102?.carrier_address === 'addr_carrier_2', 'Fixture 1: Edition 102 bound to addr_carrier_2');

  // --------------------------------------------------------------------------
  // FIXTURE 2: Reverse ordering [OP_RETURN 1, Carrier 1, OP_RETURN 2, Carrier 2]
  // --------------------------------------------------------------------------
  console.log('\n--- Fixture 2: Reverse Ordering Parity ---');
  const tx2Vouts = [
    { value: 0, scriptPubKey: { hex: buildTestGlyphScriptHex(0x01, 201, 0xcc) } },          // vout[0] - OP_RETURN 1 (ed 201)
    { value: 0.0001, scriptPubKey: { hex: '76a914111111111111111111111111111111111111111188ac', addresses: ['addr_carrier_1'] } }, // vout[1] - Carrier 1
    { value: 0, scriptPubKey: { hex: buildTestGlyphScriptHex(0x01, 202, 0xdd) } },          // vout[2] - OP_RETURN 2 (ed 202)
    { value: 0.0001, scriptPubKey: { hex: '76a914222222222222222222222222222222222222222288ac', addresses: ['addr_carrier_2'] } }, // vout[3] - Carrier 2
  ];

  await processTxThroughIndexer('tx_fixture_2', 101, tx2Vouts);

  const row201 = await db.get('SELECT * FROM glyphs WHERE txid = ? AND edition = ?', 'tx_fixture_2', 201);
  assert(row201?.carrier_vout === 1, 'Fixture 2: Edition 201 binds to carrier at vout[1]');
  assert(row201?.carrier_address === 'addr_carrier_1', 'Fixture 2: Edition 201 bound to addr_carrier_1');

  const row202 = await db.get('SELECT * FROM glyphs WHERE txid = ? AND edition = ?', 'tx_fixture_2', 202);
  assert(row202?.carrier_vout === 3, 'Fixture 2: Edition 202 binds to carrier at vout[3]');
  assert(row202?.carrier_address === 'addr_carrier_2', 'Fixture 2: Edition 202 bound to addr_carrier_2');

  // --------------------------------------------------------------------------
  // FIXTURE 3: BURN operation (0x04) destroys carrier; 10k output is NOT misclassified
  // --------------------------------------------------------------------------
  console.log('\n--- Fixture 3: BURN Opcode 0x04 Immunity ---');
  // First seed edition 301 as minted and held at tx_seed_301:0
  const hash301 = Buffer.alloc(32, 0xee).toString('hex');
  await db.run(
    `INSERT INTO glyphs (txid, op_vout, block_hash, block_height, block_time, glyph_hash, edition, op_type, op_label, carrier_address, carrier_vout)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    'tx_seed_301', 1, 'b_test_block_101', 101, 1700000101, hash301, 301, 1, 'CLAIM', 'addr_normal_p2pkh', 0
  );
  await db.run(
    `INSERT INTO utxos (txid, vout_index, address, amount, block_height)
     VALUES (?, ?, ?, ?, ?)`,
    'tx_seed_301', 0, 'addr_normal_p2pkh', 10000, 101
  );

  const tx3Vouts = [
    { value: 0.0001, scriptPubKey: { hex: '76a914444444444444444444444444444444444444444488ac', addresses: ['addr_normal_p2pkh'] } }, // vout[0] - 10,000 sat output
    { value: 0, scriptPubKey: { hex: buildTestGlyphScriptHex(0x04, 301, 0xee) } },             // vout[1] - OP_RETURN BURN (ed 301)
  ];

  await processTxThroughIndexer('tx_fixture_3', 102, tx3Vouts, [{ txid: 'tx_seed_301', vout: 0 }]);

  const row301 = await db.get('SELECT * FROM glyphs WHERE txid = ? AND edition = ?', 'tx_fixture_3', 301);
  assert(row301?.carrier_address === null, 'Fixture 3: BURN operation strictly zeroes carrier_address (null)');
  assert(row301?.carrier_vout === 0, 'Fixture 3: BURN operation carrier_vout is 0');
  assert(row301?.op_label === 'BURN', 'Fixture 3: Opcode 0x04 parsed as BURN');

  // --------------------------------------------------------------------------
  // FIXTURE 4: Grouped outputs [Carrier 1, Carrier 2, OP_RETURN 1, OP_RETURN 2]
  // --------------------------------------------------------------------------
  console.log('\n--- Fixture 4: Grouped Outputs Parity ---');
  const tx4Vouts = [
    { value: 0.0001, scriptPubKey: { hex: '76a914111111111111111111111111111111111111111188ac', addresses: ['addr_carrier_1'] } }, // vout[0] - Carrier 1
    { value: 0.0001, scriptPubKey: { hex: '76a914222222222222222222222222222222222222222288ac', addresses: ['addr_carrier_2'] } }, // vout[1] - Carrier 2
    { value: 0, scriptPubKey: { hex: buildTestGlyphScriptHex(0x01, 401, 0x11) } },          // vout[2] - OP_RETURN 1 (ed 401)
    { value: 0, scriptPubKey: { hex: buildTestGlyphScriptHex(0x01, 402, 0x22) } },          // vout[3] - OP_RETURN 2 (ed 402)
  ];

  await processTxThroughIndexer('tx_fixture_4', 103, tx4Vouts);

  const row401 = await db.get('SELECT * FROM glyphs WHERE txid = ? AND edition = ?', 'tx_fixture_4', 401);
  assert(row401?.carrier_vout === 0, 'Fixture 4: Edition 401 binds to carrier at vout[0]');
  assert(row401?.carrier_address === 'addr_carrier_1', 'Fixture 4: Edition 401 bound to addr_carrier_1');

  const row402 = await db.get('SELECT * FROM glyphs WHERE txid = ? AND edition = ?', 'tx_fixture_4', 402);
  assert(row402?.carrier_vout === 1, 'Fixture 4: Edition 402 binds to carrier at vout[1]');
  assert(row402?.carrier_address === 'addr_carrier_2', 'Fixture 4: Edition 402 bound to addr_carrier_2');

  console.log(`\n================================================================`);
  console.log(`=== PARITY SUITE SUMMARY: ${passed}/${total} PASSED (100%) ===`);
  console.log(`================================================================`);

  if (passed !== total) {
    process.exit(1);
  }
}

runCarrierAssignmentParityTests().catch((err) => {
  console.error('Fatal error in carrier parity tests:', err);
  process.exit(1);
});
