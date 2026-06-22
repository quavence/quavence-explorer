import { Router } from 'express';
import { db } from '../../db/db.js';
import { getRawTransaction } from '../../indexer/rpc.js';
import { loadTxIoFromIndex } from '../utils/txIo.js';

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

    const io = await loadTxIoFromIndex(txid);

    res.json({
      txid: txDb.txid,
      blockHash: txDb.block_hash,
      blockHeight: txDb.block_height,
      time: txDb.time,
      type: txDb.type,
      confirmations,
      contributors: io.contributors,
      recipients: io.recipients,
      input_total: io.input_total,
      output_total: io.output_total,
      fee: io.fee,
      raw: liveTx,
      _display_version: 6,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
