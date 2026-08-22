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
    // Query both endpoints using safe helper
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
      // Retry every 3 seconds if not connected yet, otherwise poll every 8 seconds
      const delay = ok ? 8000 : 3000;
      timeoutId = setTimeout(poll, delay);
    };

    poll();

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, []);

  // Show temporary "Connecting to API..." state
  if (loading && !stats) {
    return (
      <div className="loading-box" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minHeight: '300px' }}>
        <div className="spinner"></div>
        <div style={{ fontWeight: 600, color: '#e2e8f0' }}>Connecting to API...</div>
        {connectionAttempts > 0 && (
          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
            API server is starting up or unreachable. Retrying every 3s... (Attempt {connectionAttempts})
          </div>
        )}
      </div>
    );
  }

  // Show detailed empty state if indexer hasn't populated database yet
  const supply = stats?.supply;
  const emission = stats?.emission;
  const progressPercent = supply?.maxSupply ? Math.min(100, (supply.circulating / supply.maxSupply) * 100) : 0;
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
    : 'unavailable';
  const chainHealthState = resolveChainHealthState({
    nodeOnline: stats?.nodeOnline,
    isFullySynced,
    isLive,
  });
  const syncStatusText = stats?.nodeOnline === false
    ? 'Node connection issue'
    : isFullySynced
      ? 'Fully synced'
      : `Syncing: ${stats?.height ?? '-'} / ${stats?.networkHeight ?? '-'}`;

  const pous = stats?.pous;

  return (
    <>
      {/* Metrics Row */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">PoUS Consensus</div>
          <div className="metric-value" style={{ color: (pous?.activeBoostPercent ?? 0) > 0 ? '#38bdf8' : '#f1f5f9' }}>
            +{(pous?.activeBoostPercent ?? 0)}% Boost
          </div>
          <div className="metric-subtext">
            <span style={{ color: pous?.status === 'ACTIVE' ? '#38bdf8' : '#94a3b8', fontWeight: 600 }}>
              {pous?.status === 'ACTIVE' ? '● PoUS Active' : '○ Standby mode'}
            </span>
            <br />
            Window: {pous?.attestationsInWindow ?? 0} attestations
          </div>
          <div className="metric-mini-grid">
            <div>
              <span>Window</span>
              <strong>1 440 blocks</strong>
            </div>
            <div>
              <span>Total QVAI</span>
              <strong>{pous?.totalAttestations ?? 0}</strong>
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Circulating Supply</div>
          <div className="metric-value" style={{ fontSize: '1.05rem', fontFamily: 'Cascadia Mono, Consolas, Courier New, monospace', wordBreak: 'break-all' }}>
            {supply?.circulating !== undefined ? formatQVNC(supply.circulating) : '0 QVNC'}
          </div>
          <div className="progress-container">
            <div className="progress-bar" style={{ width: `${progressPercent}%` }}></div>
          </div>
          <div className="metric-subtext" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem' }}>
            <span>{progressPercent.toFixed(2)}% of Max</span>
            <span>250 000 QVNC Max</span>
          </div>
          <div className="metric-mini-grid">
            <div>
              <span>PoS budget</span>
              <strong>200 000 QVNC</strong>
            </div>
            <div>
              <span>Current era</span>
              <strong>{emission?.currentEra ?? '-'}</strong>
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Block Spacing</div>
          <div className="metric-value">{stats?.averageBlockInterval ?? '-'}s</div>
          <div className="metric-subtext">{stats?.avgSpacingWindowLabel || 'PoS avg, last 50'} | Target: {targetSpacing}s</div>
          <div className="metric-mini-grid">
            <div>
              <span>Target delta</span>
              <strong>{stats?.averageBlockInterval !== undefined ? `${stats.averageBlockInterval - targetSpacing}s` : '-'}</strong>
            </div>
            <div>
              <span>Sample</span>
              <strong>50 PoS</strong>
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">PoS Difficulty</div>
          <div className="metric-value">{formatDifficulty(stats?.difficulty_pos ?? stats?.difficulty)}</div>
          <div className="metric-subtext">Network weight: {formatNetworkWeight(stats?.networkStakeWeight)}</div>
          <div className="metric-mini-grid">
            <div>
              <span>Stake weight</span>
              <strong>{formatNetworkWeight(stats?.networkStakeWeight)}</strong>
            </div>
            <div>
              <span>Consensus</span>
              <strong>PoS + PoUS</strong>
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Chain Health</div>
          <ChainHealthStatus state={chainHealthState} />
          <div className="metric-subtext" style={{ marginTop: '0.35rem' }}>
            <span style={{ color: stats?.nodeOnline === false ? 'var(--badge-warm-text)' : isFullySynced ? 'var(--health-live-text)' : '#94a3b8', fontWeight: 600 }}>
              {syncStatusText}
            </span> ({syncPercentage.toFixed(1)}%)
          </div>
          <div className="health-lines" style={{ marginTop: '0.4rem' }}>
            <div>
              <span>Height</span>
              <strong>{stats?.height ?? '-'} / {stats?.networkHeight ?? '-'}</strong>
            </div>
            <div>
              <span>Lag</span>
              <strong>{chainLag} blocks</strong>
            </div>
            <div>
              <span>Last block</span>
              <strong>{lastBlockAgeText}</strong>
            </div>
            <div>
              <span>Peers</span>
              <strong>{stats?.peersCount ?? 0}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="home-split-grid">
        <div className="panel dashboard-blocks-panel">
          <div className="panel-header">
            <h3 className="panel-title">Latest Blocks</h3>
            <a href="#" onClick={(e) => { e.preventDefault(); navigate('/blocks'); }} className="brand-badge" style={{ cursor: 'pointer' }}>View All Blocks</a>
          </div>
            <div className="table-responsive">
              <table className="dense-table">
                <thead>
                  <tr>
                    <th>Height</th>
                    <th>Time</th>
                    <th>Transactions</th>
                    <th>Block Type</th>
                    <th data-amount-column-version="5">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {blocksList.map((block: any) => (
                    <tr key={block?.height}>
                      <td>
                        <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/block/${block?.height}`); }} className="hash">
                          {block?.height}
                        </a>
                      </td>
                      <td className="timestamp">{formatTime(block?.time)}</td>
                      <td>{block?.tx_count ?? 0}</td>
                      <td>
                        <span className={`badge ${block?.block_type}`}>
                          {block?.block_type ?? 'unknown'}
                        </span>
                      </td>
                      <td><BlockPrimaryAmount block={block} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tokenomics Detail Panel */}
          <div className="panel dashboard-side-panel">
            <div className="panel-header">
              <h3 className="panel-title">Network Tokenomics</h3>
            </div>
            <div className="panel-body">
              <div className="detail-row">
                <div className="detail-label">Consensus:</div>
                <div className="detail-value mono" style={{ color: '#38bdf8', fontWeight: 600 }}>PoS + PoUS</div>
              </div>
              <div className="detail-row">
                <div className="detail-label">Max Supply:</div>
                <div className="detail-value mono">{formatQVNC(supply?.maxSupply)}</div>
              </div>
              <div className="detail-row">
                <div className="detail-label">Premine:</div>
                <div className="detail-value mono">{formatQVNC(supply?.premine)}</div>
              </div>
              <div className="detail-row">
                <div className="detail-label">PoS Budget:</div>
                <div className="detail-value mono">200 000.00000000 QVNC</div>
              </div>
              <div className="detail-row">
                <div className="detail-label">DevFee Rate:</div>
                <div className="detail-value mono">15% (70% Treasury / 30% AI Pool)</div>
              </div>
              <div className="detail-row">
                <div className="detail-label">AI Worker Pool:</div>
                <div className="detail-value mono" style={{ color: '#a78bfa' }}>30% DevFee (2.59 QVNC/day)</div>
              </div>
              <div className="detail-row">
                <div className="detail-label">PoUS Staking Boost:</div>
                <div className="detail-value mono" style={{ color: '#4ade80' }}>+20% to +50% Weight</div>
              </div>
              <div className="detail-row">
                <div className="detail-label">PoS Subsidy Emitted:</div>
                <div className="detail-value mono">{formatQVNC(supply?.posSubsidyEmitted)}</div>
              </div>
              <div className="detail-row">
                <div className="detail-label">Fees Collected by Stakers:</div>
                <div className="detail-value mono">{formatQVNC(supply?.feesCollected)}</div>
              </div>
              <div className="detail-row">
                <div className="detail-label">Circulating Supply:</div>
                <div className="detail-value mono">{formatQVNC(supply?.circulating)}</div>
              </div>
              {emission && (
                <div className="emission-summary">
                  <div className="emission-title">Emission Schedule</div>
                  <div className="detail-row">
                    <div className="detail-label">Current Era:</div>
                    <div className="detail-value mono">{emission.currentEra}</div>
                  </div>
                  <div className="detail-row">
                    <div className="detail-label">Current Reward:</div>
                    <div className="detail-value mono">{formatQVNC(emission.currentReward)} / block</div>
                  </div>
                  <div className="detail-row">
                    <div className="detail-label">Reward Split:</div>
                    <div className="detail-value mono">
                      {stats?.height && stats.height < 91450 ? (
                        <span style={{ color: '#94a3b8' }}>100% Staker (DevFee at #91450)</span>
                      ) : (
                        <span style={{ color: '#38bdf8' }}>85% Staker / 15% DevFee</span>
                      )}
                    </div>
                  </div>
                  <div className="detail-row">
                    <div className="detail-label">Era Progress:</div>
                    <div className="detail-value mono">{emission.blocksIntoEra.toLocaleString('en-US').replace(/,/g, ' ')} / {emission.eraBlocks.toLocaleString('en-US').replace(/,/g, ' ')}</div>
                  </div>
                  <div className="detail-row">
                    <div className="detail-label">Next Reduction:</div>
                    <div className="detail-value mono">Block {emission.nextReductionHeight.toLocaleString('en-US').replace(/,/g, ' ')}</div>
                  </div>
                  <div className="detail-row">
                    <div className="detail-label">Next Reward:</div>
                    <div className="detail-value mono">{formatQVNC(emission.nextReward)} / block</div>
                  </div>
                  <div className="detail-row">
                    <div className="detail-label">Era Rule:</div>
                    <div className="detail-value mono">-{emission.decayPercent.toFixed(0)}% every ~{Math.round(emission.approxEraDays)} days</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
    </>
  );
}


