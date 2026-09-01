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

    let recipients: any[] = Array.isArray(enriched.recipient_outputs) ? enriched.recipient_outputs : [];
    const changeOutputs: any[] = Array.isArray(enriched.change_outputs) ? enriched.change_outputs : [];

    if (recipients.length === 0 && changeOutputs.length === 0) {
      const indexedOutputs = await db.all(`
        SELECT address, amount, vout_index
        FROM utxos
        WHERE txid = ?
        ORDER BY vout_index ASC
      `, txid);

      if (indexedOutputs && indexedOutputs.length > 0) {
        recipients = indexedOutputs;
      } else if (raw?.vout) {
        recipients = raw.vout
          .filter((v: any) => Number(v.value || 0) > 0 && (v.scriptPubKey?.addresses?.[0] || v.scriptPubKey?.address))
          .map((v: any, idx: number) => ({
            address: v.scriptPubKey?.addresses?.[0] || v.scriptPubKey?.address,
            amount: Math.round(Number(v.value) * 1e8),
            vout_index: v.n ?? idx,
          }));
      }
    }

    const outputTotal = (enriched as any).amount_raw_output ?? txDb.amount_raw_output ?? [...recipients, ...changeOutputs].reduce((sum: number, r: { amount: number }) => sum + Number(r.amount || 0), 0);

    res.json({
      txid: txDb.txid,
      blockHash: txDb.block_hash,
      blockHeight: txDb.block_height,
      time: txDb.time,
      type: txDb.type,
      confirmations,
      contributors,
      from_addresses: fromAddresses,
      recipients,
      change_outputs: enriched.change_outputs ?? [],
      transfer_amount: enriched.amount_net_transfer,
      change_amount: enriched.change_amount,
      amount_confidence: enriched.amount_confidence,
      input_total: contributors.reduce((sum: number, row: { amount: number }) => sum + Number(row.amount || 0), 0),
      output_total: outputTotal,
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
