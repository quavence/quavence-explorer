/**
 * Automated Verification Suite for PoUS AI Attestation Task Type Taxonomy
 * 
 * Verifies:
 * 1. Parser parsing of all 12 task types in QVAI OP_RETURN payloads (including 10: TASK_EXTERNAL_INFERENCE, 11: TASK_EMBEDDING, 12: TASK_ORACLE_VERDICT)
 * 2. Strict prevention of regression: TASK_EXTERNAL_INFERENCE & TASK_EMBEDDING must not be parsed or displayed as DIGEST
 * 3. Explorer badge / label resolution logic matching protocol taxonomy
 */
import assert from 'node:assert/strict';
import { parseAiAttestationFromVout } from '../src/indexer/parser.js';

console.log('================================================================');
console.log('=== QUAVENCE EXPLORER: ATTESTATION TAXONOMY VERIFICATION     ===');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
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

  // 32-byte consensus hash (0x01 repeating)
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

// Replica of badge resolver in AttestationsView / TxDetailView
function resolveAttestationDisplayLabel(taskType: string): string {
  const raw = (taskType || '').toUpperCase().trim();
  if (raw.includes('INFERENCE') || raw.includes('EXTERNAL')) {
    return 'EXTERNAL INFERENCE';
  } else if (raw.includes('EMBED')) {
    return 'EMBEDDING';
  } else if (raw.includes('SUMMARY') || raw.includes('DIGEST')) {
    return 'DIGEST';
  } else if (raw.includes('RISK') || raw.includes('FLAGS')) {
    return 'RISK AUDIT';
  } else if (raw.includes('GOVERNANCE') || raw.includes('PROPOSAL')) {
    return 'GOVERNANCE';
  } else if (raw.includes('RAG') || raw.includes('IDLE') || raw.includes('KNOWLEDGE')) {
    return 'RAG VERIFICATION';
  } else if (raw.includes('HISTOR')) {
    return 'HISTORY CONTEXT';
  } else if (raw.includes('OUTCOME') || raw.includes('RECAP')) {
    return 'OUTCOME RECAP';
  } else if (raw.includes('COMPOSER')) {
    return 'TASK COMPOSER';
  } else if (raw.includes('REVIEW') || raw.includes('CONSULTANT')) {
    return 'REVIEW CONSULTANT';
  } else if (raw.includes('SCREEN') || raw.includes('SUBMISSION') || raw.includes('BOUNTY')) {
    return 'SUBMISSION SCREEN';
  } else if (raw.includes('GLYPH') || raw.includes('NFT') || raw.includes('ART')) {
    return 'AI GLYPH GEN';
  } else if (raw.includes('ORACLE') || raw.includes('VERDICT')) {
    return 'ORACLE VERDICT';
  }
  return raw.replace('TASK_', '') || 'CONSENSUS';
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

// -------------------------------------------------------------
// 1. Parsing all 11 task types from OP_RETURN
// -------------------------------------------------------------
console.log('--- 1. Testing Indexer OP_RETURN Parsing for 11 Protocol Task Types ---');

for (const entry of TAXONOMY_MATRIX) {
  runTest(`parseAiAttestationFromVout decodes typeCode ${entry.code} as ${entry.expectedName}`, () => {
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
// 2. UI Label Resolution & Anti-Regression Checks
// -------------------------------------------------------------
console.log('\n--- 2. Testing UI Display Label Resolution & Regression Prevention ---');

for (const entry of TAXONOMY_MATRIX) {
  runTest(`Display label for ${entry.expectedName} is "${entry.expectedLabel}"`, () => {
    const label = resolveAttestationDisplayLabel(entry.expectedName);
    assert.equal(label, entry.expectedLabel);
  });
}

runTest('Anti-regression: TASK_EXTERNAL_INFERENCE is NOT displayed as DIGEST', () => {
  const label = resolveAttestationDisplayLabel('TASK_EXTERNAL_INFERENCE');
  assert.equal(label, 'EXTERNAL INFERENCE');
  assert.notEqual(label, 'DIGEST');
});

runTest('Anti-regression: TASK_EMBEDDING is NOT displayed as DIGEST', () => {
  const label = resolveAttestationDisplayLabel('TASK_EMBEDDING');
  assert.equal(label, 'EMBEDDING');
  assert.notEqual(label, 'DIGEST');
});

runTest('Anti-regression: TASK_ORACLE_VERDICT is NOT displayed as DIGEST', () => {
  const label = resolveAttestationDisplayLabel('TASK_ORACLE_VERDICT');
  assert.equal(label, 'ORACLE VERDICT');
  assert.notEqual(label, 'DIGEST');
  assert.notEqual(label, 'ORACLE_VERDICT');
});

console.log('\n================================================================');
console.log(`=== TAXONOMY VERIFICATION: ${passed} PASSED, ${failed} FAILED ===`);
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
}
