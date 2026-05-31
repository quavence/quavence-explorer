import { Router } from 'express';
import { db } from '../../db/db.js';
import { getRawTransaction } from '../../indexer/rpc.js';

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

    res.json({
      txid: txDb.txid,
      blockHash: txDb.block_hash,
      blockHeight: txDb.block_height,
      time: txDb.time,
      type: txDb.type,
      amount: txDb.amount,
      fee: txDb.fee,
      confirmations,
      raw: liveTx,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
