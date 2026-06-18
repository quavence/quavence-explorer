import { Router } from 'express';
import { db } from '../../db/db.js';
import { getRawTransaction } from '../../indexer/rpc.js';
import { enrichTxAmountFromIndex } from '../utils/txAmount.js';

const router = Router();

router.get('/:txid', async (req, res) => {
  try {
    const txid = req.params.txid;

    // Fetch database transaction metadata
    const txDb = await db.get('SELECT * FROM transactions WHERE txid = ?', txid) as any;

    if (!txDb) {
      return res.status(404).json({ error: 'Transaction not found in index' });
    }

    const heightRow = await db.get('SELECT MAX(height) as height FROM blocks') as { height: number | null } | undefined;
    const currentHeight = heightRow?.height ?? txDb.block_height;
    const confirmations = Math.max(0, currentHeight - txDb.block_height + 1);

    // Try fetching live rich JSON transaction outputs/inputs from RPC
    let liveTx = null;
    try {
      liveTx = await getRawTransaction(txid);
    } catch (err) {
      console.warn(`Could not fetch raw tx from RPC for txid ${txid}, falling back to database metadata`);
    }

    const enriched = await enrichTxAmountFromIndex(txDb);

    res.json({
      txid: enriched.txid,
      blockHash: enriched.block_hash,
      blockHeight: enriched.block_height,
      time: enriched.time,
      type: enriched.type,
      amount: enriched.amount,
      fee: enriched.fee,
      amount_raw_output: enriched.amount_raw_output,
      amount_net_transfer: enriched.amount_net_transfer,
      change_amount: enriched.change_amount,
      fee_amount: enriched.fee_amount,
      amount_kind: enriched.amount_kind,
      amount_confidence: enriched.amount_confidence,
      recipient_outputs: enriched.recipient_outputs,
      change_outputs: enriched.change_outputs,
      confirmations,
      raw: liveTx,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
