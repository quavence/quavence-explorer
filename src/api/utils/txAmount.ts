import { db } from '../../db/db.js';
import {
  classifyTransferAmountFromIndexedRows,
  type ClassifiedTransferAmount,
} from '../../indexer/transferAmount.js';
import type { Database } from 'sqlite';

type TxRow = Record<string, unknown> & {
  txid?: string;
  type?: string;
  fee?: number | null;
  amount?: number | null;
  amount_raw_output?: number | null;
  amount_net_transfer?: number | null;
  change_amount?: number | null;
  fee_amount?: number | null;
  amount_kind?: string | null;
  amount_confidence?: string | null;
};

function attachClassifiedFields(tx: TxRow, classified: ClassifiedTransferAmount): Record<string, unknown> {
  return {
    ...tx,
    amount: tx.amount ?? classified.amount_raw_output,
    amount_raw_output: classified.amount_raw_output,
    amount_net_transfer: classified.amount_net_transfer,
    change_amount: classified.change_amount,
    fee_amount: classified.fee_amount,
    fee: tx.fee ?? classified.fee_amount,
    amount_kind: classified.amount_kind,
    amount_confidence: classified.amount_confidence,
    recipient_outputs: classified.recipient_outputs,
    change_outputs: classified.change_outputs,
  };
}

export async function enrichTxAmountFromIndex(
  tx: TxRow,
  database: Database = db,
): Promise<Record<string, unknown>> {
  if (String(tx.type) !== 'normal_transfer' || !tx.txid) {
    return {
      ...tx,
      fee_amount: tx.fee_amount ?? tx.fee ?? null,
    };
  }

  if (tx.amount_confidence) {
    return {
      ...tx,
      amount_raw_output: tx.amount_raw_output ?? tx.amount ?? null,
      amount_net_transfer: tx.amount_net_transfer ?? 0,
      change_amount: tx.change_amount ?? 0,
      fee_amount: tx.fee_amount ?? tx.fee ?? null,
    };
  }

  const spentInputs = await database.all(`
    SELECT address, amount
    FROM spent_utxos
    WHERE spending_txid = ?
  `, tx.txid) as Array<{ address: string; amount: number }>;

  const receivedOutputs = await database.all(`
    SELECT address, amount
    FROM address_transactions
    WHERE txid = ? AND type = 'received'
  `, tx.txid) as Array<{ address: string; amount: number }>;

  const classified = classifyTransferAmountFromIndexedRows({
    spentInputs,
    receivedOutputs,
    feeAmount: Number(tx.fee || 0),
  });

  return attachClassifiedFields(tx, classified);
}

export async function backfillTxAmountColumns(
  tx: TxRow,
  database: Database = db,
): Promise<ClassifiedTransferAmount | null> {
  if (String(tx.type) !== 'normal_transfer' || !tx.txid) return null;

  const enriched = await enrichTxAmountFromIndex(tx, database);
  await database.run(`
    UPDATE transactions
    SET amount_raw_output = ?,
        amount_net_transfer = ?,
        change_amount = ?,
        fee_amount = ?,
        amount_kind = ?,
        amount_confidence = ?
    WHERE txid = ?
  `,
    enriched.amount_raw_output,
    enriched.amount_net_transfer,
    enriched.change_amount,
    enriched.fee_amount,
    enriched.amount_kind,
    enriched.amount_confidence,
    tx.txid,
  );

  return {
    amount_raw_output: Number(enriched.amount_raw_output || 0),
    amount_net_transfer: Number(enriched.amount_net_transfer || 0),
    change_amount: Number(enriched.change_amount || 0),
    fee_amount: Number(enriched.fee_amount || 0),
    amount_kind: String(enriched.amount_kind || 'unknown_output') as ClassifiedTransferAmount['amount_kind'],
    amount_confidence: String(enriched.amount_confidence || 'unknown') as ClassifiedTransferAmount['amount_confidence'],
    recipient_outputs: (enriched.recipient_outputs as ClassifiedTransferAmount['recipient_outputs']) || [],
    change_outputs: (enriched.change_outputs as ClassifiedTransferAmount['change_outputs']) || [],
  };
}
