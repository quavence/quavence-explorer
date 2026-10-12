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
    opVout?: number;
    vin: Array<{ txid: string; vout: number; address?: string }>;
    outputs: Array<{ address: string; sat: number }>;
    glyph: { opLabel: string; opType: number; edition: number; glyphHash: string };
    assignedCarriers?: Set<number>;
  }): Promise<boolean> {
    const h = ++height;
    const { glyph } = tx;
    const opVout = tx.opVout ?? 0;
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
      const assigned = tx.assignedCarriers || new Set<number>();
      const idx = tx.outputs.findIndex((o, i) => !assigned.has(i) && o.sat === 10000 && o.address);
      if (idx === -1) return false;
      carrierAddress = tx.outputs[idx].address;
      carrierVout = idx;
      assigned.add(idx);
    }

    await db.run(
      `INSERT INTO glyphs (txid, op_vout, block_hash, block_height, block_time,
        glyph_hash, edition, op_type, op_label, carrier_address, carrier_vout)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(txid, op_vout) DO UPDATE SET
        block_hash = excluded.block_hash,
        block_height = excluded.block_height,
        block_time = excluded.block_time,
        glyph_hash = excluded.glyph_hash,
        edition = excluded.edition,
        op_type = excluded.op_type,
        op_label = excluded.op_label,
        carrier_address = excluded.carrier_address,
        carrier_vout = excluded.carrier_vout`,
      tx.txid, opVout, 'bh' + h, h, 1789000000, glyph.glyphHash, glyph.edition,
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
  console.log('\n[3] Batched multi-glyph operations in a single transaction (NEW-18)');
  process.env.GLYPH_MINTER_ADDRESS = PROJECT;

  const batchTxid = 'batch_tx_multi_glyph';
  const sharedCarriers = new Set<number>();
  const batchOutputs = [
    { address: PROJECT, sat: 10000 }, // vout 0: carrier for glyph 1
    { address: '', sat: 0 },          // vout 1: OP_RETURN for glyph 1
    { address: VICTIM, sat: 10000 },  // vout 2: carrier for glyph 2
    { address: '', sat: 0 },          // vout 3: OP_RETURN for glyph 2
  ];

  // Op 1 in batch: mint edition 100
  const batchOp1 = await processGlyphTx({
    txid: batchTxid,
    opVout: 1,
    vin: [{ txid: 'proj_batch_fund', vout: 0, address: PROJECT }],
    outputs: batchOutputs,
    glyph: { opLabel: 'CLAIM', opType: 1, edition: 100, glyphHash: HASH_A },
    assignedCarriers: sharedCarriers,
  });
  check('batched glyph op #1 accepted', batchOp1 === true,
    batchOp1 ? 'ok' : 'batched op 1 failed');

  // Op 2 in batch: mint edition 101 in the SAME txid
  const batchOp2 = await processGlyphTx({
    txid: batchTxid,
    opVout: 3,
    vin: [{ txid: 'proj_batch_fund', vout: 0, address: PROJECT }],
    outputs: batchOutputs,
    glyph: { opLabel: 'CLAIM', opType: 1, edition: 101, glyphHash: HASH_A },
    assignedCarriers: sharedCarriers,
  });
  check('batched glyph op #2 accepted in same tx', batchOp2 === true,
    batchOp2 ? 'ok' : 'batched op 2 failed');

  // Verify compound primary key preserved both rows in DB
  const batchRows = await db.all(
    'SELECT txid, op_vout, edition, carrier_vout, carrier_address FROM glyphs WHERE txid = ? ORDER BY op_vout ASC',
    batchTxid
  );
  check('both batched glyph operations preserved in DB (compound PK txid, op_vout)',
    batchRows.length === 2,
    batchRows.length === 2 ? '2 distinct rows stored' : `COLLISION: only ${batchRows.length} row(s) stored`);

  if (batchRows.length === 2) {
    check('batched op #1 assigned to carrier vout 0',
      batchRows[0].op_vout === 1 && batchRows[0].carrier_vout === 0 && batchRows[0].edition === 100,
      `op_vout=${batchRows[0].op_vout}, carrier_vout=${batchRows[0].carrier_vout}, edition=${batchRows[0].edition}`);

    check('batched op #2 assigned to carrier vout 2 (no carrier starvation)',
      batchRows[1].op_vout === 3 && batchRows[1].carrier_vout === 2 && batchRows[1].edition === 101,
      `op_vout=${batchRows[1].op_vout}, carrier_vout=${batchRows[1].carrier_vout}, edition=${batchRows[1].edition}`);
  }

  // Carrier starvation test: 2 glyph ops but only 1 carrier output in tx
  const starvedTxid = 'batch_tx_starved';
  const starvedCarriers = new Set<number>();
  const starvedOutputs = [
    { address: PROJECT, sat: 10000 }, // only one carrier output
    { address: '', sat: 0 },
    { address: '', sat: 0 },
  ];
  const starvedOp1 = await processGlyphTx({
    txid: starvedTxid,
    opVout: 1,
    vin: [{ txid: 'proj_fund_starve', vout: 0, address: PROJECT }],
    outputs: starvedOutputs,
    glyph: { opLabel: 'CLAIM', opType: 1, edition: 200, glyphHash: HASH_A },
    assignedCarriers: starvedCarriers,
  });
  const starvedOp2 = await processGlyphTx({
    txid: starvedTxid,
    opVout: 2,
    vin: [{ txid: 'proj_fund_starve', vout: 0, address: PROJECT }],
    outputs: starvedOutputs,
    glyph: { opLabel: 'CLAIM', opType: 1, edition: 201, glyphHash: HASH_A },
    assignedCarriers: starvedCarriers,
  });
  check('second glyph op rejected when carrier outputs are exhausted in tx',
    starvedOp1 === true && starvedOp2 === false,
    `op1=${starvedOp1}, op2=${starvedOp2}`);

  // Independent lineage transfer of both batched glyphs
  const xfer100 = await processGlyphTx({
    txid: 'xfer_batch_100',
    vin: [{ txid: batchTxid, vout: 0 }],
    outputs: [{ address: VICTIM, sat: 10000 }],
    glyph: { opLabel: 'TRANSFER', opType: 3, edition: 100, glyphHash: HASH_A },
  });
  check('subsequent transfer of batched glyph #1 spending carrier vout 0 accepted', xfer100 === true,
    xfer100 ? 'ok' : 'transfer of glyph #1 broken');

  const xfer101 = await processGlyphTx({
    txid: 'xfer_batch_101',
    vin: [{ txid: batchTxid, vout: 2 }],
    outputs: [{ address: PROJECT, sat: 10000 }],
    glyph: { opLabel: 'TRANSFER', opType: 3, edition: 101, glyphHash: HASH_A },
  });
  check('subsequent transfer of batched glyph #2 spending carrier vout 2 accepted', xfer101 === true,
    xfer101 ? 'ok' : 'transfer of glyph #2 broken');

  const crossTransfer = await processGlyphTx({
    txid: 'cross_xfer_attempt',
    vin: [{ txid: batchTxid, vout: 0 }], // trying to spend carrier of #1 to transfer #101
    outputs: [{ address: ATTACK, sat: 10000 }],
    glyph: { opLabel: 'TRANSFER', opType: 3, edition: 101, glyphHash: HASH_A },
  });
  check('cross-carrier transfer attempt for batched glyph #2 rejected', crossTransfer === false,
    crossTransfer ? 'ACCEPTED - carrier mismatch allowed' : 'rejected');

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

main().catch((e) => { console.error(e); process.exit(1); });

