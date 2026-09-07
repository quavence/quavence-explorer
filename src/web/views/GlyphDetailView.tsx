import React, { useEffect, useState } from 'react';
import { fetchJson } from '../utils/fetchJson';
import { formatTime, shortenHash } from '../utils/formatting';
import { isolateSvgGradients } from '../utils/svg';
import LoadingState from '../components/LoadingState';

type Navigate = (to: string) => void;

interface GlyphDetailViewProps {
  idOrEdition: string;
  navigate: Navigate;
}

export default function GlyphDetailView({ idOrEdition, navigate }: GlyphDetailViewProps) {
  const [glyph, setGlyph] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadGlyph = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchJson<any>(`/api/glyphs/${encodeURIComponent(idOrEdition)}`, null);
        if (!cancelled) {
          if (data && !data.error) {
            setGlyph(data);
          } else {
            setError(data?.error || `Glyph "${idOrEdition}" not found.`);
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to fetch glyph details.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadGlyph();
    return () => {
      cancelled = true;
    };
  }, [idOrEdition]);

  const copyToClipboard = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 2000);
  };

  if (loading) {
    return <LoadingState message="Querying on-chain PoUS Glyph telemetry..." />;
  }

  if (error || !glyph) {
    return (
      <div>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate('/glyphs');
          }}
          className="back-link"
        >
          ← Back to Glyphs Registry
        </a>
        <div className="error-box">
          <div style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '0.4rem' }}>
            PoUS Glyph Not Found
          </div>
          <div className="mono" style={{ fontSize: '0.85rem', color: '#94a3b8', wordBreak: 'break-all', marginBottom: '0.6rem' }}>
            {idOrEdition}
          </div>
          <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
            {error || 'No artifact or on-chain registration exists matching this identifier.'}
          </div>
        </div>
      </div>
    );
  }

  const svgOrImg = glyph.svgContent || glyph.imageRef;
  const isDataSvg = typeof svgOrImg === 'string' && svgOrImg.startsWith('data:image/svg+xml');
  const isRawSvg = typeof svgOrImg === 'string' && svgOrImg.includes('<svg');
  const decodedSvg = isDataSvg ? decodeURIComponent(svgOrImg.replace(/^data:image\/svg\+xml;utf8,/, '')) : null;

  const holder = glyph.currentHolder || glyph.carrierAddress || '—';
  const latestTx = glyph.latestTxid || glyph.txid || glyph.mintTxid || '';
  const mintTx = glyph.mintTxid || glyph.txid || '';
  const carrierAmount = glyph.carrierAmount
    ? `${(glyph.carrierAmount / 100000000).toFixed(8)} QVNC`
    : '0.00010000 QVNC';

  const rarity = (glyph.rarity || 'Common').toLowerCase();
  const rarityBadgeClass =
    rarity === 'legendary'
      ? 'badge-legendary'
      : rarity === 'epic'
      ? 'badge-epic'
      : rarity === 'rare'
      ? 'badge-rare'
      : 'badge-common';

  const history = Array.isArray(glyph.history) ? glyph.history : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Back link */}
      <div>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            if (window.history.length > 1) {
              window.history.back();
            } else {
              navigate('/glyphs');
            }
          }}
          className="back-link"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          ← Back
        </a>
      </div>

      {/* Glyph Header Card */}
      <div className="panel">
        <div className="panel-header panel-header-stacked">
          <div className="panel-heading-row">
            <div className="panel-heading-main">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                <h2 className="panel-title" style={{ fontSize: '1.4rem' }}>
                  {glyph.name || `PoUS Glyph #${glyph.edition}`}
                </h2>
                <span className="badge glyph" style={{ fontSize: '0.78rem' }}>
                  #{glyph.edition}
                </span>
                <span className={`badge ${rarityBadgeClass}`} style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  {glyph.rarity || 'Common'}
                </span>
              </div>
              <p className="panel-description" style={{ marginTop: '0.35rem' }}>
                {glyph.archetype || 'PoUS L1 Consensus Relic'} · Theme: {glyph.theme || 'Neural Quantum Nexus'}
              </p>
            </div>
            <div className="panel-heading-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="action-btn"
                onClick={() => copyToClipboard(holder, 'holder')}
                disabled={!glyph.carrierAddress && !glyph.currentHolder}
                style={{
                  background: 'var(--bg-surface-elevated)',
                  color: copiedKey === 'holder' ? '#4ade80' : 'var(--text-secondary)',
                  border: '1px solid var(--border-divider)',
                  padding: '6px 12px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  transition: 'all 0.15s ease',
                }}
              >
                {copiedKey === 'holder' ? '✓ Address Copied' : 'Copy Holder Address'}
              </button>
              <button
                type="button"
                className="action-btn"
                onClick={() => copyToClipboard(latestTx, 'tx')}
                disabled={!latestTx}
                style={{
                  background: 'var(--bg-surface-elevated)',
                  color: copiedKey === 'tx' ? '#4ade80' : 'var(--text-secondary)',
                  border: '1px solid var(--border-divider)',
                  padding: '6px 12px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  transition: 'all 0.15s ease',
                }}
              >
                {copiedKey === 'tx' ? '✓ TxID Copied' : 'Copy Carrier TxID'}
              </button>
              <button
                type="button"
                className="action-btn"
                onClick={() => copyToClipboard(glyph.glyphHash, 'hash')}
                disabled={!glyph.glyphHash}
                style={{
                  background: 'var(--bg-surface-elevated)',
                  color: copiedKey === 'hash' ? '#4ade80' : 'var(--text-secondary)',
                  border: '1px solid var(--border-divider)',
                  padding: '6px 12px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  transition: 'all 0.15s ease',
                }}
              >
                {copiedKey === 'hash' ? '✓ Hash Copied' : 'Copy Glyph Hash'}
              </button>
            </div>
          </div>
        </div>

        {/* Dual Column Content */}
        <div className="panel-body" style={{ padding: '1.25rem' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(300px, 380px) 1fr',
              gap: '2rem',
              alignItems: 'start',
            }}
            className="glyph-detail-grid"
          >
            {/* Visual Artifact Presentation Box */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
              <div
                style={{
                  width: '100%',
                  maxWidth: 360,
                  aspectRatio: '1/1',
                  borderRadius: 16,
                  background: '#030712',
                  border: '1px solid rgba(168, 85, 247, 0.4)',
                  boxShadow: '0 8px 32px rgba(168, 85, 247, 0.2), inset 0 0 20px rgba(0, 0, 0, 0.8)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  padding: 12,
                  position: 'relative',
                }}
              >
                {decodedSvg || isRawSvg ? (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    dangerouslySetInnerHTML={{
                      __html: isolateSvgGradients(decodedSvg || svgOrImg, glyph.edition || idOrEdition),
                    }}
                  />
                ) : (
                  <img
                    src={svgOrImg}
                    alt={glyph.name}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                )}
              </div>

              {/* Vector SVG Actions */}
              <div style={{ display: 'flex', gap: '0.75rem', width: '100%', maxWidth: 360, justifyContent: 'center' }}>
                <button
                  type="button"
                  className="terminal-link-btn"
                  onClick={() => {
                    if (glyph.svgContent) {
                      const blob = new Blob(
                        [
                          glyph.svgContent.startsWith('data:image/svg+xml')
                            ? decodeURIComponent(glyph.svgContent.replace(/^data:image\/svg\+xml;utf8,/, ''))
                            : glyph.svgContent,
                        ],
                        { type: 'image/svg+xml' }
                      );
                      const url = URL.createObjectURL(blob);
                      window.open(url, '_blank');
                    }
                  }}
                  style={{
                    background: 'rgba(56, 189, 248, 0.1)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    color: '#38bdf8',
                    padding: '6px 14px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                    fontWeight: 500,
                  }}
                >
                  Open Full Vector SVG ↗
                </button>
              </div>
            </div>

            {/* Technical Parameters Table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div
                style={{
                  backgroundColor: 'var(--bg-cell)',
                  borderRadius: 10,
                  border: '1px solid var(--border-divider)',
                  overflow: 'hidden',
                }}
              >
                <div className="detail-row" style={{ padding: '0.75rem 1rem' }}>
                  <div className="detail-label" style={{ width: 180 }}>Edition Number</div>
                  <div className="detail-value mono" style={{ fontWeight: 600, color: '#f8fafc' }}>
                    #{glyph.edition}
                  </div>
                </div>

                <div className="detail-row" style={{ padding: '0.75rem 1rem' }}>
                  <div className="detail-label" style={{ width: 180 }}>Rarity Tier</div>
                  <div className="detail-value">
                    <span className={`badge ${rarityBadgeClass}`} style={{ textTransform: 'uppercase' }}>
                      {glyph.rarity || 'Common'}
                    </span>
                  </div>
                </div>

                <div className="detail-row" style={{ padding: '0.75rem 1rem' }}>
                  <div className="detail-label" style={{ width: 180 }}>Current Carrier Holder</div>
                  <div className="detail-value mono" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {holder !== '—' ? (
                      <>
                        <a
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            navigate(`/address/${holder}`);
                          }}
                          className="hash"
                          style={{ fontSize: '0.9rem', wordBreak: 'break-all' }}
                        >
                          {holder}
                        </a>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(holder, 'holder_inline')}
                          title="Copy address"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: copiedKey === 'holder_inline' ? '#4ade80' : 'var(--text-dim)',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                          }}
                        >
                          {copiedKey === 'holder_inline' ? '✓' : '⧉'}
                        </button>
                      </>
                    ) : (
                      '—'
                    )}
                  </div>
                </div>

                <div className="detail-row" style={{ padding: '0.75rem 1rem' }}>
                  <div className="detail-label" style={{ width: 180 }}>Carrier Output & Value</div>
                  <div className="detail-value mono">
                    {carrierAmount} <span style={{ color: 'var(--text-dim)' }}>(Output #{glyph.carrierVout ?? 0}, 10,000 sat)</span>
                  </div>
                </div>

                <div className="detail-row" style={{ padding: '0.75rem 1rem' }}>
                  <div className="detail-label" style={{ width: 180 }}>Protection Status</div>
                  <div className="detail-value" style={{ color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
                    <span style={{ color: 'var(--text-dim)', marginRight: '6px' }}>🔒</span>
                    Auto-Locked <span style={{ color: 'var(--text-dim)', marginLeft: '4px' }}>(Staking-Immune)</span>
                  </div>
                </div>

                <div className="detail-row" style={{ padding: '0.75rem 1rem' }}>
                  <div className="detail-label" style={{ width: 180 }}>Mint Block Height</div>
                  <div className="detail-value mono">
                    {glyph.blockHeight ? (
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(`/block/${glyph.blockHeight}`);
                        }}
                      >
                        #{glyph.blockHeight}
                      </a>
                    ) : (
                      '—'
                    )}
                    {glyph.blockTime ? (
                      <span style={{ color: 'var(--text-dim)', marginLeft: '0.5rem', fontSize: '0.8rem' }}>
                        ({formatTime(glyph.blockTime)})
                      </span>
                    ) : null}
                  </div>
                </div>

                {latestTx && (
                  <div className="detail-row" style={{ padding: '0.75rem 1rem' }}>
                    <div className="detail-label" style={{ width: 180 }}>Latest Carrier TxID</div>
                    <div className="detail-value mono" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(`/tx/${latestTx}`);
                        }}
                        className="hash"
                        style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}
                      >
                        {latestTx}
                      </a>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(latestTx, 'latest_tx_inline')}
                        title="Copy TxID"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: copiedKey === 'latest_tx_inline' ? '#4ade80' : 'var(--text-dim)',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                        }}
                      >
                        {copiedKey === 'latest_tx_inline' ? '✓' : '⧉'}
                      </button>
                    </div>
                  </div>
                )}

                {mintTx && mintTx !== latestTx && (
                  <div className="detail-row" style={{ padding: '0.75rem 1rem' }}>
                    <div className="detail-label" style={{ width: 180 }}>Original Mint TxID</div>
                    <div className="detail-value mono" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(`/tx/${mintTx}`);
                        }}
                        className="hash"
                        style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}
                      >
                        {mintTx}
                      </a>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(mintTx, 'mint_tx_inline')}
                        title="Copy Mint TxID"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: copiedKey === 'mint_tx_inline' ? '#4ade80' : 'var(--text-dim)',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                        }}
                      >
                        {copiedKey === 'mint_tx_inline' ? '✓' : '⧉'}
                      </button>
                    </div>
                  </div>
                )}

                {glyph.glyphHash && (
                  <div className="detail-row" style={{ padding: '0.75rem 1rem' }}>
                    <div className="detail-label" style={{ width: 180 }}>SHA-256 Glyph Hash</div>
                    <div className="detail-value mono" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.78rem', color: '#cbd5e1', wordBreak: 'break-all' }}>
                        {glyph.glyphHash}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(glyph.glyphHash, 'hash_inline')}
                        title="Copy Glyph Hash"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: copiedKey === 'hash_inline' ? '#4ade80' : 'var(--text-dim)',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                        }}
                      >
                        {copiedKey === 'hash_inline' ? '✓' : '⧉'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="detail-row" style={{ padding: '0.75rem 1rem' }}>
                  <div className="detail-label" style={{ width: 180 }}>Consensus Protocol</div>
                  <div className="detail-value" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    Quavence L1 Proof of Useful Stake (PoUS)
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* On-Chain Provenance & Transfer History Panel */}
      <div className="panel">
        <div className="panel-header panel-header-stacked">
          <div className="panel-heading-row">
            <div className="panel-heading-main">
              <h3 className="panel-title">On-Chain Provenance & Transfer History ({history.length})</h3>
              <p className="panel-description">Verifiable cryptographic custody chain recorded on Quavence L1</p>
            </div>
            <div className="panel-heading-actions">
              <span className="badge glyph">
                {history.length} {history.length === 1 ? 'EVENT' : 'EVENTS'}
              </span>
            </div>
          </div>
        </div>

        <div className="panel-body" style={{ padding: 0 }}>
          {history.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>
              No transfer history records indexed for this relic yet.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '12%' }}>Block</th>
                    <th style={{ width: '18%' }}>Age / Timestamp</th>
                    <th style={{ width: '12%' }}>Operation</th>
                    <th style={{ width: '28%' }}>Carrier Address</th>
                    <th style={{ width: '30%' }}>Transaction ID</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((evt: any, idx: number) => {
                    const isLatest = idx === 0;
                    return (
                      <tr key={evt.txid || idx} style={isLatest ? { backgroundColor: 'rgba(168, 85, 247, 0.04)' } : undefined}>
                        <td className="mono">
                          <a
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              navigate(`/block/${evt.blockHeight}`);
                            }}
                          >
                            #{evt.blockHeight}
                          </a>
                        </td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          {evt.blockTime ? formatTime(evt.blockTime) : '—'}
                        </td>
                        <td>
                          <span
                            className="badge"
                            style={{
                              backgroundColor:
                                evt.opLabel === 'CLAIM'
                                  ? 'rgba(245, 158, 11, 0.15)'
                                  : evt.opLabel === 'TRANSFER'
                                  ? 'rgba(56, 189, 248, 0.15)'
                                  : 'rgba(168, 85, 247, 0.15)',
                              color:
                                evt.opLabel === 'CLAIM'
                                  ? '#fbbf24'
                                  : evt.opLabel === 'TRANSFER'
                                  ? '#38bdf8'
                                  : '#c084fc',
                              borderColor:
                                evt.opLabel === 'CLAIM'
                                  ? 'rgba(245, 158, 11, 0.3)'
                                  : evt.opLabel === 'TRANSFER'
                                  ? 'rgba(56, 189, 248, 0.3)'
                                  : 'rgba(168, 85, 247, 0.3)',
                              fontSize: '0.72rem',
                            }}
                          >
                            {evt.opLabel || 'TRANSFER'}
                          </span>
                        </td>
                        <td className="mono">
                          {evt.carrierAddress ? (
                            <a
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                navigate(`/address/${evt.carrierAddress}`);
                              }}
                              className="hash"
                              title={evt.carrierAddress}
                            >
                              {shortenHash(evt.carrierAddress, 10, 8)}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="mono">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <a
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                navigate(`/tx/${evt.txid}`);
                              }}
                              className="hash"
                              title={evt.txid}
                            >
                              {shortenHash(evt.txid, 10, 8)}
                            </a>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(evt.txid, `hist_${idx}`)}
                              title="Copy TxID"
                              style={{
                                background: 'none',
                                border: 'none',
                                color: copiedKey === `hist_${idx}` ? '#4ade80' : 'var(--text-dim)',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                              }}
                            >
                              {copiedKey === `hist_${idx}` ? '✓' : '⧉'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
