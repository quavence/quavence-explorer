/**
 * Automated Verification Suite for PoUS AI Attestation Task Type Taxonomy
 * 
 * Verifies:
 * 1. Parser parsing of all 12 task types in QVAI OP_RETURN payloads (including 10: TASK_EXTERNAL_INFERENCE, 11: TASK_EMBEDDING, 12: TASK_ORACLE_VERDICT)
 * 2. Strict prevention of regression: TASK_EXTERNAL_INFERENCE & TASK_EMBEDDING must not be parsed or displayed as DIGEST
 * 3. Explorer badge / label resolution logic matching protocol taxonomy using production resolveAttestationDisplayLabel
 * 4. True SSOT persistence of parsed attestations in SQLite via canonical saveBlockToDb
 */
import assert from 'node:assert/strict';
import { parseAiAttestationFromVout } from '../src/indexer/parser.js';
import { resolveAttestationDisplayLabel } from '../src/web/utils/attestation.js';
import { initDb, db } from '../src/db/db.js';
import { saveBlockToDb } from '../src/indexer/indexer.js';

console.log('================================================================');
console.log('=== QUAVENCE EXPLORER: ATTESTATION TAXONOMY VERIFICATION     ===');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      await res;
    }
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`[FAIL] ${name}`);
    console.error(err?.message || err);
    failed++;
  }
}

function buildDummyVout(typeCode: number, blockHeight = 12345): any {
  const buf = Buffer.alloc(44);
  buf.write('QVAI', 0, 4, 'ascii');
  buf.writeUInt8(1, 4); // version = 1
  buf.writeUInt8(typeCode, 5); // taskTypeCode

  // 32-byte consensus hash (0xab repeating)
  const dummyHashBuf = Buffer.alloc(32, 0xab);
  dummyHashBuf.copy(buf, 6);

  buf.writeUInt8(3, 38); // workerCount = 3
  buf.writeUInt8(255, 39); // agreementRatio = 1.0 (255/255)
  buf.writeUInt32BE(blockHeight, 40); // refBlockHeight

  // OP_RETURN (0x6a) + PUSHDATA 44 bytes (0x2c)
  const scriptHex = '6a2c' + buf.toString('hex');
  return {
    value: 0,
    n: 1,
    scriptPubKey: {
      asm: `OP_RETURN ${buf.toString('hex')}`,
      hex: scriptHex,
    },
  };
}

const TAXONOMY_MATRIX = [
  { code: 1, expectedName: 'TASK_RISK_FLAGS', expectedLabel: 'RISK AUDIT' },
  { code: 2, expectedName: 'TASK_SUMMARY', expectedLabel: 'DIGEST' },
  { code: 3, expectedName: 'TASK_RAG_IDLE_VERIFICATION', expectedLabel: 'RAG VERIFICATION' },
  { code: 4, expectedName: 'TASK_HISTORICAL_CONTEXT', expectedLabel: 'HISTORY CONTEXT' },
  { code: 5, expectedName: 'TASK_OUTCOME_RECAP', expectedLabel: 'OUTCOME RECAP' },
  { code: 6, expectedName: 'TASK_BOUNTY_COMPOSER_TURN', expectedLabel: 'TASK COMPOSER' },
  { code: 7, expectedName: 'TASK_BOUNTY_REVIEW_CONSULTANT_TURN', expectedLabel: 'REVIEW CONSULTANT' },
  { code: 8, expectedName: 'TASK_BOUNTY_SUBMISSION_SCREEN', expectedLabel: 'SUBMISSION SCREEN' },
  { code: 9, expectedName: 'TASK_AI_GLYPH_GEN', expectedLabel: 'AI GLYPH GEN' },
  { code: 10, expectedName: 'TASK_EXTERNAL_INFERENCE', expectedLabel: 'EXTERNAL INFERENCE' },
  { code: 11, expectedName: 'TASK_EMBEDDING', expectedLabel: 'EMBEDDING' },
  { code: 12, expectedName: 'TASK_ORACLE_VERDICT', expectedLabel: 'ORACLE VERDICT' },
];

async function main() {
  // -------------------------------------------------------------
  // 1. Parsing all 12 task types from OP_RETURN
  // -------------------------------------------------------------
  console.log('--- 1. Testing Indexer OP_RETURN Parsing for 12 Protocol Task Types ---');

  for (const entry of TAXONOMY_MATRIX) {
    await runTest(`parseAiAttestationFromVout decodes typeCode ${entry.code} as ${entry.expectedName}`, () => {
      const vout = buildDummyVout(entry.code);
      const parsed = parseAiAttestationFromVout(vout);

      assert.ok(parsed, `Failed to parse vout with typeCode ${entry.code}`);
      assert.equal(parsed.taskTypeCode, entry.code);
      assert.equal(parsed.taskType, entry.expectedName);
      assert.equal(parsed.workerCount, 3);
      assert.equal(parsed.agreementRatio, 1.0);
      assert.equal(parsed.refBlockHeight, 12345);
    });
  }

  // -------------------------------------------------------------
  // 2. Production UI Label Resolution & Anti-Regression Checks
  // -------------------------------------------------------------
  console.log('\n--- 2. Testing Production UI Display Label Resolution & Regression Prevention ---');

  for (const entry of TAXONOMY_MATRIX) {
    await runTest(`Display label for ${entry.expectedName} is "${entry.expectedLabel}"`, () => {
      const label = resolveAttestationDisplayLabel(entry.expectedName);
      assert.equal(label, entry.expectedLabel);
    });
  }

  await runTest('Anti-regression: TASK_EXTERNAL_INFERENCE is NOT displayed as DIGEST', () => {
    const label = resolveAttestationDisplayLabel('TASK_EXTERNAL_INFERENCE');
    assert.equal(label, 'EXTERNAL INFERENCE');
    assert.notEqual(label, 'DIGEST');
  });

  await runTest('Anti-regression: TASK_EMBEDDING is NOT displayed as DIGEST', () => {
    const label = resolveAttestationDisplayLabel('TASK_EMBEDDING');
    assert.equal(label, 'EMBEDDING');
    assert.notEqual(label, 'DIGEST');
  });

  await runTest('Anti-regression: TASK_ORACLE_VERDICT is NOT displayed as DIGEST', () => {
    const label = resolveAttestationDisplayLabel('TASK_ORACLE_VERDICT');
    assert.equal(label, 'ORACLE VERDICT');
    assert.notEqual(label, 'DIGEST');
    assert.notEqual(label, 'ORACLE_VERDICT');
  });

  // -------------------------------------------------------------
  // 3. True SSOT: Real Block Indexing & Database Attestation Storage
  // -------------------------------------------------------------
  console.log('\n--- 3. Testing True SSOT saveBlockToDb Attestation Storage & Retrieval ---');

  process.env.DAO_API_URL = 'none';
  await initDb(':memory:');

  await runTest('saveBlockToDb indexes and persists QVAI attestation into ai_attestations table', async () => {
    const vout10 = buildDummyVout(10, 100);
    const block100 = {
      hash: 'b_attest_100',
      previous_hash: 'b_attest_99',
      time: 1700000000,
      tx_count: 1,
      size: 500,
      tx: [{
        txid: 'tx_attest_real_001',
        vin: [{ txid: 'funding_tx_attest', vout: 0, scriptSig: { hex: '' } }],
        vout: [
          { value: 10, n: 0, scriptPubKey: { hex: '76a914111111111111111111111111111111111111111188ac', addresses: ['SAttestRecipient1'] } },
          vout10
        ]
      }]
    };

    await saveBlockToDb(block100, 100);

    const row = await db.get('SELECT * FROM ai_attestations WHERE txid = ?', 'tx_attest_real_001');
    assert.ok(row, 'Attestation must be recorded in SQLite ai_attestations table');
    assert.equal(row.task_type_code, 10);
    assert.equal(row.task_type, 'TASK_EXTERNAL_INFERENCE');
    assert.equal(row.block_height, 100);

    // End-to-end verification with production resolver
    const renderedLabel = resolveAttestationDisplayLabel(row.task_type);
    assert.equal(renderedLabel, 'EXTERNAL INFERENCE');
  });

  console.log('\n================================================================');
  console.log(`=== TAXONOMY VERIFICATION: ${passed} PASSED, ${failed} FAILED ===`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
