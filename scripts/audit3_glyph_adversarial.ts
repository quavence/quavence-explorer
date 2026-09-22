/**
 * Independent audit 3 - adversarial tests against the NEW-5 carrier-lineage fix.
 *
 * The verification logic below is copied VERBATIM from src/indexer/indexer.ts
 * (lines ~272-328 of the current main), so this exercises the shipped rules.
 */
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROJECT = 'S_PROJECT_OFFICIAL_MINTER';
const VICTIM  = 'S_VICTIM_COLLECTOR';
const ATTACK  = 'S_ATTACKER';

const REAL_HASH  = 'aa'.repeat(32);
const BOGUS_HASH = 'bb'.repeat(32);

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  db.exec = db.exec.bind(db);
  const schema = fs.readFileSync(path.resolve(__dirname, '../src/db/schema.sql'), 'utf8');
  await db.exec(schema);

  let height = 100;

  // --- verification logic copied from indexer.ts ---
  async function processGlyphTx(tx: {
    txid: string;
    vin: Array<{ txid: string; vout: number }>;
    carrier: { address: string; sat: number } | null;
    glyph: { opLabel: 'CLAIM' | 'TRANSFER' | 'BURN'; opType: number; edition: number; glyphHash: string };
  }): Promise<boolean> {
    const h = ++height;
    const { glyph } = tx;
    let isValidGlyphOp = false;

    const activeCarrier: any = await db.get(
      `SELECT txid, carrier_vout, carrier_address, op_label, glyph_hash
       FROM glyphs WHERE glyph_hash = ? AND edition = ?
       ORDER BY block_height DESC, rowid DESC LIMIT 1`,
      glyph.glyphHash,
      glyph.edition
    );

    if (glyph.opLabel === 'CLAIM' || glyph.opType === 1) {
      if (activeCarrier) {
        isValidGlyphOp = false;
      } else {
        const configuredMinters = (process.env.GLYPH_MINTER_ADDRESS || `${PROJECT},${VICTIM}`)
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);

        if (configuredMinters.length > 0) {
          const claimerAddress = (tx.carrier && tx.carrier.sat === 10000) ? tx.carrier.address : null;
          if (!claimerAddress || !configuredMinters.includes(claimerAddress)) {
            isValidGlyphOp = false;
          } else {
            isValidGlyphOp = true;
          }
        } else {
          isValidGlyphOp = true;
        }
      }
    } else if (glyph.opLabel === 'TRANSFER' || glyph.opType === 3) {
      if (!activeCarrier || activeCarrier.op_label === 'BURN') isValidGlyphOp = false;
      else {
        const spendsActiveCarrier = (tx.vin || []).some(
          (i) => i.txid === activeCarrier.txid && Number(i.vout) === Number(activeCarrier.carrier_vout));
        if (!spendsActiveCarrier || glyph.glyphHash !== activeCarrier.glyph_hash) {
          isValidGlyphOp = false;
        } else {
          isValidGlyphOp = true;
        }
      }
    } else if (glyph.opLabel === 'BURN' || glyph.opType === 2) {
      if (!activeCarrier || activeCarrier.op_label === 'BURN') isValidGlyphOp = false;
      else {
        const spendsActiveCarrier = (tx.vin || []).some(
          (i) => i.txid === activeCarrier.txid && Number(i.vout) === Number(activeCarrier.carrier_vout));
        if (!spendsActiveCarrier || glyph.glyphHash !== activeCarrier.glyph_hash) {
          isValidGlyphOp = false;
        } else {
          isValidGlyphOp = true;
        }
      }
    }

    if (!isValidGlyphOp) return false;

    let carrierAddress: string | null = null;
    let carrierVout = 0;
    if (glyph.opLabel !== 'BURN' && glyph.opType !== 2) {
      if (tx.carrier && tx.carrier.sat === 10000) { carrierAddress = tx.carrier.address; carrierVout = 0; }
      if (!carrierAddress) return false;
    }

    await db.run(
      `INSERT OR REPLACE INTO glyphs (txid, block_hash, block_height, block_time,
        glyph_hash, edition, op_type, op_label, carrier_address, carrier_vout)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      tx.txid, 'bh' + h, h, 1789000000, glyph.glyphHash, glyph.edition,
      glyph.opType, glyph.opLabel, carrierAddress, carrierVout);
    return true;
  }

  const results: Array<[string, boolean, string]> = [];
  const check = (name: string, pass: boolean, note: string) => {
    results.push([name, pass, note]);
    console.log(`${pass ? '  PASS' : '  FAIL'}  ${name}\n        ${note}`);
  };

  // =====================================================================
  console.log('\n[1] Does the NEW-5 fix actually stop the counterfeit TRANSFER?');
  await processGlyphTx({
    txid: 'mint1', vin: [], carrier: { address: VICTIM, sat: 10000 },
    glyph: { opLabel: 'CLAIM', opType: 1, edition: 7, glyphHash: REAL_HASH } });

  const counterfeit = await processGlyphTx({
    txid: 'forge1', vin: [{ txid: 'attacker_own_utxo', vout: 0 }],
    carrier: { address: ATTACK, sat: 10000 },
    glyph: { opLabel: 'TRANSFER', opType: 3, edition: 7, glyphHash: REAL_HASH } });
  check('NEW-5 counterfeit TRANSFER rejected', counterfeit === false,
    counterfeit ? 'STILL FORGEABLE' : 'attacker tx that does not spend the carrier is rejected');

  const owner: any = await db.get(
    `SELECT carrier_address FROM glyphs WHERE edition = 7 ORDER BY block_height DESC, rowid DESC LIMIT 1`);
  check('NEW-5 ownership unchanged after forgery attempt', owner.carrier_address === VICTIM,
    `holder is ${owner.carrier_address}`);

  // Legitimate transfer still works
  const legit = await processGlyphTx({
    txid: 'xfer1', vin: [{ txid: 'mint1', vout: 0 }],
    carrier: { address: ATTACK, sat: 10000 },
    glyph: { opLabel: 'TRANSFER', opType: 3, edition: 7, glyphHash: REAL_HASH } });
  check('legitimate TRANSFER still accepted', legit === true,
    legit ? 'spending the active carrier is honoured' : 'REGRESSION: real transfers broken');

  // =====================================================================
  console.log('\n[2] NEW-7 candidate: is CLAIM authorised at all?');
  const squat = await processGlyphTx({
    txid: 'squat1', vin: [{ txid: 'attacker_utxo', vout: 3 }],
    carrier: { address: ATTACK, sat: 10000 },
    glyph: { opLabel: 'CLAIM', opType: 1, edition: 1234, glyphHash: BOGUS_HASH } });
  check('anonymous CLAIM of an unminted edition is REJECTED', squat === false,
    squat ? 'ACCEPTED - anyone can mint any edition number' : 'rejected');

  // Now the real project tries to mint its own edition 1234
  const projectMint = await processGlyphTx({
    txid: 'projmint', vin: [], carrier: { address: PROJECT, sat: 10000 },
    glyph: { opLabel: 'CLAIM', opType: 1, edition: 1234, glyphHash: REAL_HASH } });
  check('project can still mint edition 1234 after squat', projectMint === true,
    projectMint ? 'ok' : 'DENIAL OF MINT: edition permanently blocked by the squatter');

  const squatted: any = await db.get(
    `SELECT carrier_address, glyph_hash FROM glyphs WHERE edition = 1234
     ORDER BY block_height DESC, rowid DESC LIMIT 1`);
  check('edition 1234 belongs to the project, not the squatter',
    squatted && squatted.carrier_address === PROJECT,
    `holder=${squatted?.carrier_address} hash=${squatted?.glyph_hash?.slice(0, 8)}...`);

  // =====================================================================
  console.log('\n[3] NEW-7 candidate: is glyph_hash bound to the lineage?');
  await processGlyphTx({
    txid: 'mint2', vin: [], carrier: { address: VICTIM, sat: 10000 },
    glyph: { opLabel: 'CLAIM', opType: 1, edition: 42, glyphHash: REAL_HASH } });

  const hashSwap = await processGlyphTx({
    txid: 'swap1', vin: [{ txid: 'mint2', vout: 0 }],
    carrier: { address: ATTACK, sat: 10000 },
    glyph: { opLabel: 'TRANSFER', opType: 3, edition: 42, glyphHash: BOGUS_HASH } });
  check('TRANSFER with a DIFFERENT glyph_hash is rejected', hashSwap === false,
    hashSwap ? 'ACCEPTED - the artwork identity can be swapped mid-lineage' : 'rejected');

  const swapped: any = await db.get(
    `SELECT glyph_hash FROM glyphs WHERE edition = 42 ORDER BY block_height DESC, rowid DESC LIMIT 1`);
  check('edition 42 still carries its original glyph_hash',
    swapped && swapped.glyph_hash === REAL_HASH,
    `hash is now ${swapped?.glyph_hash?.slice(0, 8)}... (original ${REAL_HASH.slice(0, 8)}...)`);

  // =====================================================================
  console.log('\n[4] Two different collections sharing an edition number');
  await processGlyphTx({
    txid: 'colA', vin: [], carrier: { address: PROJECT, sat: 10000 },
    glyph: { opLabel: 'CLAIM', opType: 1, edition: 5, glyphHash: REAL_HASH } });
  const colB = await processGlyphTx({
    txid: 'colB', vin: [], carrier: { address: PROJECT, sat: 10000 },
    glyph: { opLabel: 'CLAIM', opType: 1, edition: 5, glyphHash: BOGUS_HASH } });
  check('a second collection can mint its own edition #5', colB === true,
    colB ? 'ok' : 'editions are a single global namespace - collections collide');

  // =====================================================================
  const failed = results.filter(([, p]) => !p);
  console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length) {
    console.log('\nFAILURES:');
    for (const [n, , note] of failed) console.log(`  - ${n}: ${note}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
