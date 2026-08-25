import React, { useEffect, useState } from 'react';
import BlockPrimaryAmount from '../components/BlockPrimaryAmount';
import ChainHealthStatus, { resolveChainHealthState } from '../components/ChainHealthStatus';
import { fetchJson } from '../utils/fetchJson';
import { formatDifficulty, formatNetworkWeight, formatQVNC, formatTime } from '../utils/formatting';

type Navigate = (to: string) => void;

const DASHBOARD_LATEST_BLOCKS_LIMIT = 16;

export default function DashboardView({ navigate }: { navigate: (to: string) => void }) {
  const [stats, setStats] = useState<any>(null);
  const [blocksData, setBlocksData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [connectionAttempts, setConnectionAttempts] = useState(0);

  const loadData = async () => {
    const statsJson = await fetchJson<any>('/api/status', null);
    if (statsJson) {
      const blocksJson = await fetchJson<any>(`/api/blocks?limit=${DASHBOARD_LATEST_BLOCKS_LIMIT}`, null);
      setStats(statsJson);
      setBlocksData(blocksJson);
      setLoading(false);
      return true;
    } else {
      setConnectionAttempts(prev => prev + 1);
      return false;
    }
  };

  useEffect(() => {
    let active = true;
    let timeoutId: any;

    const poll = async () => {
      const ok = await loadData();
      if (!active) return;
      const delay = ok ? 8000 : 3000;
      timeoutId = setTimeout(poll, delay);
    };

    poll();

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, []);

  if (loading && !stats) {
    return (
      <div className="terminal-loading">
        <div className="spinner"></div>
        <div className="terminal-loading-text">Connecting to Node & Indexer API...</div>
        {connectionAttempts > 0 && (
          <div className="terminal-loading-sub">
            Endpoint unreachable. Retrying in 3s (Attempt {connectionAttempts})...
          </div>
        )}
      </div>
    );
  }

  const supply = stats?.supply;
  const emission = stats?.emission;
  const maxSupply = supply?.maxSupply || 250000;
  const circulating = supply?.circulating || 0;
  const premine = supply?.premine || 50000;
  const posEmitted = supply?.posSubsidyEmitted || Math.max(0, circulating - premine);
  const posBudget = 200000;
  const remainingPosBudget = Math.max(0, posBudget - posEmitted);

  const preminePercent = (premine / maxSupply) * 100;
  const emittedPercent = (posEmitted / maxSupply) * 100;
  const remainingPercent = Math.max(0, 100 - preminePercent - emittedPercent);
  const circulatingPercent = (circulating / maxSupply) * 100;

  const blocksList = blocksData?.blocks ?? [];
  const targetSpacing = stats?.targetSpacingSeconds || 64;
  const isLive = stats?.lastBlockAgeSeconds !== null && stats?.lastBlockAgeSeconds !== undefined && stats.lastBlockAgeSeconds <= targetSpacing * 10;
  const syncPercentage = stats?.syncPercentage ?? 0;
  const isFullySynced = syncPercentage >= 99.99;
  const chainLag = Math.max(0, (stats?.networkHeight ?? 0) - (stats?.height ?? 0));
  const lastBlockAgeText = stats?.lastBlockAgeSeconds !== null && stats?.lastBlockAgeSeconds !== undefined
    ? stats.lastBlockAgeSeconds < 60
      ? `${stats.lastBlockAgeSeconds}s ago`
      : `${Math.floor(stats.lastBlockAgeSeconds / 60)}m ago`
    : '-';
  const chainHealthState = resolveChainHealthState({
    nodeOnline: stats?.nodeOnline,
    isFullySynced,
    isLive,
  });

  const pous = stats?.pous;
  const isPoUSActive = pous?.status === 'ACTIVE' || (pous?.activeBoostPercent ?? 0) > 0;
  const spacingDelta = stats?.averageBlockInterval !== undefined ? stats.averageBlockInterval - targetSpacing : 0;

  return (
    <div className="dashboard-terminal">
      {/* Monolithic Telemetry Ribbon */}
      <section className="telemetry-ribbon" aria-label="Network Telemetry">
        {/* Cell 1: PoUS Consensus */}
        <div className="telemetry-cell">
          <div className="telemetry-header">
            <span className="telemetry-label">PoUS Consensus</span>
            <span className={`telemetry-pill ${isPoUSActive ? 'pill-active' : 'pill-standby'}`}>
              {isPoUSActive ? 'ACTIVE' : 'STANDBY'}
            </span>
          </div>
          <div className="telemetry-main">
            <span className={`telemetry-value ${isPoUSActive ? 'value-cyan' : ''}`}>
              {isPoUSActive ? '+20% ~ +50%' : '0%'}
            </span>
            <span className="telemetry-unit">Tiered Staking Boost</span>
          </div>
          <div className="telemetry-meta-grid">
            <div className="meta-item">
              <span className="meta-label">Window Attestations</span>
              <span className="meta-value mono">{pous?.attestationsInWindow ?? 0}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Total QVAI Verified</span>
              <span className="meta-value mono">{pous?.totalAttestations ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Cell 2: Circulating Supply */}
        <div className="telemetry-cell">
          <div className="telemetry-header">
            <span className="telemetry-label">Circulating Supply</span>
            <span className="telemetry-pill pill-neutral">{circulatingPercent.toFixed(1)}% of Max</span>
          </div>
          <div className="telemetry-main">
            <span className="telemetry-value mono">
              {supply?.circulating !== undefined ? formatQVNC(supply.circulating).replace(' QVNC', '') : '0'}
            </span>
            <span className="telemetry-unit">QVNC</span>
          </div>
          <div className="telemetry-progress-track" title={`Circulating: ${circulatingPercent.toFixed(2)}% of 250,000 QVNC`}>
            <div className="telemetry-progress-fill" style={{ width: `${Math.min(100, circulatingPercent)}%` }}></div>
          </div>
          <div className="telemetry-meta-grid">
            <div className="meta-item">
              <span className="meta-label">Max Cap</span>
              <span className="meta-value mono">250 000 QVNC</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">PoS Budget</span>
              <span className="meta-value mono">200 000 QVNC</span>
            </div>
          </div>
        </div>

        {/* Cell 3: Block Spacing */}
        <div className="telemetry-cell">
          <div className="telemetry-header">
            <span className="telemetry-label">Block Spacing</span>
            <span className={`telemetry-pill ${Math.abs(spacingDelta) <= 10 ? 'pill-active' : 'pill-standby'}`}>
              Target {targetSpacing}s
            </span>
          </div>
          <div className="telemetry-main">
            <span className="telemetry-value mono">{stats?.averageBlockInterval ?? '-'}</span>
            <span className="telemetry-unit">sec / block</span>
          </div>
          <div className="telemetry-meta-grid">
            <div className="meta-item">
              <span className="meta-label">Target Delta</span>
              <span className="meta-value mono">{spacingDelta >= 0 ? `+${spacingDelta}s` : `${spacingDelta}s`}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Sample Window</span>
              <span className="meta-value mono">50 PoS blocks</span>
            </div>
          </div>
        </div>

        {/* Cell 4: PoS Difficulty & Weight */}
        <div className="telemetry-cell">
          <div className="telemetry-header">
            <span className="telemetry-label">PoS Difficulty</span>
            <span className="telemetry-pill pill-neutral">PoS + PoUS</span>
          </div>
          <div className="telemetry-main">
            <span className="telemetry-value mono">
              {formatDifficulty(stats?.difficulty_pos ?? stats?.difficulty)}
            </span>
          </div>
          <div className="telemetry-meta-grid">
            <div className="meta-item">
              <span className="meta-label">Network Weight</span>
              <span className="meta-value mono">{formatNetworkWeight(stats?.networkStakeWeight)}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Era Status</span>
              <span className="meta-value mono">Era {emission?.currentEra ?? 1}</span>
            </div>
          </div>
        </div>

        {/* Cell 5: Chain Health */}
        <div className="telemetry-cell">
          <div className="telemetry-header">
            <span className="telemetry-label">Node & Chain Status</span>
            <span className="telemetry-pill pill-neutral">
              {stats?.peersCount ?? 0} peers
            </span>
          </div>
          <div className="telemetry-main">
            <ChainHealthStatus state={chainHealthState} />
          </div>
          <div className="telemetry-meta-grid">
            <div className="meta-item">
              <span className="meta-label">Block Height</span>
              <span className="meta-value mono">{stats?.height ?? '-'} {chainLag > 0 ? `(-${chainLag})` : ''}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Last Block Time</span>
              <span className="meta-value mono">{lastBlockAgeText}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Terminal Workspace */}
      <div className="workspace-grid">
        {/* Left: Latest Blocks Feed */}
        <section className="terminal-pane blocks-pane">
          <div className="pane-toolbar">
            <div className="pane-title-group">
              <span className="pane-status-dot"></span>
              <h2 className="pane-title">Latest Blocks</h2>
              <span className="pane-counter mono">Live Stream</span>
            </div>
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); navigate('/blocks'); }}
              className="terminal-link-btn"
            >
              View All Blocks &rarr;
            </a>
          </div>

          <div className="table-responsive">
            <table className="dense-table">
              <thead>
                <tr>
                  <th style={{ width: '140px' }}>Height</th>
                  <th>Time (UTC)</th>
                  <th style={{ width: '90px', textAlign: 'center' }}>TXs</th>
                  <th className="col-amount" style={{ textAlign: 'right', paddingRight: '1rem' }}>Block Reward / Amount</th>
                </tr>
              </thead>
              <tbody>
                {blocksList.map((block: any) => (
                  <tr key={block?.height}>
                    <td>
                      <a
                        href="#"
                        onClick={(e) => { e.preventDefault(); navigate(`/block/${block?.height}`); }}
                        className="hash"
                      >
                        #{block?.height}
                      </a>
                      {block?.height === 0 && <span className="badge genesis" style={{ marginLeft: '6px' }}>GENESIS</span>}
                    </td>
                    <td className="timestamp">{formatTime(block?.time)}</td>
                    <td style={{ textAlign: 'center' }} className="mono">{block?.tx_count ?? 0}</td>
                    <td className="col-amount" style={{ textAlign: 'right', paddingRight: '1rem' }}>
                      <BlockPrimaryAmount block={block} />
                    </td>
                  </tr>
                ))}
                {blocksList.length === 0 && (
                  <tr>
                    <td colSpan={4} className="table-empty">No indexed blocks found yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Right: Network Tokenomics & Emission Breakdown */}
        <section className="terminal-pane tokenomics-pane">
          <div className="pane-toolbar">
            <div className="pane-title-group">
              <h2 className="pane-title">Tokenomics & Allocations</h2>
            </div>
            <span className="tokenomics-consensus-badge">PoS + PoUS</span>
          </div>

          <div className="pane-content-body">
            {/* Visual Meter 1: Supply Distribution */}
            <div className="allocation-block">
              <div className="allocation-header">
                <span className="allocation-title">Supply Distribution</span>
                <span className="allocation-total mono">250 000 QVNC Max</span>
              </div>

              <div className="segmented-bar" title={`Premine: ${preminePercent.toFixed(1)}% | PoS Emitted: ${emittedPercent.toFixed(1)}% | Remaining: ${remainingPercent.toFixed(1)}%`}>
                <div className="segment segment-premine" style={{ width: `${preminePercent}%` }}></div>
                <div className="segment segment-emitted" style={{ width: `${emittedPercent}%` }}></div>
                <div className="segment segment-remaining" style={{ width: `${remainingPercent}%` }}></div>
              </div>

              <div className="segment-legend">
                <div className="legend-item">
                  <span className="legend-dot dot-premine"></span>
                  <span className="legend-label">Premine (DAO Treasury):</span>
                  <strong className="legend-value mono">{formatQVNC(premine)}</strong>
                </div>
                <div className="legend-item">
                  <span className="legend-dot dot-emitted"></span>
                  <span className="legend-label">PoS Emitted:</span>
                  <strong className="legend-value mono">{formatQVNC(posEmitted)}</strong>
                </div>
                <div className="legend-item">
                  <span className="legend-dot dot-remaining"></span>
                  <span className="legend-label">PoS Reserve Remaining:</span>
                  <strong className="legend-value mono">{formatQVNC(remainingPosBudget)}</strong>
                </div>
              </div>
            </div>

            {/* Visual Meter 2: DevFee & AI Worker Split */}
            <div className="allocation-block" style={{ marginTop: '1.25rem' }}>
              <div className="allocation-header">
                <span className="allocation-title">DevFee Split Allocation</span>
                <span className="allocation-total mono">15% on Block Rewards</span>
              </div>

              <div className="segmented-bar">
                <div className="segment segment-treasury" style={{ width: '70%' }} title="70% DAO Treasury"></div>
                <div className="segment segment-ai-pool" style={{ width: '30%' }} title="30% AI Worker Pool"></div>
              </div>

              <div className="segment-legend">
                <div className="legend-item">
                  <span className="legend-dot dot-treasury"></span>
                  <span className="legend-label">DAO Treasury (70%):</span>
                  <strong className="legend-value mono">10.5% effective</strong>
                </div>
                <div className="legend-item">
                  <span className="legend-dot dot-ai-pool"></span>
                  <span className="legend-label">AI Worker Pool (30%):</span>
                  <strong className="legend-value mono">4.5% effective (~2.59 QVNC/day)</strong>
                </div>
              </div>
            </div>

            {/* Metric Specification Matrix */}
            <div className="specs-matrix" style={{ marginTop: '1.25rem' }}>
              <div className="spec-row">
                <span className="spec-name">PoUS Staking Boost</span>
                <span className="spec-value mono">+20% to +50% Weight</span>
              </div>
              <div className="spec-row">
                <span className="spec-name">Staker Network Fees Collected</span>
                <span className="spec-value mono">{formatQVNC(supply?.feesCollected)}</span>
              </div>
              <div className="spec-row">
                <span className="spec-name">Current Block Reward</span>
                <span className="spec-value mono">
                  {emission?.currentReward !== undefined ? `${formatQVNC(emission.currentReward)} / blk` : '-'}
                </span>
              </div>
              <div className="spec-row">
                <span className="spec-name">Staker / DevFee Split</span>
                <span className="spec-value mono">
                  {stats?.height && stats.height < 91450 ? '100% Staker' : '85% Staker / 15% DevFee'}
                </span>
              </div>
            </div>

            {/* Emission Schedule Details */}
            {emission && (
              <div className="emission-terminal-card" style={{ marginTop: '1.25rem' }}>
                <div className="emission-card-header">
                  <span className="emission-title">Emission Era & Decay Schedule</span>
                  <span className="emission-badge mono">Era {emission.currentEra}</span>
                </div>
                <div className="specs-matrix compact">
                  <div className="spec-row">
                    <span className="spec-name">Era Progress</span>
                    <span className="spec-value mono">
                      {emission.blocksIntoEra?.toLocaleString()} / {emission.eraBlocks?.toLocaleString()} blocks
                    </span>
                  </div>
                  <div className="spec-row">
                    <span className="spec-name">Next Reduction Target</span>
                    <span className="spec-value mono">Block #{emission.nextReductionHeight?.toLocaleString()}</span>
                  </div>
                  <div className="spec-row">
                    <span className="spec-name">Next Era Reward</span>
                    <span className="spec-value mono">{formatQVNC(emission.nextReward)} / block</span>
                  </div>
                  <div className="spec-row">
                    <span className="spec-name">Decay Schedule Rule</span>
                    <span className="spec-value mono">
                      -{emission.decayPercent?.toFixed(0)}% every ~{Math.round(emission.approxEraDays || 30)} days
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}



