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
};

type TxAggRow = {
  block_height: number;
  transfer_volume_amount: number;
  raw_output_volume_amount: number;
  fee_amount: number;
  user_tx_count: number;
  reward_tx_count: number;
};

function attachRewardAlias(block: BlockRow, fields: BlockAmountFields): Record<string, unknown> {
  return {
    ...block,
    ...fields,
    reward_amount: fields.reward_amount ?? block.reward ?? null,
  };
}

function buildFieldsFromAgg(block: BlockRow, agg?: Partial<TxAggRow>): BlockAmountFields {
  const transferFromBlock = Number(block.transfer_volume_amount);
  const transferFromAgg = Number(agg?.transfer_volume_amount || 0);
  return computeBlockAmountFields({
    reward_amount: block.reward ?? null,
    transfer_volume_amount: Number.isFinite(transferFromBlock) && transferFromBlock > 0
      ? transferFromBlock
      : transferFromAgg,
    raw_output_volume_amount: Number(agg?.raw_output_volume_amount || 0),
    fee_amount: Number(agg?.fee_amount || 0),
    user_tx_count: Number(agg?.user_tx_count || 0),
    has_reward_tx: Number(agg?.reward_tx_count || 0) > 0,
  });
}

async function loadTxAggregatesForHeights(
  heights: number[],
  database: Database,
): Promise<Map<number, TxAggRow>> {
  const map = new Map<number, TxAggRow>();
  if (!heights.length) return map;

  const placeholders = heights.map(() => '?').join(', ');
  const rows = await database.all(`
    SELECT
      block_height,
      COALESCE(SUM(CASE
        WHEN type = ? AND amount_confidence IN ('exact', 'estimated')
          THEN COALESCE(amount_net_transfer, 0)
        ELSE 0
      END), 0) AS transfer_volume_amount,
      COALESCE(SUM(CASE WHEN type = ? THEN COALESCE(amount_raw_output, amount, 0) ELSE 0 END), 0) AS raw_output_volume_amount,
      COALESCE(SUM(CASE WHEN type = ? THEN COALESCE(fee_amount, fee, 0) ELSE 0 END), 0) AS fee_amount,
      COALESCE(SUM(CASE WHEN type = ? THEN 1 ELSE 0 END), 0) AS user_tx_count,
      COALESCE(SUM(CASE WHEN type IN ('stake_reward', 'coinbase', 'bootstrap') THEN 1 ELSE 0 END), 0) AS reward_tx_count
    FROM transactions
    WHERE block_height IN (${placeholders})
    GROUP BY block_height
  `,
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

export type BlockGlyphInfo = {
  op_label: string;
  edition: number;
  glyph_hash?: string;
};

export type BlockAttestationInfo = {
  task_type: string;
};

async function loadActivityForHeights(
  heights: number[],
  database: Database,
): Promise<Map<number, { glyphs: BlockGlyphInfo[]; attestations: BlockAttestationInfo[] }>> {
  const map = new Map<number, { glyphs: BlockGlyphInfo[]; attestations: BlockAttestationInfo[] }>();
  if (!heights.length) return map;

  for (const h of heights) {
    map.set(h, { glyphs: [], attestations: [] });
  }

  const placeholders = heights.map(() => '?').join(', ');

  try {
    const [glyphRows, attestRows] = await Promise.all([
      database.all(`
        SELECT block_height, op_label, edition, glyph_hash
        FROM glyphs
        WHERE block_height IN (${placeholders})
      `, ...heights) as Promise<Array<{ block_height: number; op_label: string; edition: number; glyph_hash: string }>>,
      database.all(`
        SELECT block_height, task_type
        FROM ai_attestations
        WHERE block_height IN (${placeholders})
      `, ...heights) as Promise<Array<{ block_height: number; task_type: string }>>,
    ]);

    for (const row of glyphRows || []) {
      const entry = map.get(Number(row.block_height));
      if (entry) {
        entry.glyphs.push({
          op_label: row.op_label,
          edition: row.edition,
          glyph_hash: row.glyph_hash,
        });
      }
    }

    for (const row of attestRows || []) {
      const entry = map.get(Number(row.block_height));
      if (entry) {
        entry.attestations.push({
          task_type: row.task_type,
        });
      }
    }
  } catch {
    // Graceful fallback if tables are empty or being indexed
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

  const [aggMap, activityMap] = await Promise.all([
    loadTxAggregatesForHeights([height], database),
    loadActivityForHeights([height], database),
  ]);
  const fields = buildFieldsFromAgg(block, aggMap.get(height));
  const activity = activityMap.get(height);
  return {
    ...attachRewardAlias(block, fields),
    glyphs: activity?.glyphs ?? [],
    glyph_count: activity?.glyphs?.length ?? 0,
    attestations: activity?.attestations ?? [],
    attestation_count: activity?.attestations?.length ?? 0,
  };
}

export async function enrichBlocksListFromTransactions(
  blocks: BlockRow[],
  database: Database = db,
): Promise<Array<Record<string, unknown>>> {
  if (!blocks.length) return [];

  const heights = blocks
    .map((block) => Number(block.height))
    .filter((height) => Number.isFinite(height));
  const [aggMap, activityMap] = await Promise.all([
    loadTxAggregatesForHeights(heights, database),
    loadActivityForHeights(heights, database),
  ]);

  return blocks.map((block) => {
    const height = Number(block.height);
    const fields = Number.isFinite(height)
      ? buildFieldsFromAgg(block, aggMap.get(height))
      : buildFieldsFromAgg(block);
    const activity = Number.isFinite(height) ? activityMap.get(height) : undefined;
    return {
      ...attachRewardAlias(block, fields),
      glyphs: activity?.glyphs ?? [],
      glyph_count: activity?.glyphs?.length ?? 0,
      attestations: activity?.attestations ?? [],
      attestation_count: activity?.attestations?.length ?? 0,
    };
  });
}
