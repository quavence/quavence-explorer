import React from 'react';
import { formatQVNC } from '../utils/formatting';

export default function BlockPrimaryAmount({
  block,
}: {
  block: {
    primary_amount?: number | null;
    reward?: number | null;
    reward_amount?: number | null;
    transfer_volume_amount?: number | null;
    raw_output_volume_amount?: number | null;
    user_tx_count?: number | null;
    amount_badge?: string | null;
  };
}) {
  const hasTransfers = Number(block.user_tx_count || 0) > 0;
  const rewardAmount = block.reward_amount ?? block.reward ?? block.primary_amount ?? null;
  const transferTotal = Number(block.transfer_volume_amount || 0);
  const isNetTransfer = hasTransfers && transferTotal > 0;
  const displayAmount = isNetTransfer ? transferTotal : rewardAmount;
  const tooltip = isNetTransfer
    ? `Net transfer volume: ${formatQVNC(transferTotal)} (excludes change). PoS reward: ${formatQVNC(rewardAmount)}`
    : `PoS block reward: ${formatQVNC(rewardAmount)}`;

  return (
    <div
      className={`block-primary-amount ${isNetTransfer ? 'has-activity' : 'reward-only'}`}
      title={tooltip}
    >
      <span
        className="block-primary-amount-value"
        style={isNetTransfer ? { color: '#34d399', fontWeight: 600 } : undefined}
      >
        {formatQVNC(displayAmount)}
      </span>
    </div>
  );
}
