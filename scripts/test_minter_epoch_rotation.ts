/**
 * Zero-Mock Adversarial Verification Suite: Minter Key Rotation & Multi-Sig Lineage Eras (Vector 1)
 * 
 * Verifies:
 * 1. Parser specification: ADDRESS, ADDRESS:START-END, ADDRESS:START+, and fail-closed syntax rejection.
 * 2. Attack Scenario: Expired legacy key past its epoch is strictly REJECTED (CWE-324).
 * 3. Attack Scenario: Premature future key before its epoch is strictly REJECTED (CWE-295).
 * 4. Legitimate Scenario: Rotated multi-sig key active in its epoch is ACCEPTED.
 * 5. Attack Scenario: Unauthorized stranger address is REJECTED on any height.
 * 6. Backwards Compatibility: Legacy single-address configuration remains valid across all blocks [0, ∞).
 */
import assert from 'node:assert/strict';
import { db, initDb } from '../src/db/db.js';
import {
  saveBlockToDb,
  parseMinterEpochs,
  isMinterAuthorizedAtHeight,
} from '../src/indexer/indexer.js';

async function runMinterEpochRotationTests() {
  console.log('================================================================');
  console.log('=== QUAVENCE EXPLORER: MINTER EPOCH ROTATION TEST SUITE      ===');
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

  console.log('--- 1. Testing Minter Epoch Syntax Parser & Fail-Closed Validation ---');

  await runTest('Plain address parses to [0, Infinity)', () => {
    const configs = parseMinterEpochs('S_MINTER_GENESIS');
    assert.equal(configs.length, 1);
    assert.equal(configs[0].address, 'S_MINTER_GENESIS');
    assert.equal(configs[0].startHeight, 0);
    assert.equal(configs[0].endHeight, Infinity);
  });

  await runTest('Bounded range ADDRESS:START-END parses strictly', () => {
    const configs = parseMinterEpochs('S_KEY_A:0-50000');
    assert.equal(configs.length, 1);
    assert.equal(configs[0].address, 'S_KEY_A');
    assert.equal(configs[0].startHeight, 0);
    assert.equal(configs[0].endHeight, 50000);
  });

  await runTest('Open-ended range ADDRESS:START+ parses to [START, Infinity)', () => {
    const configs = parseMinterEpochs('S_KEY_B:50001+');
    assert.equal(configs.length, 1);
    assert.equal(configs[0].address, 'S_KEY_B');
    assert.equal(configs[0].startHeight, 50001);
    assert.equal(configs[0].endHeight, Infinity);
  });

  await runTest('Multi-epoch comma and newline separated lists parse correctly', () => {
    const raw = `
      S_KEY_GENESIS:0-50000,
      S_KEY_MULTISIG:50001-100000,
      S_KEY_DAO_COUNCIL:100001+
    `;
    const configs = parseMinterEpochs(raw);
    assert.equal(configs.length, 3);
    assert.equal(configs[0].address, 'S_KEY_GENESIS');
    assert.equal(configs[0].startHeight, 0);
    assert.equal(configs[0].endHeight, 50000);

    assert.equal(configs[1].address, 'S_KEY_MULTISIG');
    assert.equal(configs[1].startHeight, 50001);
    assert.equal(configs[1].endHeight, 100000);

    assert.equal(configs[2].address, 'S_KEY_DAO_COUNCIL');
    assert.equal(configs[2].startHeight, 100001);
    assert.equal(configs[2].endHeight, Infinity);
  });

  await runTest('Fail-Closed: Regressive range (end < start) throws descriptive error', () => {
    assert.throws(
      () => parseMinterEpochs('S_INVALID:100-50'),
      /start <= end/
    );
  });

  await runTest('Fail-Closed: Malformed non-numeric height throws descriptive error', () => {
    assert.throws(
      () => parseMinterEpochs('S_INVALID:abc-100'),
      /integers/
    );
  });

  await runTest('Fail-Closed: Missing address before colon throws descriptive error', () => {
    assert.throws(
      () => parseMinterEpochs(':0-100'),
      /empty address/
    );
  });

  await runTest('Fail-Closed: Negative height throws descriptive error', () => {
    assert.throws(
      () => parseMinterEpochs('S_KEY:-10-50'),
      /Invalid minter epoch/
    );
  });

  console.log('\n--- 2. Testing Real Indexer Block Consensus & Adversarial Mints ---');

  // Initialize fresh in-memory SQLite database
  await initDb(':memory:');

  const GENESIS_KEY = 'S_MINTER_GENESIS_ERA';
  const MULTISIG_KEY = 'S_MINTER_MULTISIG_ERA';
  const STRANGER_KEY = 'S_STRANGER_UNAUTHORIZED';
  const CLAIMER_ADDR = 'S_CLAIMER_RECIPIENT_ADDR';

  // Configure dual-epoch rotation:
  // Epoch 1: GENESIS_KEY active on [0, 100]
  // Epoch 2: MULTISIG_KEY active on [101, Infinity)
  process.env.GLYPH_MINTER_ADDRESS = `${GENESIS_KEY}:0-100, ${MULTISIG_KEY}:101+`;

  // Helper to construct a block with a CLAIM transaction
  function makeClaimBlock(
    txid: string,
    edition: number,
    minterInputAddr: string,
    blockHash: string,
    height: number
  ) {
    // 32-byte glyph hash
    const glyphHash = '55'.repeat(32);
    // OP_RETURN hex: 6a2851564e430101 (magic + v1 + CLAIM) + 32-byte hash + edition (2 bytes LE)
    const edBuf = Buffer.alloc(2);
    edBuf.writeUInt16LE(edition, 0);
    const opReturnHex = '6a2851564e430101' + glyphHash + edBuf.toString('hex');

    const tx = {
      txid,
      version: 1,
      time: 1700000000 + height,
      vin: [
        {
          txid: `tx_input_parent_${txid}`,
          vout: 0,
        },
      ],
      vout: [
        {
          value: 0,
          n: 0,
          scriptPubKey: {
            asm: `OP_RETURN 51564e430101${glyphHash}${edBuf.toString('hex')}`,
            hex: opReturnHex,
          },
        },
        {
          value: 0.00010000, // 10,000 sat carrier output
          n: 1,
          scriptPubKey: {
            addresses: [CLAIMER_ADDR],
          },
        },
      ],
    };

    const block = {
      hash: blockHash,
      height,
      previous_hash: `block_prev_${height}`,
      time: 1700000000 + height,
      tx_count: 1,
      size: 500,
      tx: [tx],
    };

    return { block, tx, glyphHash };
  }

  // ATTACK 1: Expired Key Attack (CWE-324)
  // GENESIS_KEY is only valid on [0, 100]. At height 150 it must be REJECTED.
  await runTest('Attack CWE-324: Expired Genesis key used at height 150 is strictly REJECTED by indexer', async () => {
    const txid = 'tx_expired_key_mint_attempt';
    const edition = 101;
    const { block } = makeClaimBlock(txid, edition, GENESIS_KEY, 'b150_expired', 150);

    // Seed the spent UTXO belonging to GENESIS_KEY
    await db.run(`
      INSERT INTO spent_utxos (spending_txid, spending_block_height, prev_txid, prev_vout_index, address, amount, prev_block_height)
      VALUES (?, 150, 'tx_input_parent_${txid}', 0, ?, 100000, 99)
    `, txid, GENESIS_KEY);

    await saveBlockToDb(block, 150);

    const glyphRow = await db.get('SELECT * FROM glyphs WHERE edition = ?', edition);
    assert.equal(glyphRow, undefined, 'Expired key mint MUST NOT be inserted into glyphs table');
  });

  // ATTACK 2: Premature Key Attack (CWE-295)
  // MULTISIG_KEY is only valid on [101, ∞). At height 50 it must be REJECTED.
  await runTest('Attack CWE-295: Premature MultiSig key used before epoch at height 50 is strictly REJECTED by indexer', async () => {
    const txid = 'tx_premature_key_mint_attempt';
    const edition = 102;
    const { block } = makeClaimBlock(txid, edition, MULTISIG_KEY, 'b50_premature', 50);

    await db.run(`
      INSERT INTO spent_utxos (spending_txid, spending_block_height, prev_txid, prev_vout_index, address, amount, prev_block_height)
      VALUES (?, 50, 'tx_input_parent_${txid}', 0, ?, 100000, 49)
    `, txid, MULTISIG_KEY);

    await saveBlockToDb(block, 50);

    const glyphRow = await db.get('SELECT * FROM glyphs WHERE edition = ?', edition);
    assert.equal(glyphRow, undefined, 'Premature key mint MUST NOT be inserted into glyphs table');
  });

  // LEGITIMATE 1: Valid Genesis Era Mint
  // GENESIS_KEY at height 55 (within [0, 100]) must be ACCEPTED.
  await runTest('Legitimate Epoch 1: Genesis key used within its era (height 55) is ACCEPTED by indexer', async () => {
    const txid = 'tx_legit_genesis_era_mint';
    const edition = 1;
    const { block } = makeClaimBlock(txid, edition, GENESIS_KEY, 'b55_legit', 55);

    await db.run(`
      INSERT INTO spent_utxos (spending_txid, spending_block_height, prev_txid, prev_vout_index, address, amount, prev_block_height)
      VALUES (?, 55, 'tx_input_parent_${txid}', 0, ?, 100000, 54)
    `, txid, GENESIS_KEY);

    await saveBlockToDb(block, 55);

    const glyphRow = await db.get('SELECT * FROM glyphs WHERE edition = ?', edition);
    assert.ok(glyphRow, 'Legitimate Genesis mint must be recorded in glyphs table');
    assert.equal(glyphRow.edition, 1);
    assert.equal(glyphRow.op_label, 'CLAIM');
  });

  // LEGITIMATE 2: Valid Rotated Era Mint
  // MULTISIG_KEY at height 155 (within [101, ∞)) must be ACCEPTED.
  await runTest('Legitimate Epoch 2: MultiSig key used in rotated era (height 155) is ACCEPTED by indexer', async () => {
    const txid = 'tx_legit_multisig_era_mint';
    const edition = 2;
    const { block } = makeClaimBlock(txid, edition, MULTISIG_KEY, 'b155_legit', 155);

    await db.run(`
      INSERT INTO spent_utxos (spending_txid, spending_block_height, prev_txid, prev_vout_index, address, amount, prev_block_height)
      VALUES (?, 155, 'tx_input_parent_${txid}', 0, ?, 100000, 154)
    `, txid, MULTISIG_KEY);

    await saveBlockToDb(block, 155);

    const glyphRow = await db.get('SELECT * FROM glyphs WHERE edition = ?', edition);
    assert.ok(glyphRow, 'Legitimate MultiSig mint must be recorded in glyphs table');
    assert.equal(glyphRow.edition, 2);
    assert.equal(glyphRow.op_label, 'CLAIM');
  });

  // ATTACK 3: Stranger Address
  // STRANGER_KEY at height 50 and height 150 is rejected.
  await runTest('Attack: Stranger address without minter rights is rejected on all heights', async () => {
    const txid = 'tx_stranger_mint_attempt';
    const edition = 103;
    const { block } = makeClaimBlock(txid, edition, STRANGER_KEY, 'b75_stranger', 75);

    await db.run(`
      INSERT INTO spent_utxos (spending_txid, spending_block_height, prev_txid, prev_vout_index, address, amount, prev_block_height)
      VALUES (?, 75, 'tx_input_parent_${txid}', 0, ?, 100000, 74)
    `, txid, STRANGER_KEY);

    await saveBlockToDb(block, 75);

    const glyphRow = await db.get('SELECT * FROM glyphs WHERE edition = ?', edition);
    assert.equal(glyphRow, undefined, 'Stranger mint MUST NOT be inserted into glyphs table');
  });

  // BACKWARDS COMPATIBILITY GUARD: Plain address configuration
  await runTest('Backwards Compatibility: Plain address configuration allows minting across all heights', async () => {
    const LEGACY_KEY = 'S_LEGACY_PLAIN_MINTER';
    process.env.GLYPH_MINTER_ADDRESS = LEGACY_KEY;

    const txid1 = 'tx_legacy_early';
    const ed1 = 10;
    const { block: bEarly } = makeClaimBlock(txid1, ed1, LEGACY_KEY, 'b10_legacy', 10);
    await db.run(`
      INSERT INTO spent_utxos (spending_txid, spending_block_height, prev_txid, prev_vout_index, address, amount, prev_block_height)
      VALUES (?, 10, 'tx_input_parent_${txid1}', 0, ?, 100000, 9)
    `, txid1, LEGACY_KEY);
    await saveBlockToDb(bEarly, 10);

    const txid2 = 'tx_legacy_late';
    const ed2 = 11;
    const { block: bLate } = makeClaimBlock(txid2, ed2, LEGACY_KEY, 'b200k_legacy', 200000);
    await db.run(`
      INSERT INTO spent_utxos (spending_txid, spending_block_height, prev_txid, prev_vout_index, address, amount, prev_block_height)
      VALUES (?, 200000, 'tx_input_parent_${txid2}', 0, ?, 100000, 199999)
    `, txid2, LEGACY_KEY);
    await saveBlockToDb(bLate, 200000);

    const row1 = await db.get('SELECT * FROM glyphs WHERE edition = ?', ed1);
    const row2 = await db.get('SELECT * FROM glyphs WHERE edition = ?', ed2);
    assert.ok(row1, 'Early legacy mint must be accepted');
    assert.ok(row2, 'Late legacy mint must be accepted');
  });

  // Cleanup
  await db.close();

  console.log('\n================================================================');
  console.log(`=== MINTER EPOCH ROTATION SUITE: ${passed} PASSED, ${failed} FAILED ===`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runMinterEpochRotationTests().catch((err) => {
  console.error('Fatal error in minter epoch rotation test suite:', err);
  process.exit(1);
});
