import React, { useEffect, useState } from 'react';
import { QUAVENCE } from '../../config';
import { fetchJson } from '../utils/fetchJson';
import { formatQVNC, formatTime, shortenHash } from '../utils/formatting';
import { Pagination, PageSizeSelect, formatShowingRange } from '../components/Pagination';
import LoadingState from '../components/LoadingState';
import CustomSelect from '../components/CustomSelect';
import { getKnownAddressTag } from '../utils/knownAddresses';

type Navigate = (to: string) => void;

const UTXO_SORT_OPTIONS = [
  { value: 'height_desc', label: 'Block Height (Newest First)' },
  { value: 'amount_desc', label: 'Amount (Highest First)' },
  { value: 'amount_asc', label: 'Amount (Lowest First)' },
  { value: 'maturity', label: 'Maturity (Mature First)' },
];

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

  if (loading && !data) return <LoadingState message="Loading address details..." />;

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
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <h3 className="panel-title">Address</h3>
                {getKnownAddressTag(data?.address) && (
                  <span style={getKnownAddressTag(data?.address)!.badgeStyle} title={getKnownAddressTag(data?.address)!.description}>
                    {getKnownAddressTag(data?.address)!.badgeText}
                  </span>
                )}
              </div>
              <p className="panel-description">
                {getKnownAddressTag(data?.address)?.description || 'Balance, activity, and unspent outputs'}
              </p>
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
                <div className="detail-value mono status-ok" style={{ fontWeight: 'bold' }}>
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
              {Array.isArray(data?.glyphs) && data.glyphs.length > 0 && (
                <div className="detail-row">
                  <div className="detail-label">PoUS AI Glyphs:</div>
                  <div className="detail-value mono status-ok" style={{ color: '#c084fc', fontWeight: 'bold' }}>
                    {data.glyphs.length} held
                  </div>
                </div>
              )}
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
                <div className="detail-value mono status-ok">{matureUtxos}</div>
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
          {/* PoUS AI Glyphs Held by this Address */}
          {Array.isArray(data?.glyphs) && data.glyphs.length > 0 && (
            <div className="panel">
              <div className="panel-header panel-header-stacked">
                <div className="panel-heading-row">
                  <div className="panel-heading-main">
                    <h3 className="panel-title">PoUS AI Glyphs ({data.glyphs.length})</h3>
                    <p className="panel-description">On-chain PoUS artifacts held by this address</p>
                  </div>
                  <div className="panel-heading-actions">
                    <span className="badge glyph">
                      {data.glyphs.length === 1 ? '1 ARTIFACT' : `${data.glyphs.length} ARTIFACTS`}
                    </span>
                  </div>
                </div>
              </div>
              <div className="panel-body">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem', alignItems: 'stretch' }}>
                  {data.glyphs.map((item: any, gIdx: number) => {
                    const svgOrImg = item.svgContent || item.imageRef;
                    const isDataSvg = typeof svgOrImg === 'string' && svgOrImg.startsWith('data:image/svg+xml');
                    const isRawSvg = typeof svgOrImg === 'string' && svgOrImg.includes('<svg');
                    const decodedSvg = isDataSvg ? decodeURIComponent(svgOrImg.replace(/^data:image\/svg\+xml;utf8,/, '')) : null;
                    const cleanName = (item.name || 'PoUS Glyph')
                      .replace(new RegExp(`\\s*#${item.edition}\\b`, 'i'), '')
                      .trim();

                    return (
                      <div
                        key={gIdx}
                        style={{
                          background: 'rgba(15, 23, 42, 0.65)',
                          border: '1px solid rgba(168, 85, 247, 0.28)',
                          borderRadius: 12,
                          padding: '1rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.75rem',
                          height: '100%',
                          boxSizing: 'border-box',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <div
                            style={{
                              width: 130,
                              height: 130,
                              borderRadius: 10,
                              background: '#030712',
                              border: '1px solid rgba(168, 85, 247, 0.35)',
                              boxShadow: '0 4px 12px rgba(168, 85, 247, 0.15)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              overflow: 'hidden',
                              padding: 4,
                            }}
                          >
                            {decodedSvg || isRawSvg ? (
                              <div
                                style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                dangerouslySetInnerHTML={{ __html: decodedSvg || svgOrImg }}
                              />
                            ) : (
                              <img
                                src={svgOrImg}
                                alt={cleanName}
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                              />
                            )}
                          </div>
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', minHeight: '2.5rem', marginBottom: '0.25rem' }}>
                            <div
                              style={{
                                fontWeight: 600,
                                color: '#f8fafc',
                                fontSize: '0.92rem',
                                lineHeight: '1.25',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                wordBreak: 'break-word',
                              }}
                              title={cleanName}
                            >
                              {cleanName}
                            </div>
                            <span className="badge glyph" style={{ fontSize: '0.7rem', flexShrink: 0, marginTop: '2px' }}>
                              #{item.edition}
                            </span>
                          </div>
                          <div style={{ minHeight: '2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            {item.theme ? (
                              <div style={{ fontSize: '0.8rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '0.2rem' }} title={item.theme}>
                                {item.theme}
                              </div>
                            ) : (
                              <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.2rem' }}>—</div>
                            )}
                            {item.rarity ? (
                              <div style={{ fontSize: '0.78rem', color: '#c084fc', fontWeight: 600, textTransform: 'capitalize' }}>
                                {item.rarity}
                              </div>
                            ) : (
                              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Common</div>
                            )}
                          </div>
                        </div>
                        <div style={{ marginTop: 'auto', paddingTop: '0.65rem', borderTop: '1px solid rgba(51, 65, 85, 0.4)' }}>
                          <a
                            href="#"
                            onClick={(e) => { e.preventDefault(); navigate(`/tx/${item.txid}`); }}
                            style={{ fontSize: '0.78rem', color: '#38bdf8', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            View On-Chain Tx →
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

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
                    const isGlyph = !!tx.glyph || String(tx.tx_type || '').startsWith('pous_glyph');
                    const glyphEdition = tx.glyph?.edition || tx.glyph_edition;
                    const glyphLabel = tx.glyph?.opLabel || (tx.tx_type === 'pous_glyph_claim' ? 'CLAIM' : 'TRANSFER');
                    const glyphThumb = tx.glyph?.svgContent || tx.glyph?.imageRef;
                    const isDataThumb = typeof glyphThumb === 'string' && glyphThumb.startsWith('data:image/svg+xml');
                    const isRawThumb = typeof glyphThumb === 'string' && glyphThumb.includes('<svg');
                    const decodedThumb = isDataThumb ? decodeURIComponent(glyphThumb.replace(/^data:image\/svg\+xml;utf8,/, '')) : null;

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
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <span className={`badge ${isIncoming ? 'in' : 'out'}`}>
                              {isIncoming ? 'IN' : 'OUT'}
                            </span>
                            {isGlyph && (
                              <span
                                className="badge glyph"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                  fontSize: '0.72rem',
                                  padding: '0.15rem 0.45rem',
                                }}
                              >
                                {glyphThumb && (
                                  <span
                                    style={{
                                      width: 18,
                                      height: 18,
                                      borderRadius: 3,
                                      overflow: 'hidden',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      background: '#030712',
                                      flexShrink: 0,
                                      border: '1px solid rgba(168, 85, 247, 0.4)',
                                    }}
                                  >
                                    {decodedThumb || isRawThumb ? (
                                      <span
                                        style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        dangerouslySetInnerHTML={{ __html: decodedThumb || glyphThumb }}
                                      />
                                    ) : (
                                      <img src={glyphThumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                    )}
                                  </span>
                                )}
                                GLYPH {glyphEdition ? `#${glyphEdition}` : glyphLabel}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={`amount ${isIncoming ? 'amount-in' : 'amount-out'}`}>
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
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.6rem 1.25rem', borderBottom: '1px solid #1f2530', alignItems: 'center' }}>
                  <CustomSelect
                    value={utxoSort}
                    onChange={(val) => setUtxoSort(val as any)}
                    options={UTXO_SORT_OPTIONS}
                    labelPrefix="Sort by:"
                    minWidth="200px"
                  />
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


