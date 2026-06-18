import { db } from '../../db/db.js';
import {
  computeBlockAmountFields,
  TRANSFER_TX_TYPE,
  type BlockAmountFields,
} from '../../indexer/blockAmount.js';
import type { Database } from 'sqlite';

type BlockRow = Record<string, unknown> & {
  height?: number;
  reward?: number | null;
  transfer_volume_amount?: number | null;
  user_tx_count?: number | null;
  primary_amount?: number | null;
  primary_amount_kind?: string | null;
  primary_amount_label?: string | null;
  amount_badge?: string | null;
};

function hasStoredPrimaryAmount(block: BlockRow): boolean {
  return block.primary_amount_kind != null && block.primary_amount_kind !== '';
}

function attachRewardAlias(block: BlockRow, fields: BlockAmountFields): Record<string, unknown> {
  return {
    ...block,
    ...fields,
    reward_amount: fields.reward_amount ?? block.reward ?? null,
  };
}

export function enrichBlockAmountFromRow(block: BlockRow): Record<string, unknown> {
  return {
    ...block,
    reward_amount: block.reward ?? null,
  };
}

export async function enrichBlockAmountFromTransactions(
  block: BlockRow,
  database: Database = db,
): Promise<Record<string, unknown>> {
  if (hasStoredPrimaryAmount(block)) {
    return enrichBlockAmountFromRow(block);
  }

  const height = Number(block.height);
  if (!Number.isFinite(height)) {
    return { ...block, reward_amount: block.reward ?? null };
  }

  const agg = await database.get(`
    SELECT
      COALESCE(SUM(CASE WHEN type = ? THEN amount ELSE 0 END), 0) AS transfer_volume_amount,
      COALESCE(SUM(CASE WHEN type = ? THEN 1 ELSE 0 END), 0) AS user_tx_count,
      COALESCE(SUM(CASE WHEN type IN ('stake_reward', 'coinbase', 'bootstrap') THEN 1 ELSE 0 END), 0) AS reward_tx_count
    FROM transactions
    WHERE block_height = ?
  `, TRANSFER_TX_TYPE, TRANSFER_TX_TYPE, height) as {
    transfer_volume_amount: number;
    user_tx_count: number;
    reward_tx_count: number;
  } | undefined;

  const fields = computeBlockAmountFields({
    reward_amount: block.reward ?? null,
    transfer_volume_amount: Number(agg?.transfer_volume_amount || 0),
    user_tx_count: Number(agg?.user_tx_count || 0),
    has_reward_tx: Number(agg?.reward_tx_count || 0) > 0,
  });

  return attachRewardAlias(block, fields);
}
