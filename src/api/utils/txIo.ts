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

function contributorKey(prevTxid: string, prevVout: number): string {
  return `${String(prevTxid || '').trim().toLowerCase()}:${Number(prevVout)}`;
}

/**
 * Attach sender addresses onto RPC vin entries using indexed spent_utxos contributors.
 * Hub/devfee anti-snipe reads vin.addresses / prevout.scriptPubKey.addresses.
 */
export function enrichRawTxWithContributorAddresses(
  rawTx: any,
  contributors: Array<Pick<TxContributor, 'prev_txid' | 'prev_vout_index' | 'address'>>,
): any {
  if (!rawTx || typeof rawTx !== 'object') return rawTx;

  const byPrev = new Map<string, string[]>();
  for (const row of contributors || []) {
    const address = String(row?.address || '').trim();
    if (!address) continue;
    const key = contributorKey(row.prev_txid, Number(row.prev_vout_index));
    const list = byPrev.get(key) || [];
    if (!list.includes(address)) list.push(address);
    byPrev.set(key, list);
  }

  let clone: any;
  try {
    clone = JSON.parse(JSON.stringify(rawTx));
  } catch {
    return rawTx;
  }

  const vinLists: any[][] = [];
  if (Array.isArray(clone.vin)) vinLists.push(clone.vin);
  if (Array.isArray(clone.tx?.vin)) vinLists.push(clone.tx.vin);

  for (const vins of vinLists) {
    for (const vin of vins) {
      if (!vin || typeof vin !== 'object' || vin.coinbase) continue;
      const key = contributorKey(vin.txid, Number(vin.vout));
      const addresses = byPrev.get(key);
      if (!addresses?.length) continue;
      vin.addresses = addresses;
      vin.prevout = vin.prevout && typeof vin.prevout === 'object' ? vin.prevout : {};
      vin.prevout.scriptPubKey =
        vin.prevout.scriptPubKey && typeof vin.prevout.scriptPubKey === 'object'
          ? vin.prevout.scriptPubKey
          : {};
      vin.prevout.scriptPubKey.addresses = addresses;
    }
  }

  return clone;
}

export function uniqueContributorAddresses(
  contributors: Array<Pick<TxContributor, 'address'>>,
): string[] {
  const set = new Set<string>();
  for (const row of contributors || []) {
    const address = String(row?.address || '').trim();
    if (address) set.add(address);
  }
  return [...set];
}
