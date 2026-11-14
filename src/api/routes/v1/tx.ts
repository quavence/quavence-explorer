import { Router, Request, Response } from 'express';
import { db } from '../../../db/db.js';
import { getRawTransaction, callRpc } from '../../../indexer/rpc.js';
import { QUAVENCE } from '../../../config.js';

const router = Router();

/**
 * GET /api/v1/tx/:txid
 * Standard exchange transaction lookup with confirmation tracking
 */
router.get('/:txid', async (req: Request, res: Response) => {
  try {
    const txid = req.params.txid;

    if (!/^[0-9a-fA-F]{64}$/.test(txid)) {
      return res.status(400).json({ error: 'Invalid txid format' });
    }

    const txDb = await db.get('SELECT * FROM transactions WHERE txid = ?', txid) as any;

    let liveTx: any = null;
    try {
      liveTx = await getRawTransaction(txid);
    } catch {
      // Node may be syncing or offline, proceed with database index
    }

    if (!txDb && !liveTx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const heightRow = await db.get('SELECT MAX(height) as height FROM blocks') as { height: number | null } | undefined;
    const currentHeight = heightRow?.height ?? 0;

    const blockHeight = txDb?.block_height ?? (liveTx?.confirmations ? currentHeight - liveTx.confirmations + 1 : null);
    const blockHash = txDb?.block_hash ?? liveTx?.blockhash ?? null;
    const time = txDb?.time ?? liveTx?.time ?? Math.floor(Date.now() / 1000);

    const confirmations = blockHeight !== null && blockHeight > 0
      ? Math.max(0, currentHeight - blockHeight + 1)
      : (liveTx?.confirmations ?? 0);

    // Build inputs
    let inputs: any[] = [];
    if (liveTx && Array.isArray(liveTx.vin)) {
      inputs = liveTx.vin.map((vin: any) => ({
        txid: vin.txid ?? null,
        vout: vin.vout ?? null,
        coinbase: vin.coinbase ?? null,
        scriptSig: vin.scriptSig ? vin.scriptSig.hex : null,
        sequence: vin.sequence ?? null,
      }));
    } else {
      const dbSpent = await db.all(`
        SELECT prev_txid, prev_vout_index, address, amount
        FROM spent_utxos
        WHERE spending_txid = ?
        ORDER BY prev_vout_index ASC
      `, txid) as any[];

      inputs = dbSpent.map((s) => ({
        txid: s.prev_txid,
        vout: s.prev_vout_index,
        address: s.address,
        amount: s.amount,
        amountFormatted: (s.amount / QUAVENCE.coin).toFixed(8),
      }));
    }

    // Build outputs
    let outputs: any[] = [];
    if (liveTx && Array.isArray(liveTx.vout)) {
      outputs = liveTx.vout.map((vout: any) => {
        const satValue = Math.round((vout.value || 0) * QUAVENCE.coin);
        return {
          n: vout.n,
          amount: satValue,
          amountFormatted: Number(vout.value || 0).toFixed(8),
          scriptPubKey: {
            asm: vout.scriptPubKey?.asm,
            hex: vout.scriptPubKey?.hex,
            addresses: vout.scriptPubKey?.addresses || (vout.scriptPubKey?.address ? [vout.scriptPubKey.address] : []),
            type: vout.scriptPubKey?.type,
          },
        };
      });
    } else {
      const dbOutputs = await db.all(`
        SELECT vout_index, address, amount
        FROM utxos
        WHERE txid = ?
        ORDER BY vout_index ASC
      `, txid) as any[];

      outputs = dbOutputs.map((o) => ({
        n: o.vout_index,
        amount: o.amount,
        amountFormatted: (o.amount / QUAVENCE.coin).toFixed(8),
        address: o.address,
      }));
    }

    res.json({
      txid,
      blockHash,
      blockHeight,
      confirmations,
      time,
      inputs,
      outputs,
    });
  } catch (error: any) {
    console.error('[API Error in /api/v1/tx/:txid]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/v1/tx/broadcast
 * Broadcast signed raw transaction hex to Quavence L1 network
 * Strict Invariant 4: Fast reject non-hex / malformed payloads with 400 Bad Request
 */
router.post('/broadcast', async (req: Request, res: Response) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Invalid raw transaction hex string' });
    }

    const rawtx = (req.body.rawtx ?? req.body.hex ?? req.body.tx);

    // Fast-fail validation: string check, minimum byte length, even length, valid hex chars
    if (
      typeof rawtx !== 'string' ||
      rawtx.trim().length === 0 ||
      rawtx.length < 20 ||
      rawtx.length % 2 !== 0 ||
      !/^[0-9a-fA-F]+$/.test(rawtx)
    ) {
      return res.status(400).json({ error: 'Invalid raw transaction hex string' });
    }

    const cleanHex = rawtx.trim();

    try {
      const broadcastTxid = await callRpc('sendrawtransaction', [cleanHex]);
      return res.json({
        txid: broadcastTxid,
        status: 'broadcasted',
      });
    } catch (rpcError: any) {
      const errMsg = rpcError?.message || 'Transaction rejected by node mempool';
      return res.status(400).json({
        error: errMsg,
        status: 'rejected',
      });
    }
  } catch (error: any) {
    console.error('[API Error in /api/v1/tx/broadcast]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
