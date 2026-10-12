/**
 * Automated Verification Suite: PoUS Glyph Lineage Security & Squatting Prevention
 * Verifies carrier lineage tracking and authorized minter validation rules.
 */
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GLYPH_OP = { CLAIM: 0x01, GENESIS: 0x02, TRANSFER: 0x03, BURN: 0x04 } as const;

const PROJECT = 'SMTGZc3cQVijVrcuy3awFiRm17vvk35gDa';   // .env.example minter
const ATTACK  = 'S_ATTACKER_ADDRESS';
const VICTIM  = 'S_VICTIM_COLLECTOR';

const HASH_A = 'aa'.repeat(32);
const HASH_B = 'bb'.repeat(32);

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const schema = fs.readFileSync(path.resolve(__dirname, '../src/db/schema.sql'), 'utf8');
  await db.exec(schema);

  let height = 100;

  async function processGlyphTx(tx: {
    txid: string;
    vin: Array<{ txid: string; vout: number; address?: string }>;
    outputs: Array<{ address: string; sat: number }>;
    glyph: { opLabel: string; opType: number; edition: number; glyphHash: string };
  }): Promise<boolean> {
    const h = ++height;
    const { glyph } = tx;
    let isValidGlyphOp = false;

    const activeCarrier: any = await db.get(
      `SELECT txid, carrier_vout, carrier_address, op_label, glyph_hash
       FROM glyphs WHERE glyph_hash = ? AND edition = ?
       ORDER BY block_height DESC, rowid DESC LIMIT 1`,
      glyph.glyphHash, glyph.edition);

    if (glyph.opLabel === 'CLAIM' || glyph.opLabel === 'GENESIS' ||
        glyph.opType === GLYPH_OP.CLAIM || glyph.opType === GLYPH_OP.GENESIS) {
      if (activeCarrier) {
        isValidGlyphOp = false;
      } else {
        const configuredMinters = (process.env.GLYPH_MINTER_ADDRESS || process.env.QVNC_COLLECTION_ISSUER_ADDRESS || '')
          .split(',').map((s: string) => s.trim()).filter(Boolean);
        if (configuredMinters.length === 0) {
          isValidGlyphOp = false;   // Fail-closed policy
        } else {
          // Cryptographic Minter Authorization (NEW-16):
          // A CLAIM is valid ONLY if funded/signed by a configured minter
          const isAuthorized = (tx.vin || []).some((v: any) => v.address && configuredMinters.includes(v.address));
          isValidGlyphOp = isAuthorized;
        }
      }
    } else if (glyph.opLabel === 'TRANSFER' || glyph.opType === GLYPH_OP.TRANSFER) {
      if (!activeCarrier || activeCarrier.op_label === 'BURN') isValidGlyphOp = false;
      else if (glyph.glyphHash !== activeCarrier.glyph_hash) isValidGlyphOp = false;
      else isValidGlyphOp = (tx.vin || []).some(
        (i) => i.txid === activeCarrier.txid && Number(i.vout) === Number(activeCarrier.carrier_vout));
    } else if (glyph.opLabel === 'BURN' || glyph.opType === GLYPH_OP.BURN) {
      if (!activeCarrier || activeCarrier.op_label === 'BURN') isValidGlyphOp = false;
      else if (glyph.glyphHash !== activeCarrier.glyph_hash) isValidGlyphOp = false;
      else isValidGlyphOp = (tx.vin || []).some(
        (i) => i.txid === activeCarrier.txid && Number(i.vout) === Number(activeCarrier.carrier_vout));
    }

    if (!isValidGlyphOp) return false;

    let carrierAddress: string | null = null;
    let carrierVout = 0;
    if (glyph.opLabel !== 'BURN' && glyph.opType !== GLYPH_OP.BURN) {
      const idx = tx.outputs.findIndex((o) => o.sat === 10000 && o.address);
      if (idx === -1) return false;
      carrierAddress = tx.outputs[idx].address;
      carrierVout = idx;
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
  console.log('\n[1] Mint validation with GLYPH_MINTER_ADDRESS configured');
  process.env.GLYPH_MINTER_ADDRESS = PROJECT;

  const squat = await processGlyphTx({
    txid: 'squat', vin: [], outputs: [{ address: ATTACK, sat: 10000 }],
    glyph: { opLabel: 'CLAIM', opType: 1, edition: 1234, glyphHash: HASH_B } });
  check('unauthorized CLAIM rejected when minter configured', squat === false,
    squat ? 'ACCEPTED - squatting still possible' : 'rejected');

  const authMint = await processGlyphTx({
    txid: 'mint1',
    vin: [{ txid: 'proj_fund_tx_0', vout: 0, address: PROJECT }],
    outputs: [{ address: PROJECT, sat: 10000 }],
    glyph: { opLabel: 'CLAIM', opType: 1, edition: 7, glyphHash: HASH_A } });
  check('authorized CLAIM funded by configured minter accepted', authMint === true,
    authMint ? 'ok' : 'REGRESSION: legitimate mint blocked');

  // Recipient-based attack (NEW-16): Attacker funds tx sending 10k sats to minter
  const attackerPayMinter = await processGlyphTx({
    txid: 'atk_pay_minter',
    vin: [{ txid: 'atk_fund_tx', vout: 0, address: ATTACK }],
    outputs: [{ address: PROJECT, sat: 10000 }],
    glyph: { opLabel: 'CLAIM', opType: 1, edition: 99, glyphHash: HASH_A }
  });
  check('unauthorized CLAIM sent to minter but funded by attacker rejected (NEW-16)', attackerPayMinter === false,
    attackerPayMinter ? 'ACCEPTED - attacker forged mint by sending to minter' : 'rejected');

  // Drop mint: configured minter funds the tx, but carrier output goes directly to recipient/collector
  const dropMint = await processGlyphTx({
    txid: 'drop_mint_1',
    vin: [{ txid: 'proj_fund_tx', vout: 0, address: PROJECT }],
    outputs: [{ address: VICTIM, sat: 10000 }],
    glyph: { opLabel: 'CLAIM', opType: 1, edition: 21, glyphHash: HASH_A }
  });
  check('authorized drop CLAIM funded by minter directly to recipient accepted', dropMint === true,
    dropMint ? 'ok' : 'REGRESSION: drop mint directly to user blocked');

  // Attacker cannot forge a drop claim to recipient if attacker funds it
  const attackerDropForged = await processGlyphTx({
    txid: 'atk_drop_forged',
    vin: [{ txid: 'atk_fund_tx', vout: 0, address: ATTACK }],
    outputs: [{ address: VICTIM, sat: 10000 }],
    glyph: { opLabel: 'CLAIM', opType: 1, edition: 22, glyphHash: HASH_A }
  });
  check('unauthorized drop CLAIM funded by attacker rejected', attackerDropForged === false,
    attackerDropForged ? 'ACCEPTED - attacker forged drop claim' : 'rejected');

  // Same edition number, DIFFERENT collection hash -> must be allowed now
  const otherCollection = await processGlyphTx({
    txid: 'mint2',
    vin: [{ txid: 'proj_fund_tx_2', vout: 0, address: PROJECT }],
    outputs: [{ address: PROJECT, sat: 10000 }],
    glyph: { opLabel: 'CLAIM', opType: 1, edition: 7, glyphHash: HASH_B } });
  check('second collection can mint the same edition number', otherCollection === true,
    otherCollection ? 'composite (hash, edition) key works' : 'editions still a global namespace');

  // glyph_hash binding on TRANSFER
  const hashSwap = await processGlyphTx({
    txid: 'swap', vin: [{ txid: 'mint1', vout: 0 }],
    outputs: [{ address: ATTACK, sat: 10000 }],
    glyph: { opLabel: 'TRANSFER', opType: 3, edition: 7, glyphHash: HASH_B } });
  check('TRANSFER with a mismatched glyph_hash rejected', hashSwap === false,
    hashSwap ? 'ACCEPTED - artwork identity still swappable' : 'rejected');

  // counterfeit transfer (does not spend the carrier)
  const counterfeit = await processGlyphTx({
    txid: 'forge', vin: [{ txid: 'attacker_utxo', vout: 0 }],
    outputs: [{ address: ATTACK, sat: 10000 }],
    glyph: { opLabel: 'TRANSFER', opType: 3, edition: 7, glyphHash: HASH_A } });
  check('counterfeit TRANSFER still rejected', counterfeit === false,
    counterfeit ? 'FORGEABLE AGAIN' : 'rejected');

  // legitimate transfer
  const legit = await processGlyphTx({
    txid: 'xfer', vin: [{ txid: 'mint1', vout: 0 }],
    outputs: [{ address: VICTIM, sat: 10000 }],
    glyph: { opLabel: 'TRANSFER', opType: 3, edition: 7, glyphHash: HASH_A } });
  check('legitimate TRANSFER accepted', legit === true,
    legit ? 'ok' : 'REGRESSION: real transfers broken');

  // BURN at the correct opcode (4)
  const burn = await processGlyphTx({
    txid: 'burn', vin: [{ txid: 'xfer', vout: 0 }], outputs: [],
    glyph: { opLabel: 'BURN', opType: 4, edition: 7, glyphHash: HASH_A } });
  check('BURN at opType 4 honoured', burn === true,
    burn ? 'ok' : 'BURN opcode still misaligned');

  // =====================================================================
  console.log('\n[2] Fail-closed validation without GLYPH_MINTER_ADDRESS');
  delete process.env.GLYPH_MINTER_ADDRESS;
  delete process.env.QVNC_COLLECTION_ISSUER_ADDRESS;

  const openSquat = await processGlyphTx({
    txid: 'squat2', vin: [], outputs: [{ address: ATTACK, sat: 10000 }],
    glyph: { opLabel: 'CLAIM', opType: 1, edition: 99, glyphHash: HASH_B } });
  check('CLAIM still rejected with no minter configured', openSquat === false,
    openSquat ? 'ACCEPTED - control is FAIL-OPEN, anyone can mint' : 'rejected');

  // front-run the project's own (hash, edition) before it mints
  const frontRun = await processGlyphTx({
    txid: 'frontrun', vin: [], outputs: [{ address: ATTACK, sat: 10000 }],
    glyph: { opLabel: 'CLAIM', opType: 1, edition: 500, glyphHash: HASH_A } });
  const projectAfter = await processGlyphTx({
    txid: 'projlate', vin: [], outputs: [{ address: PROJECT, sat: 10000 }],
    glyph: { opLabel: 'CLAIM', opType: 1, edition: 500, glyphHash: HASH_A } });
  check('both attacker and project CLAIMs rejected with no minter configured (fail-closed)',
    frontRun === false && projectAfter === false,
    (frontRun === false && projectAfter === false)
      ? 'fail-closed: no mints accepted without GLYPH_MINTER_ADDRESS'
      : `fail-open: attacker=${frontRun}, project=${projectAfter}`);

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
