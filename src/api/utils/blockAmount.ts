import { db } from '../../db/db.js';
import {
  computeBlockAmountFields,
  TRANSFER_TX_TYPE,
  type BlockAmountFields,
  type BlockAmountConfidence,
} from '../../indexer/blockAmount.js';
import { backfillTxAmountColumns } from './txAmount.js';
import type { Database } from 'sqlite';

type BlockRow = Record<string, unknown> & {
  height?: number;
  reward?: number | null;
};

type TxAggRow = {
  block_height: number;
  transfer_volume_amount: number;
  raw_output_volume_amount: number;
  change_amount: number;
  fee_amount: number;
  user_tx_count: number;
  reward_tx_count: number;
  exact_transfer_count: number;
  unknown_transfer_count: number;
};

function attachRewardAlias(block: BlockRow, fields: BlockAmountFields): Record<string, unknown> {
  return {
    ...block,
    ...fields,
    reward_amount: fields.reward_amount ?? block.reward ?? null,
  };
}

function resolveBlockConfidence(agg?: Partial<TxAggRow>): BlockAmountConfidence {
  const exactCount = Number(agg?.exact_transfer_count || 0);
  const unknownCount = Number(agg?.unknown_transfer_count || 0);
  if (unknownCount > 0 && exactCount > 0) return 'estimated';
  if (unknownCount > 0) return 'unknown';
  return 'exact';
}

function buildFieldsFromAgg(block: BlockRow, agg?: Partial<TxAggRow>): BlockAmountFields {
  return computeBlockAmountFields({
    reward_amount: block.reward ?? null,
    transfer_volume_amount: Number(agg?.transfer_volume_amount || 0),
    raw_output_volume_amount: Number(agg?.raw_output_volume_amount || 0),
    change_amount: Number(agg?.change_amount || 0),
    fee_amount: Number(agg?.fee_amount || 0),
    user_tx_count: Number(agg?.user_tx_count || 0),
    has_reward_tx: Number(agg?.reward_tx_count || 0) > 0,
    amount_confidence: resolveBlockConfidence(agg),
  });
}

async function ensureBlockTxAmounts(height: number, database: Database): Promise<void> {
  const missing = await database.all(`
    SELECT txid, type, fee, amount
    FROM transactions
    WHERE block_height = ?
      AND type = ?
      AND (amount_confidence IS NULL OR amount_confidence = '')
  `, height, TRANSFER_TX_TYPE) as Array<{ txid: string; type: string; fee: number; amount: number }>;

  for (const tx of missing) {
    await backfillTxAmountColumns(tx, database);
  }
}

async function loadTxAggregatesForHeights(
  heights: number[],
  database: Database,
): Promise<Map<number, TxAggRow>> {
  const map = new Map<number, TxAggRow>();
  if (!heights.length) return map;

  for (const height of heights) {
    await ensureBlockTxAmounts(height, database);
  }

  const placeholders = heights.map(() => '?').join(', ');
  const rows = await database.all(`
    SELECT
      block_height,
      COALESCE(SUM(CASE
        WHEN type = ? AND amount_confidence = 'exact' THEN amount_net_transfer
        ELSE 0
      END), 0) AS transfer_volume_amount,
      COALESCE(SUM(CASE WHEN type = ? THEN COALESCE(amount_raw_output, amount, 0) ELSE 0 END), 0) AS raw_output_volume_amount,
      COALESCE(SUM(CASE WHEN type = ? THEN COALESCE(change_amount, 0) ELSE 0 END), 0) AS change_amount,
      COALESCE(SUM(CASE WHEN type = ? THEN COALESCE(fee_amount, fee, 0) ELSE 0 END), 0) AS fee_amount,
      COALESCE(SUM(CASE WHEN type = ? THEN 1 ELSE 0 END), 0) AS user_tx_count,
      COALESCE(SUM(CASE WHEN type IN ('stake_reward', 'coinbase', 'bootstrap') THEN 1 ELSE 0 END), 0) AS reward_tx_count,
      COALESCE(SUM(CASE WHEN type = ? AND amount_confidence = 'exact' THEN 1 ELSE 0 END), 0) AS exact_transfer_count,
      COALESCE(SUM(CASE WHEN type = ? AND amount_confidence = 'unknown' THEN 1 ELSE 0 END), 0) AS unknown_transfer_count
    FROM transactions
    WHERE block_height IN (${placeholders})
    GROUP BY block_height
  `,
    TRANSFER_TX_TYPE,
    TRANSFER_TX_TYPE,
    TRANSFER_TX_TYPE,
    TRANSFER_TX_TYPE,
    TRANSFER_TX_TYPE,
    TRANSFER_TX_TYPE,
    TRANSFER_TX_TYPE,
    ...heights,
  ) as TxAggRow[];

  for (const row of rows) {
    map.set(Number(row.block_height), row);
  }
  return map;
}

export async function enrichBlockAmountFromTransactions(
  block: BlockRow,
  database: Database = db,
): Promise<Record<string, unknown>> {
  const height = Number(block.height);
  if (!Number.isFinite(height)) {
    return { ...block, reward_amount: block.reward ?? null };
  }

  const aggMap = await loadTxAggregatesForHeights([height], database);
  const fields = buildFieldsFromAgg(block, aggMap.get(height));
  return attachRewardAlias(block, fields);
}

export async function enrichBlocksListFromTransactions(
  blocks: BlockRow[],
  database: Database = db,
): Promise<Array<Record<string, unknown>>> {
  if (!blocks.length) return [];

  const heights = blocks
    .map((block) => Number(block.height))
    .filter((height) => Number.isFinite(height));
  const aggMap = await loadTxAggregatesForHeights(heights, database);

  return blocks.map((block) => {
    const height = Number(block.height);
    const fields = Number.isFinite(height)
      ? buildFieldsFromAgg(block, aggMap.get(height))
      : buildFieldsFromAgg(block);
    return attachRewardAlias(block, fields);
  });
}
