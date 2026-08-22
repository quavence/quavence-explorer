import { Router } from 'express';
import { db } from '../../db/db.js';
import { getRawTransaction } from '../../indexer/rpc.js';
import { enrichTxAmountFromIndex } from '../utils/txAmount.js';
import {
  enrichRawTxWithContributorAddresses,
  uniqueContributorAddresses,
} from '../utils/txIo.js';

const router = Router();

router.get('/:txid', async (req, res) => {
  try {
    const txid = req.params.txid;

    const txDb = await db.get('SELECT * FROM transactions WHERE txid = ?', txid) as any;

    if (!txDb) {
      return res.status(404).json({ error: 'Transaction not found in index' });
    }

    const heightRow = await db.get('SELECT MAX(height) as height FROM blocks') as { height: number | null } | undefined;
    const currentHeight = heightRow?.height ?? txDb.block_height;
    const confirmations = Math.max(0, currentHeight - txDb.block_height + 1);

    let liveTx = null;
    try {
      liveTx = await getRawTransaction(txid);
    } catch (err) {
      console.warn(`Could not fetch raw tx from RPC for txid ${txid}, falling back to database metadata`);
    }

    const enriched = await enrichTxAmountFromIndex(txDb);
    const contributors = await db.all(`
      SELECT prev_txid, prev_vout_index, address, amount
      FROM spent_utxos
      WHERE spending_txid = ?
      ORDER BY prev_vout_index ASC
    `, txid);
    const fromAddresses = uniqueContributorAddresses(contributors);
    const raw = liveTx
      ? enrichRawTxWithContributorAddresses(liveTx, contributors)
      : null;

    const attestation = await db.get('SELECT * FROM ai_attestations WHERE txid = ?', txid) as any;

    res.json({
      txid: txDb.txid,
      blockHash: txDb.block_hash,
      blockHeight: txDb.block_height,
      time: txDb.time,
      type: txDb.type,
      confirmations,
      contributors,
      from_addresses: fromAddresses,
      recipients: enriched.recipient_outputs ?? [],
      change_outputs: enriched.change_outputs ?? [],
      transfer_amount: enriched.amount_net_transfer,
      change_amount: enriched.change_amount,
      amount_confidence: enriched.amount_confidence,
      input_total: contributors.reduce((sum: number, row: { amount: number }) => sum + Number(row.amount || 0), 0),
      output_total: enriched.amount_raw_output,
      fee: enriched.fee_amount ?? enriched.fee,
      attestation: attestation || null,
      raw,
      _display_version: 8,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
