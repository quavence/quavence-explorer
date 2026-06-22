import { db } from '../../db/db.js';
import type { Database } from 'sqlite';

export interface TxContributor {
  address: string;
  amount: number;
  prev_txid: string;
  prev_vout_index: number;
}

export interface TxRecipient {
  address: string;
  amount: number;
  vout_index: number;
}

export interface TxIoSummary {
  contributors: TxContributor[];
  recipients: TxRecipient[];
  input_total: number;
  output_total: number;
  fee: number;
}

function mergeRecipients(
  utxoOutputs: Array<{ address: string; amount: number; vout_index: number }>,
  addressReceived: Array<{ address: string; amount: number }>,
): TxRecipient[] {
  const merged = new Map<string, TxRecipient>();

  for (const out of utxoOutputs) {
    merged.set(`${out.address}:${out.amount}:${out.vout_index}`, {
      address: out.address,
      amount: out.amount,
      vout_index: out.vout_index,
    });
  }

  addressReceived.forEach((out, index) => {
    const exists = [...merged.values()].some(
      (row) => row.address === out.address && row.amount === out.amount,
    );
    if (!exists) {
      merged.set(`${out.address}:${out.amount}:addr:${index}`, {
        address: out.address,
        amount: out.amount,
        vout_index: index,
      });
    }
  });

  return [...merged.values()].sort((a, b) => a.vout_index - b.vout_index);
}

export async function loadTxIoFromIndex(
  txid: string,
  database: Database = db,
): Promise<TxIoSummary> {
  const contributors = await database.all(`
    SELECT prev_txid, prev_vout_index, address, amount
    FROM spent_utxos
    WHERE spending_txid = ?
    ORDER BY prev_vout_index ASC
  `, txid) as TxContributor[];

  const utxoOutputs = await database.all(`
    SELECT address, amount, vout_index
    FROM utxos
    WHERE txid = ?
    ORDER BY vout_index ASC
  `, txid) as Array<{ address: string; amount: number; vout_index: number }>;

  const addressReceived = await database.all(`
    SELECT address, amount
    FROM address_transactions
    WHERE txid = ? AND type = 'received'
  `, txid) as Array<{ address: string; amount: number }>;

  const recipients = mergeRecipients(utxoOutputs, addressReceived);
  const input_total = contributors.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const output_total = recipients.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const fee = input_total > 0 ? Math.max(0, input_total - output_total) : 0;

  return {
    contributors,
    recipients,
    input_total,
    output_total,
    fee,
  };
}
