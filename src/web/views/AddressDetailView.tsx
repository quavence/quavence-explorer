import React, { useEffect, useState } from 'react';
import { QUAVENCE } from '../../config';
import { fetchJson } from '../utils/fetchJson';
import { formatQVNC, shortenHash } from '../utils/formatting';
import { Pagination, PageSizeSelect, formatShowingRange } from '../components/Pagination';

type Navigate = (to: string) => void;

export default function AddressDetailView({ address, navigate }: { address: string; navigate: (to: string) => void }) {
  const [data, setData] = useState<any>(null);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [statsHeight, setStatsHeight] = useState<number | null>(null);
  const [utxoExpanded, setUtxoExpanded] = useState(false);
  const [visibleUtxoLimit, setVisibleUtxoLimit] = useState(50);
  const [utxoSort, setUtxoSort] = useState<'height_desc' | 'amount_desc' | 'amount_asc' | 'maturity'>('height_desc');

  const loadAddress = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/address/${address}?limit=${limit}&offset=${offset}`);
      if (res.status === 400) {
        setData({ invalid: true });
      } else if (!res.ok) {
        setData(null);
      } else {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      setData(null);
    }

    const statsJson = await fetchJson<any>('/api/status', null);
    if (statsJson) {
      setStatsHeight(statsJson.height);
    }
    setLoading(false);
  };

  useEffect(() => {
    setUtxoExpanded(false);
    setVisibleUtxoLimit(50);
    setUtxoSort('height_desc');
    loadAddress();
  }, [address, offset, limit]);

  if (loading && !data) return <div className="loading-box">Loading address details...</div>;

  if (data?.invalid) {
    return (
      <div className="no-results-box" style={{ marginTop: '2rem' }}>
        <h2 style={{ color: '#f87171' }}>404 - Invalid Address</h2>
        <p style={{ marginTop: '1rem', color: '#94a3b8' }}>
          The address "{address}" is not a valid Quavence public address.
        </p>
        <p style={{ marginTop: '1.5rem' }}>
          <a href="#" onClick={(e) => { e.preventDefault(); navigate('/'); }}>Back to Dashboard</a>
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="error-box">
        Could not retrieve address details. Verify the Express API server is running on port 3039.
      </div>
    );
  }

  const total = data?.pagination?.total ?? 0;
  const transactionsList = data?.transactions ?? [];
  const utxosList = data?.utxos ?? [];
  const transactionRange = formatShowingRange(offset, limit, total, transactionsList.length);
  const txCount = data?.txCount ?? 0;
  const txCountLabel = txCount === 1 ? '1 transaction' : `${txCount} transactions`;

  const handlePageSizeChange = (value: number) => {
    setLimit(value);
    setOffset(0);
  };

  // Group coinstake transactions for the same address
  const groupedTxs: any[] = [];
  const txidMap = new Map<string, any>();

  for (const tx of transactionsList) {
    if (tx.tx_type === 'stake_reward') {
      if (txidMap.has(tx.txid)) {
        const existing = txidMap.get(tx.txid);
        if (tx.type === 'sent') {
          existing.sentAmt = Math.abs(tx.amount);
        } else if (tx.type === 'received') {
          existing.receivedAmt = tx.amount;
        }
      } else {
        const item = {
          txid: tx.txid,
          block_height: tx.block_height,
          tx_type: tx.tx_type,
          sentAmt: tx.type === 'sent' ? Math.abs(tx.amount) : 0,
          receivedAmt: tx.type === 'received' ? tx.amount : 0,
          isGroupedStake: true,
        };
        txidMap.set(tx.txid, item);
        groupedTxs.push(item);
      }
    } else {
      groupedTxs.push({
        ...tx,
        isGroupedStake: false,
      });
    }
  }

  // Calculate netReward for each grouped stake
  for (const item of groupedTxs) {
    if (item.isGroupedStake) {
      item.netReward = item.receivedAmt - item.sentAmt;
    }
  }

  // UTXO statistics calculations
  const utxoCount = utxosList.length;
  let largestUtxo = 0;
  let smallestUtxo = utxoCount > 0 ? Infinity : 0;
  let matureUtxos = 0;
  let immatureUtxos = 0;

  for (const utxo of utxosList) {
    const amt = utxo.amount;
    if (amt > largestUtxo) {
      largestUtxo = amt;
    }
    if (amt < smallestUtxo) {
      smallestUtxo = amt;
    }

    const confirmations = statsHeight !== null ? (statsHeight - utxo.block_height + 1) : 0;
    const isMature = statsHeight !== null && (confirmations >= QUAVENCE.coinbaseMaturity);
    if (isMature) {
      matureUtxos++;
    } else {
      immatureUtxos++;
    }
  }

  if (smallestUtxo === Infinity) {
    smallestUtxo = 0;
  }

  // Sort UTXOs client-side
  const sortedUtxos = [...utxosList].sort((a: any, b: any) => {
    if (utxoSort === 'height_desc') {
      return b.block_height - a.block_height;
    }
    if (utxoSort === 'amount_desc') {
      return b.amount - a.amount;
    }
    if (utxoSort === 'amount_asc') {
      return a.amount - b.amount;
    }
    if (utxoSort === 'maturity') {
      const confA = statsHeight !== null ? (statsHeight - a.block_height + 1) : 0;
      const confB = statsHeight !== null ? (statsHeight - b.block_height + 1) : 0;
      const matureA = confA >= QUAVENCE.coinbaseMaturity ? 1 : 0;
      const matureB = confB >= QUAVENCE.coinbaseMaturity ? 1 : 0;
      if (matureA !== matureB) {
        return matureB - matureA; // Mature first
      }
      return b.block_height - a.block_height; // Fallback to height DESC
    }
    return 0;
  });

  // Slice visible UTXOs based on limit state
  const visibleUtxos = sortedUtxos.slice(0, visibleUtxoLimit);

  return (
    <div>
      <a href="#" onClick={(e) => { e.preventDefault(); navigate('/'); }} className="back-link">
        Back to Dashboard
      </a>

      {/* Address Header Summary */}
      <div className="panel">
        <div className="panel-header panel-header-stacked">
          <div className="panel-heading-row">
            <div className="panel-heading-main">
              <h3 className="panel-title">Address</h3>
              <p className="panel-description">Balance, activity, and unspent outputs</p>
            </div>
            <div className="panel-heading-actions">
              <span className="result-summary">{txCountLabel}</span>
            </div>
          </div>
        </div>
        <div className="panel-body">
          <div className="detail-grid" style={{ marginBottom: 0 }}>
            {/* Column 1: Core Address details */}
            <div>
              <div className="detail-row">
                <div className="detail-label">Address:</div>
                <div className="detail-value mono" style={{ fontWeight: 'bold' }}>{data?.address}</div>
              </div>
              <div className="detail-row">
                <div className="detail-label">Current Balance:</div>
                <div className="detail-value mono" style={{ color: '#34d399', fontWeight: 'bold' }}>
                  {formatQVNC(data?.balance)}
                </div>
              </div>
              <div className="detail-row">
                <div className="detail-label">Total Received:</div>
                <div className="detail-value mono">{formatQVNC(data?.received)}</div>
              </div>
              <div className="detail-row">
                <div className="detail-label">Total Sent:</div>
                <div className="detail-value mono">{formatQVNC(data?.sent)}</div>
              </div>
              <div className="detail-row">
                <div className="detail-label">Transaction Count:</div>
                <div className="detail-value">{data?.txCount ?? 0}</div>
              </div>
            </div>

            {/* Column 2: UTXO Statistics summary */}
            <div>
              <div className="detail-row">
                <div className="detail-label">UTXO Count:</div>
                <div className="detail-value mono">{utxoCount}</div>
              </div>
              <div className="detail-row">
                <div className="detail-label">Largest UTXO:</div>
                <div className="detail-value mono">{formatQVNC(largestUtxo)}</div>
              </div>
              <div className="detail-row">
                <div className="detail-label">Smallest UTXO:</div>
                <div className="detail-value mono">{formatQVNC(smallestUtxo)}</div>
              </div>
              <div className="detail-row">
                <div className="detail-label">Mature UTXOs:</div>
                <div className="detail-value mono" style={{ color: '#34d399' }}>{matureUtxos}</div>
              </div>
              <div className="detail-row">
                <div className="detail-label">Immature UTXOs:</div>
                <div className="detail-value mono" style={{ color: '#fbbf24' }}>{immatureUtxos}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {data?.indexed === false ? (
        <div className="no-results-box" style={{ marginTop: '1.5rem', padding: '3rem' }}>
          <h3 style={{ color: '#cbd5e1', marginBottom: '0.5rem' }}>No indexed activity for this address yet.</h3>
          <p style={{ color: '#64748b' }}>
            This address has not been involved in any transactions on the blockchain.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Address Transactions (Primary) */}
          <div className="panel">
            <div className="panel-header panel-header-stacked">
              <div className="panel-heading-row">
                <div className="panel-heading-main">
                  <h3 className="panel-title">Transactions History ({data?.txCount ?? 0})</h3>
                  <p className="panel-description">Address-level indexed transactions</p>
                </div>
                <div className="panel-heading-actions">
                  <span className="result-summary">{transactionRange}</span>
                  <PageSizeSelect value={limit} onChange={handlePageSizeChange} />
                </div>
              </div>
            </div>
            <div className="table-responsive">
              <table className="dense-table">
                <thead>
                  <tr>
                    <th>Txid</th>
                    <th>Height</th>
                    <th>Type</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedTxs.map((tx: any, idx: number) => {
                    if (tx.isGroupedStake) {
                      const isImmatureStake = statsHeight !== null && (tx.block_height + QUAVENCE.coinbaseMaturity > statsHeight);
                      const blocksRemaining = isImmatureStake ? (tx.block_height + QUAVENCE.coinbaseMaturity - statsHeight) : 0;
                      return (
                        <React.Fragment key={idx}>
                          <tr className="tx-main-row stake-row">
                            <td>
                              <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/tx/${tx.txid}`); }} className="hash">
                                {shortenHash(tx.txid)}
                              </a>
                            </td>
                            <td>
                              <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/block/${tx.block_height}`); }}>
                                {tx.block_height}
                              </a>
                            </td>
                            <td>
                              <span className="badge stake_reward">Stake Reward</span>
                            </td>
                            <td className="amount positive nowrap">
                              +{formatQVNC(tx.netReward)}
                            </td>
                          </tr>
                          <tr className="tx-detail-row">
                            <td colSpan={4}>
                              <div className="tx-detail-line">
                                <span>Principal: {formatQVNC(tx.sentAmt)} to {formatQVNC(tx.receivedAmt)}</span>
                                {isImmatureStake ? (
                                  <span className="badge bootstrap">
                                    Immature: spendable in {blocksRemaining} blocks
                                  </span>
                                ) : (
                                  <span className="badge pos">
                                    Matured
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    }

                    const isIncoming = tx.amount > 0;
                    return (
                      <tr key={idx}>
                        <td>
                          <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/tx/${tx?.txid}`); }} className="hash">
                            {shortenHash(tx?.txid)}
                          </a>
                        </td>
                        <td>
                          <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/block/${tx?.block_height}`); }}>
                            {tx?.block_height}
                          </a>
                        </td>
                        <td>
                          <span className={`badge ${isIncoming ? 'in' : 'out'}`}>
                            {isIncoming ? 'IN' : 'OUT'}
                          </span>
                        </td>
                        <td className="amount" style={{ color: isIncoming ? '#34d399' : '#f87171' }}>
                          {formatQVNC(Math.abs(tx?.amount ?? 0))}
                        </td>
                      </tr>
                    );
                  })}
                  {groupedTxs.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: '#64748b' }}>No transactions recorded for this address</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination limit={limit} offset={offset} total={total} onPageChange={setOffset} />
          </div>

          {/* Address UTXOs (Secondary / Collapsible) */}
          <div className="panel">
            <div
              className="panel-header"
              style={{ cursor: 'pointer' }}
              onClick={() => setUtxoExpanded(!utxoExpanded)}
            >
              <div>
                <h3 className="panel-title">Unspent Transaction Outputs</h3>
                <p style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  {utxoExpanded ? (
                    `${utxoCount} output${utxoCount !== 1 ? 's' : ''} | ${matureUtxos} mature | ${immatureUtxos} immature | showing ${visibleUtxos.length}`
                  ) : (
                    `${utxoCount} output${utxoCount !== 1 ? 's' : ''}`
                  )}
                </p>
              </div>
              <div className="section-actions" style={{ display: 'flex', gap: '0.5rem' }}>
                {utxoExpanded ? (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); setUtxoExpanded(false); }}
                      className="pagination-btn"
                    >
                      Hide
                    </button>
                    {utxosList.length > visibleUtxoLimit && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setVisibleUtxoLimit(utxosList.length); }}
                        className="pagination-btn"
                      >
                        Show all
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setUtxoExpanded(true); }}
                    className="pagination-btn"
                  >
                    Show UTXOs
                  </button>
                )}
              </div>
            </div>
            {utxoExpanded && (
              <>
                {/* Sorting Controls */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.75rem 1.25rem', borderBottom: '1px solid #1f2530', alignItems: 'center', gap: '0.5rem' }}>
                  <label htmlFor="utxo-sort-select" style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Sort by:</label>
                  <select
                    id="utxo-sort-select"
                    value={utxoSort}
                    onChange={(e: any) => setUtxoSort(e.target.value)}
                    style={{
                      backgroundColor: '#181d26',
                      border: '1px solid #2e3748',
                      color: '#cbd5e1',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      outline: 'none'
                    }}
                  >
                    <option value="height_desc">Block Height (Newest First)</option>
                    <option value="amount_desc">Amount (Highest First)</option>
                    <option value="amount_asc">Amount (Lowest First)</option>
                    <option value="maturity">Maturity (Mature First)</option>
                  </select>
                </div>
                <div className="table-responsive">
                  <table className="dense-table">
                    <thead>
                      <tr>
                        <th>Txid</th>
                        <th>Vout</th>
                        <th>Block Height</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleUtxos.map((utxo: any, idx: number) => (
                        <tr key={idx}>
                          <td>
                            <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/tx/${utxo?.txid}`); }} className="hash">
                              {shortenHash(utxo?.txid)}
                            </a>
                          </td>
                          <td>{utxo?.vout_index ?? 0}</td>
                          <td>
                            <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/block/${utxo?.block_height}`); }}>
                              {utxo?.block_height}
                            </a>
                          </td>
                          <td className="amount">{formatQVNC(utxo?.amount)}</td>
                        </tr>
                      ))}
                      {visibleUtxos.length === 0 && (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', color: '#64748b' }}>No unspent outputs for this address</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {utxosList.length > visibleUtxoLimit && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', padding: '1rem', borderTop: '1px solid #1f2530' }}>
                    <button
                      className="pagination-btn"
                      onClick={() => setVisibleUtxoLimit(prev => prev + 50)}
                    >
                      Show More (+50)
                    </button>
                    <button
                      className="pagination-btn"
                      onClick={() => setVisibleUtxoLimit(utxosList.length)}
                    >
                      Show All ({utxosList.length})
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
)}
     </div>
   );
}


