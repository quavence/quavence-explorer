/**
 * Verification Suite for Living Sovereign Agent (LSA) L1 State Sync (OpCode 0x05) & Explorer Indexer
 * 
 * Verifies:
 * 1. Parser decodes OpCode 0x05 (SOVEREIGN_AGENT_STATE_SYNC) into GlyphOpReturnData with stateRootHash and cycleCount.
 * 2. Parser decodes Task Types 13 (TASK_SI_INTERACTION_TURN) and 14 (TASK_SI_DREAM_CONSOLIDATION).
 * 3. Carrier UTXO Lineage: Indexer strictly rejects counterfeit STATE_SYNC that does not spend active carrier UTXO.
 * 4. Indexer rejects rollback/regressive cycle_count in STATE_SYNC.
 * 5. Indexer accepts legitimate STATE_SYNC and correctly updates carrier lineage, state_root_hash, and cycle_count.
 * 6. Indexer rejects STATE_SYNC on burned glyphs.
 */
import assert from 'node:assert/strict';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, db } from '../src/db/db.js';
import { saveBlockToDb } from '../src/indexer/indexer.js';
import {
  parseGlyphFromVout,
  parseAiAttestationFromVout,
  GLYPH_OP,
  toSatoshis,
} from '../src/indexer/parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('================================================================');
console.log('=== QUAVENCE EXPLORER: LSA SPRINT 2 STATE SYNC VERIFICATION  ===');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res.then(() => {
        console.log(`[PASS] ${name}`);
        passed++;
      }).catch((err) => {
        console.error(`[FAIL] ${name}`);
        console.error(err?.message || err);
        failed++;
      });
    } else {
      console.log(`[PASS] ${name}`);
      passed++;
    }
  } catch (err: any) {
    console.error(`[FAIL] ${name}`);
    console.error(err?.message || err);
    failed++;
  }
}

function buildStateSyncVout(edition: number, stateRootHex: string, cycleCount: number): any {
  const buf = Buffer.alloc(44);
  buf.write('QVNC', 0, 4, 'ascii');
  buf.writeUInt8(1, 4); // version = 1
  buf.writeUInt8(0x05, 5); // opType = 5 (STATE_SYNC)
  buf.writeUInt16LE(edition, 6);
  Buffer.from(stateRootHex, 'hex').copy(buf, 8);
  buf.writeUInt32LE(cycleCount, 40);

  const hex = '6a2c' + buf.toString('hex');
  return {
    value: 0,
    n: 0,
    scriptPubKey: {
      asm: `OP_RETURN ${buf.toString('hex')}`,
      hex,
    },
  };
}

async function main() {
  console.log('--- 1. Testing Parser OP_RETURN Decoding for OpCode 0x05 ---');

  runTest('Opcode 0x05 parsed as STATE_SYNC with 44-byte payload', () => {
    const dummyRoot = 'ab'.repeat(32);
    const vout = buildStateSyncVout(77, dummyRoot, 12);
    const parsed = parseGlyphFromVout(vout);

    assert.ok(parsed, 'Glyph must not be null');
    assert.equal(parsed.opType, GLYPH_OP.STATE_SYNC);
    assert.equal(parsed.opLabel, 'STATE_SYNC');
    assert.equal(parsed.edition, 77);
    assert.equal(parsed.stateRootHash, dummyRoot);
    assert.equal(parsed.cycleCount, 12);
  });

  runTest('Opcode 0x05 rejects truncated payload (< 44 bytes)', () => {
    const shortBuf = Buffer.alloc(40);
    shortBuf.write('QVNC', 0, 4, 'ascii');
    shortBuf.writeUInt8(1, 4);
    shortBuf.writeUInt8(0x05, 5);
    const vout = {
      value: 0,
      scriptPubKey: {
        hex: '6a28' + shortBuf.toString('hex'),
        asm: `OP_RETURN ${shortBuf.toString('hex')}`,
      },
    };
    const parsed = parseGlyphFromVout(vout);
    assert.equal(parsed, null, 'Truncated STATE_SYNC must return null');
  });

  runTest('Opcode 0x05 rejects oversized/padded payload (> 44 bytes)', () => {
    const dummyRoot = 'ab'.repeat(32);
    const validVout = buildStateSyncVout(77, dummyRoot, 12);
    const rawHex = validVout.scriptPubKey.hex.replace(/^6a2c/, '');
    const longBuf = Buffer.concat([Buffer.from(rawHex, 'hex'), Buffer.from([0xff])]);
    const vout = {
      value: 0,
      scriptPubKey: {
        hex: '6a2d' + longBuf.toString('hex'),
        asm: `OP_RETURN ${longBuf.toString('hex')}`,
      },
    };
    const parsed = parseGlyphFromVout(vout);
    assert.equal(parsed, null, 'Oversized STATE_SYNC must return null');
  });

  console.log('\n--- 2. Testing AI Attestation Parser for Task Types 13 and 14 ---');

  runTest('parseAiAttestationFromVout decodes typeCode 13 as TASK_SI_INTERACTION_TURN', () => {
    const buf = Buffer.alloc(44);
    buf.write('QVAI', 0, 4, 'ascii');
    buf.writeUInt8(1, 4);
    buf.writeUInt8(13, 5);
    Buffer.alloc(32, 0x11).copy(buf, 6);
    buf.writeUInt8(1, 38);
    buf.writeUInt8(255, 39);
    buf.writeUInt32BE(100, 40);

    const vout = {
      value: 0,
      scriptPubKey: {
        hex: '6a2c' + buf.toString('hex'),
        asm: `OP_RETURN ${buf.toString('hex')}`,
      },
    };
    const att = parseAiAttestationFromVout(vout);
    assert.ok(att);
    assert.equal(att.taskType, 'TASK_SI_INTERACTION_TURN');
    assert.equal(att.taskTypeCode, 13);
  });

  runTest('parseAiAttestationFromVout decodes typeCode 14 as TASK_SI_DREAM_CONSOLIDATION', () => {
    const buf = Buffer.alloc(44);
    buf.write('QVAI', 0, 4, 'ascii');
    buf.writeUInt8(1, 4);
    buf.writeUInt8(14, 5);
    Buffer.alloc(32, 0x22).copy(buf, 6);
    buf.writeUInt8(1, 38);
    buf.writeUInt8(255, 39);
    buf.writeUInt32BE(101, 40);

    const vout = {
      value: 0,
      scriptPubKey: {
        hex: '6a2c' + buf.toString('hex'),
        asm: `OP_RETURN ${buf.toString('hex')}`,
      },
    };
    const att = parseAiAttestationFromVout(vout);
    assert.ok(att);
    assert.equal(att.taskType, 'TASK_SI_DREAM_CONSOLIDATION');
    assert.equal(att.taskTypeCode, 14);
  });

  console.log('\n--- 3. Testing Indexer Carrier Lineage for STATE_SYNC on In-Memory DB ---');

  process.env.DAO_API_URL = 'none';

  await initDb(':memory:');

  function buildTestGlyphScriptHex(opType: number, edition: number, glyphHashHex: string): string {
    const buf = Buffer.alloc(40);
    buf.write('QVNC', 0, 4, 'ascii');
    buf.writeUInt8(0x01, 4); // version = 1
    buf.writeUInt8(opType, 5); // opType
    Buffer.from(glyphHashHex, 'hex').copy(buf, 6, 0, 32);
    buf.writeUInt16LE(edition, 38);
    return '6a28' + buf.toString('hex');
  }

  async function processTx(tx: {
    txid: string;
    height: number;
    time: number;
    vin: Array<{ txid: string; vout: number; address?: string }>;
    vout: Array<{ value: number; scriptPubKey: { hex?: string; asm?: string; addresses?: string[] } }>;
  }): Promise<boolean> {
    const { txid, height, time } = tx;

    for (const input of tx.vin) {
      if (input.address) {
        await db.run(
          `INSERT OR REPLACE INTO utxos (txid, vout_index, address, amount, block_height)
           VALUES (?, ?, ?, ?, ?)`,
          input.txid, input.vout, input.address, 100000, 50
        );
      }
    }

    const block = {
      hash: `b_lsa_block_${height}`,
      height,
      previous_hash: `b_lsa_block_${height - 1}`,
      time,
      tx_count: 1,
      size: 500,
      tx: [
        {
          txid,
          vin: tx.vin.map(v => ({ txid: v.txid, vout: v.vout, scriptSig: { hex: '' } })),
          vout: tx.vout.map((o, idx) => ({
            value: o.value,
            n: idx,
            scriptPubKey: {
              hex: o.scriptPubKey.hex || '',
              asm: o.scriptPubKey.asm || (o.scriptPubKey.hex?.startsWith('6a') ? 'OP_RETURN' : ''),
              addresses: o.scriptPubKey.addresses || []
            }
          }))
        }
      ]
    };

    await saveBlockToDb(block, height);
    const row = await db.get('SELECT * FROM glyphs WHERE txid = ?', txid);
    return row !== undefined;
  }

  const GENESIS_GLYPH_HASH = '11'.repeat(32);
  const ALICE_ADDR = 'SPdAliceCarrierAddress1111111111111';
  const BOB_ADDR = 'SPdBobMalloryAttacker22222222222222';

  process.env.GLYPH_MINTER_ADDRESS = ALICE_ADDR;

  // Step 1: Mint Edition #50 to Alice
  await runTest('Alice CLAIMs Edition #50 (Initial Carrier Lineage)', async () => {
    const claimHex = buildTestGlyphScriptHex(GLYPH_OP.CLAIM, 50, GENESIS_GLYPH_HASH);
    const accepted = await processTx({
      txid: 'tx_mint_50',
      height: 100,
      time: 1700000000,
      vin: [{ txid: 'funding_tx', vout: 0, address: ALICE_ADDR }],
      vout: [
        { value: 0, scriptPubKey: { hex: claimHex, asm: 'OP_RETURN' } },
        { value: 0.00010000, scriptPubKey: { hex: '76a914111111111111111111111111111111111111111188ac', addresses: [ALICE_ADDR] } }, // 10,000 sat carrier
      ],
    });
    assert.equal(accepted, true, 'Mint must be accepted');

    const row = await db.get('SELECT * FROM glyphs WHERE edition = 50');
    assert.equal(row.carrier_address, ALICE_ADDR);
    assert.equal(row.carrier_vout, 1);
    assert.equal(row.cycle_count, 0);
  });

  // Step 2: Bob tries counterfeit STATE_SYNC without spending Alice carrier
  await runTest('Bob counterfeit STATE_SYNC rejected (does not spend Alice Carrier UTXO)', async () => {
    const syncHex = buildStateSyncVout(50, 'ff'.repeat(32), 1).scriptPubKey.hex;
    const accepted = await processTx({
      txid: 'tx_fake_sync_50',
      height: 105,
      time: 1700000500,
      vin: [{ txid: 'bobs_own_random_tx', vout: 0, address: BOB_ADDR }], // DOES NOT spend tx_mint_50:1
      vout: [
        { value: 0, scriptPubKey: { hex: syncHex, asm: 'OP_RETURN' } },
        { value: 0.00010000, scriptPubKey: { hex: '76a914222222222222222222222222222222222222222288ac', addresses: [BOB_ADDR] } },
      ],
    });
    assert.equal(accepted, false, 'Counterfeit STATE_SYNC must be rejected');

    // Carrier must still belong to Alice at cycle 0
    const latest = await db.get('SELECT * FROM glyphs WHERE edition = 50 ORDER BY block_height DESC LIMIT 1');
    assert.equal(latest.carrier_address, ALICE_ADDR);
    assert.equal(latest.cycle_count, 0);
  });

  // Step 3: Legitimate STATE_SYNC #1 by Alice
  const STATE_ROOT_CYCLE_1 = 'aa'.repeat(32);
  await runTest('Alice legitimate STATE_SYNC #1 accepted (Cycle 1, StateRoot updated)', async () => {
    const syncHex = buildStateSyncVout(50, STATE_ROOT_CYCLE_1, 1).scriptPubKey.hex;
    const accepted = await processTx({
      txid: 'tx_sync_cycle_1',
      height: 110,
      time: 1700001000,
      vin: [{ txid: 'tx_mint_50', vout: 1 }], // Strictly spends Alice carrier!
      vout: [
        { value: 0, scriptPubKey: { hex: syncHex, asm: 'OP_RETURN' } },
        { value: 0.00010000, scriptPubKey: { hex: '76a914111111111111111111111111111111111111111188ac', addresses: [ALICE_ADDR] } }, // Recreates carrier to Alice
      ],
    });
    assert.equal(accepted, true, 'Legitimate STATE_SYNC must be accepted');

    const latest = await db.get('SELECT * FROM glyphs WHERE edition = 50 ORDER BY block_height DESC LIMIT 1');
    assert.equal(latest.txid, 'tx_sync_cycle_1');
    assert.equal(latest.carrier_address, ALICE_ADDR);
    assert.equal(latest.cycle_count, 1);
    assert.equal(latest.state_root_hash, STATE_ROOT_CYCLE_1);
    assert.equal(latest.glyph_hash, GENESIS_GLYPH_HASH, 'Genesis glyph_hash must be preserved');
  });

  // Step 4: Regressive cycle count rejected
  await runTest('Regressive STATE_SYNC with cycle 0 < 1 is rejected', async () => {
    const syncHex = buildStateSyncVout(50, 'bb'.repeat(32), 0).scriptPubKey.hex;
    const accepted = await processTx({
      txid: 'tx_regressive_sync',
      height: 115,
      time: 1700001500,
      vin: [{ txid: 'tx_sync_cycle_1', vout: 1 }],
      vout: [
        { value: 0, scriptPubKey: { hex: syncHex, asm: 'OP_RETURN' } },
        { value: 0.00010000, scriptPubKey: { hex: '76a914111111111111111111111111111111111111111188ac', addresses: [ALICE_ADDR] } },
      ],
    });
    assert.equal(accepted, false, 'Regressive cycle count must be rejected');
  });

  // Step 4b: Non-advancing equal cycle count (1 == 1) rejected
  await runTest('Non-advancing STATE_SYNC with identical cycle 1 == 1 is rejected', async () => {
    const syncHex = buildStateSyncVout(50, 'bb'.repeat(32), 1).scriptPubKey.hex;
    const accepted = await processTx({
      txid: 'tx_identical_sync',
      height: 116,
      time: 1700001600,
      vin: [{ txid: 'tx_sync_cycle_1', vout: 1 }],
      vout: [
        { value: 0, scriptPubKey: { hex: syncHex, asm: 'OP_RETURN' } },
        { value: 0.00010000, scriptPubKey: { hex: '76a914111111111111111111111111111111111111111188ac', addresses: [ALICE_ADDR] } },
      ],
    });
    assert.equal(accepted, false, 'Equal non-advancing cycle count must be rejected');
  });

  // Step 5: Legitimate STATE_SYNC #2
  const STATE_ROOT_CYCLE_2 = 'cc'.repeat(32);
  await runTest('Alice legitimate STATE_SYNC #2 accepted (Cycle 2, StateRoot updated)', async () => {
    const syncHex = buildStateSyncVout(50, STATE_ROOT_CYCLE_2, 2).scriptPubKey.hex;
    const accepted = await processTx({
      txid: 'tx_sync_cycle_2',
      height: 120,
      time: 1700002000,
      vin: [{ txid: 'tx_sync_cycle_1', vout: 1 }], // Spends previous carrier
      vout: [
        { value: 0, scriptPubKey: { hex: syncHex, asm: 'OP_RETURN' } },
        { value: 0.00010000, scriptPubKey: { hex: '76a914111111111111111111111111111111111111111188ac', addresses: [ALICE_ADDR] } },
      ],
    });
    assert.equal(accepted, true, 'Second STATE_SYNC must be accepted');

    const latest = await db.get('SELECT * FROM glyphs WHERE edition = 50 ORDER BY block_height DESC LIMIT 1');
    assert.equal(latest.txid, 'tx_sync_cycle_2');
    assert.equal(latest.cycle_count, 2);
    assert.equal(latest.state_root_hash, STATE_ROOT_CYCLE_2);
  });

  // Step 5.5: Alice TRANSFERs the living agent to Charlie on secondary market
  const CHARLIE_ADDR = 'SPdCharlieBuyerAddress333333333333';
  await runTest('TRANSFER preserves Living Agent identity, state_root_hash and cycle_count', async () => {
    const transferHex = buildTestGlyphScriptHex(GLYPH_OP.TRANSFER, 50, GENESIS_GLYPH_HASH);
    const accepted = await processTx({
      txid: 'tx_transfer_to_charlie',
      height: 122,
      time: 1700002200,
      vin: [{ txid: 'tx_sync_cycle_2', vout: 1 }], // Spends Alice carrier
      vout: [
        { value: 0, scriptPubKey: { hex: transferHex, asm: 'OP_RETURN' } },
        { value: 0.00010000, scriptPubKey: { hex: '76a914333333333333333333333333333333333333333388ac', addresses: [CHARLIE_ADDR] } }, // Recreates carrier to Charlie!
      ],
    });
    assert.equal(accepted, true, 'Legitimate TRANSFER must be accepted');

    const latest = await db.get('SELECT * FROM glyphs WHERE edition = 50 ORDER BY block_height DESC LIMIT 1');
    assert.equal(latest.txid, 'tx_transfer_to_charlie');
    assert.equal(latest.carrier_address, CHARLIE_ADDR, 'Holder must now be Charlie');
    assert.equal(latest.cycle_count, 2, 'State sync cycle_count MUST be preserved across TRANSFER');
    assert.equal(latest.state_root_hash, STATE_ROOT_CYCLE_2, 'StateRootHash MUST be preserved across TRANSFER');
    assert.equal(latest.glyph_hash, GENESIS_GLYPH_HASH, 'Genesis glyph hash must be preserved');
  });

  // Step 6: Burn glyph and ensure STATE_SYNC is blocked
  await runTest('STATE_SYNC on burned glyph is rejected', async () => {
    // Charlie burns glyph
    const burnHex = buildTestGlyphScriptHex(GLYPH_OP.BURN, 50, GENESIS_GLYPH_HASH);
    await processTx({
      txid: 'tx_burn_50',
      height: 125,
      time: 1700002500,
      vin: [{ txid: 'tx_transfer_to_charlie', vout: 1 }],
      vout: [{ value: 0, scriptPubKey: { hex: burnHex, asm: 'OP_RETURN' } }],
    });

    // Attempt STATE_SYNC after burn
    const syncHex = buildStateSyncVout(50, 'dd'.repeat(32), 3).scriptPubKey.hex;
    const accepted = await processTx({
      txid: 'tx_sync_after_burn',
      height: 130,
      time: 1700003000,
      vin: [{ txid: 'tx_burn_50', vout: 0 }],
      vout: [
        { value: 0, scriptPubKey: { hex: syncHex, asm: 'OP_RETURN' } },
        { value: 0.00010000, scriptPubKey: { hex: '76a914111111111111111111111111111111111111111188ac', addresses: [ALICE_ADDR] } }
      ],
    });
    assert.equal(accepted, false, 'STATE_SYNC on burned glyph must be rejected');
  });

  console.log(`\n================================================================`);
  console.log(`=== LSA SPRINT 2 VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
  console.log(`================================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
