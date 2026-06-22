import React from 'react';

export type ChainHealthState = 'live' | 'syncing' | 'stale' | 'offline';

const HEALTH_META: Record<
  ChainHealthState,
  { label: string; hint: string }
> = {
  live: {
    label: 'LIVE',
    hint: 'Indexer is synced and recent blocks are arriving on schedule.',
  },
  syncing: {
    label: 'SYNCING',
    hint: 'Indexer is catching up to the network tip.',
  },
  stale: {
    label: 'STALE',
    hint: 'Node is synced but the latest block is older than expected.',
  },
  offline: {
    label: 'RPC OFFLINE',
    hint: 'Cannot reach the node RPC endpoint.',
  },
};

export function resolveChainHealthState(input: {
  nodeOnline?: boolean;
  isFullySynced: boolean;
  isLive: boolean;
}): ChainHealthState {
  if (input.nodeOnline === false) return 'offline';
  if (!input.isFullySynced) return 'syncing';
  if (input.isLive) return 'live';
  return 'stale';
}

type ChainHealthStatusProps = {
  state: ChainHealthState;
  className?: string;
};

export default function ChainHealthStatus({ state, className }: ChainHealthStatusProps) {
  const meta = HEALTH_META[state];

  return (
    <div
      className={['chain-health-status', `chain-health-status--${state}`, className].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
      title={meta.hint}
    >
      <span className="chain-health-status__beacon" aria-hidden="true">
        <span className="chain-health-status__core" />
        <span className="chain-health-status__ring" />
      </span>
      <span className="chain-health-status__label">{meta.label}</span>
    </div>
  );
}
