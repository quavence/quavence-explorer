import React, { useEffect, useState } from 'react';
import { QUAVENCE } from '../../config';
import { fetchJson } from '../utils/fetchJson';
import { formatQVNC, formatTime, shortenHash } from '../utils/formatting';
import { getKnownAddressTag } from '../utils/knownAddresses';
import { isolateSvgGradients } from '../utils/svg';
import LoadingState from '../components/LoadingState';

type Navigate = (to: string) => void;

export default function TxDetailView({ txid, navigate }: { txid: string; navigate: (to: string) => void }) {
  const [tx, setTx] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statsHeight, setStatsHeight] = useState<number | null>(null);

  useEffect(() => {
    const loadTx = async () => {
      setLoading(true);
      const [json, statsJson] = await Promise.all([
        fetchJson<any>(`/api/tx/${txid}`, null),
        fetchJson<any>('/api/status', null)
      ]);
      setTx(json);
      if (statsJson) {
        setStatsHeight(statsJson.height);
      }
      setLoading(false);
    };
    loadTx();
  }, [txid]);

  if (loading) return <LoadingState message="Loading transaction details..." />;
  if (!tx) {
    return (
      <div>
        <a href="#" onClick={(e) => { e.preventDefault(); navigate('/'); }} className="back-link">
          ← Back to Overview
        </a>
        <div className="error-box">
          <div style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '0.4rem' }}>
            Transaction Not Found in Database Index
          </div>
          <div className="mono" style={{ fontSize: '0.8rem', color: '#94a3b8', wordBreak: 'break-all', maxWidth: '640px', marginBottom: '0.6rem' }}>
            {txid}
          </div>
          <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
            This transaction may still be propagating across the network, or the node indexer is catching up.
          </div>
        </div>
      </div>
    );
  }

  const contributors = tx?.contributors ?? [];
  const recipients = tx?.recipients ?? [];
  const changeOutputs = tx?.change_outputs ?? [];
  const isCoinbaseLike = tx?.type === 'stake_reward' || tx?.type === 'coinbase' || tx?.type === 'bootstrap';
  const hasIndexedIo = contributors.length > 0 || recipients.length > 0 || changeOutputs.length > 0;
  const isTransfer = tx?.type === 'normal_transfer';
  const isGlyph = !!tx?.glyph;

  const txTypeLabel = isGlyph
    ? `POUS GLYPH ${tx.glyph.opLabel || 'TRANSFER'}`
    : tx?.attestation
    ? 'AI ATTESTATION'
    : (tx?.type || 'UNKNOWN').toUpperCase().replace(/_/g, ' ');

  const attestationType = (() => {
    const raw = (tx?.attestation?.task_type || '').toUpperCase().trim();
    if (raw.includes('SUMMARY') || raw.includes('DIGEST') || raw === 'TASK') return 'DIGEST';
    if (raw.includes('RISK') || raw.includes('FLAGS')) return 'RISK AUDIT';
    if (raw.includes('GOVERNANCE') || raw.includes('PROPOSAL')) return 'GOVERNANCE';
    if (raw.includes('RAG') || raw.includes('IDLE') || raw.includes('KNOWLEDGE')) return 'RAG VERIFICATION';
    if (raw.includes('HISTOR')) return 'HISTORY CONTEXT';
    if (raw.includes('OUTCOME') || raw.includes('RECAP')) return 'OUTCOME RECAP';
    if (raw.includes('COMPOSER')) return 'TASK COMPOSER';
    if (raw.includes('REVIEW') || raw.includes('CONSULTANT')) return 'REVIEW CONSULTANT';
    if (raw.includes('SCREEN') || raw.includes('SUBMISSION') || raw.includes('BOUNTY')) return 'SUBMISSION SCREEN';
    if (raw.includes('GLYPH') || raw.includes('NFT') || raw.includes('ART')) return 'AI GLYPH GEN';
    return raw.replace('TASK_', '') || 'CONSENSUS';
  })();

  return (
    <div>
      <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/block/${tx?.blockHeight}`); }} className="back-link">
        Back to Block #{tx?.blockHeight ?? '-'}
      </a>

      <div className="panel">
        <div className="panel-header panel-header-stacked">
          <div className="panel-heading-row">
            <div className="panel-heading-main">
              <h3 className="panel-title">Transaction</h3>
              <p className="panel-description">On-chain contributors, recipients, and fees</p>
            </div>
            <div className="panel-heading-actions">
              <span className={`badge ${isGlyph ? 'glyph' : ''}`}>{txTypeLabel}</span>
            </div>
          </div>
        </div>
        <div className="panel-body">
          <div className="detail-row">
            <div className="detail-label">TXID</div>
            <div className="detail-value mono">{tx?.txid ?? '-'}</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">Block</div>
            <div className="detail-value mono">
              {tx?.blockHeight ? (
                <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/block/${tx.blockHeight}`); }}>
                  #{tx.blockHeight}
                </a>
              ) : '-'}
            </div>
          </div>
          <div className="detail-row">
            <div className="detail-label">Timestamp</div>
            <div className="detail-value timestamp">{formatTime(tx?.time)}</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">Confirmations</div>
            <div className="detail-value">{tx?.confirmations ?? 0}</div>
          </div>
          {tx?.type === 'stake_reward' && (
            <div className="detail-row">
              <div className="detail-label">Maturity</div>
              <div className="detail-value">
                {statsHeight !== null ? (
                  statsHeight >= tx.blockHeight + QUAVENCE.coinbaseMaturity ? (
                    <span style={{ fontWeight: 'bold' }} className="status-ok">Matured (Spendable)</span>
                  ) : (
                    <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>
                      Immature (Spendable in {tx.blockHeight + QUAVENCE.coinbaseMaturity - statsHeight} blocks)
                    </span>
                  )
                ) : (
                  'Checking maturity...'
                )}
              </div>
            </div>
          )}
          {isTransfer ? (
            <div className="detail-row">
              <div className="detail-label">Amount sent</div>
              <div className="detail-value mono">{formatQVNC(tx?.transfer_amount ?? 0)}</div>
            </div>
          ) : null}
          {isTransfer && Number(tx?.change_amount || 0) > 0 ? (
            <div className="detail-row">
              <div className="detail-label">Change returned</div>
              <div className="detail-value mono detail-muted">{formatQVNC(tx.change_amount)}</div>
            </div>
          ) : null}
          <div className="detail-row">
            <div className="detail-label">Input total</div>
            <div className="detail-value mono">
              {tx?.input_total > 0 ? formatQVNC(tx.input_total) : (isCoinbaseLike ? 'Coinbase / PoS' : '—')}
            </div>
          </div>
          <div className="detail-row">
            <div className="detail-label">{isTransfer ? 'Output total' : 'Output total'}</div>
            <div className="detail-value mono">{formatQVNC(tx?.output_total ?? 0)}</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">Fee</div>
            <div className="detail-value mono">{formatQVNC(tx?.fee ?? 0)}</div>
          </div>
        </div>
      </div>

      {tx?.attestation && (
        <div className="panel">
          <div className="panel-header panel-header-stacked">
            <div className="panel-heading-row">
              <div className="panel-heading-main">
                <h3 className="panel-title">PoUS AI Attestation</h3>
                <p className="panel-description">On-chain consensus proof for useful AI task execution</p>
              </div>
              <div className="panel-heading-actions">
                <span className="badge">
                  {attestationType}
                </span>
              </div>
            </div>
          </div>
          <div className="panel-body">
            {tx.attestation.task_id && (
              <div className="detail-row">
                <div className="detail-label">Task ID</div>
                <div className="detail-value mono">{tx.attestation.task_id}</div>
              </div>
            )}
            <div className="detail-row">
              <div className="detail-label">Consensus Hash</div>
              <div className="detail-value mono" style={{ wordBreak: 'break-all' }}>
                {tx.attestation.consensus_hash}
              </div>
            </div>
            <div className="detail-row">
              <div className="detail-label">Consensus Agreement</div>
              <div className="detail-value mono" style={{ color: '#e2e8f0', fontWeight: 600 }}>
                {(Number(tx.attestation.agreement_ratio || 0) * 100).toFixed(0)}% ({tx.attestation.worker_count} AI Nodes)
              </div>
            </div>
            <div className="detail-row">
              <div className="detail-label">Anchor Ref Block</div>
              <div className="detail-value mono">
                <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/block/${tx.attestation.ref_block_height}`); }}>
                  #{tx.attestation.ref_block_height}
                </a>
              </div>
            </div>
            <div className="detail-row">
              <div className="detail-label">Header Spec</div>
              <div className="detail-value mono detail-muted">
                QVAI (v{tx.attestation.version ?? 1}, 44-byte binary OP_RETURN)
              </div>
            </div>
          </div>
        </div>
      )}

      {tx?.glyph && (
        <div className="panel">
          <div className="panel-header panel-header-stacked">
            <div className="panel-heading-row">
              <div className="panel-heading-main">
                <h3 className="panel-title">PoUS AI Glyph Artifact</h3>
                <p className="panel-description">On-chain Satoshi UTXO protocol & provenance</p>
              </div>
              <div className="panel-heading-actions">
                <span className="badge glyph">
                  #{tx.glyph.edition || '0'} · {tx.glyph.opLabel || 'TRANSFER'}
                </span>
              </div>
            </div>
          </div>
          <div className="panel-body">
            {(tx.glyph.artifact?.svgContent || tx.glyph.artifact?.imageRef) && (() => {
              const svgOrImg = tx.glyph.artifact.svgContent || tx.glyph.artifact.imageRef;
              const isDataSvg = typeof svgOrImg === 'string' && svgOrImg.startsWith('data:image/svg+xml');
              const isRawSvg = typeof svgOrImg === 'string' && svgOrImg.includes('<svg');
              const decodedSvg = isDataSvg ? decodeURIComponent(svgOrImg.replace(/^data:image\/svg\+xml;utf8,/, '')) : null;

              return (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
                  <div
                    style={{
                      width: 140,
                      height: 140,
                      borderRadius: 12,
                      background: '#030712',
                      border: '1px solid rgba(168, 85, 247, 0.35)',
                      boxShadow: '0 4px 16px rgba(168, 85, 247, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      padding: 6,
                    }}
                  >
                    {decodedSvg || isRawSvg ? (
                      <div
                        style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        dangerouslySetInnerHTML={{
                          __html: isolateSvgGradients(decodedSvg || svgOrImg, tx.txid || tx.glyph?.edition),
                        }}
                      />
                    ) : (
                      <img
                        src={svgOrImg}
                        alt={tx.glyph.artifact?.name || 'Glyph'}
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      />
                    )}
                  </div>
                </div>
              );
            })()}
            <div className="detail-row">
              <div className="detail-label">Glyph Name</div>
              <div className="detail-value" style={{ fontWeight: 600, color: '#f8fafc' }}>
                {tx.glyph.artifact?.name || `PoUS Genesis Solar #${tx.glyph.edition}`}
              </div>
            </div>
            {tx.glyph.artifact?.theme && (
              <div className="detail-row">
                <div className="detail-label">Theme / Collection</div>
                <div className="detail-value">{tx.glyph.artifact.theme}</div>
              </div>
            )}
            {tx.glyph.artifact?.rarity && (
              <div className="detail-row">
                <div className="detail-label">Rarity</div>
                <div className="detail-value" style={{ fontWeight: 600, color: '#c084fc' }}>
                  {tx.glyph.artifact.rarity}
                </div>
              </div>
            )}
            <div className="detail-row">
              <div className="detail-label">Consensus Hash</div>
              <div className="detail-value mono" style={{ wordBreak: 'break-all' }}>
                {tx.glyph.glyphHash}
              </div>
            </div>
            <div className="detail-row">
              <div className="detail-label">Protocol Action</div>
              <div className="detail-value mono" style={{ color: '#c084fc', fontWeight: 600 }}>
                {tx.glyph.opLabel} (Type 0x0{tx.glyph.opType})
              </div>
            </div>
            <div className="detail-row">
              <div className="detail-label">Carrier Output (Dust)</div>
              <div className="detail-value mono" style={{ color: '#38bdf8' }}>
                0.00010000 QVNC (P2PKH output)
              </div>
            </div>
            <div className="detail-row">
              <div className="detail-label">Header Spec</div>
              <div className="detail-value mono detail-muted">
                QVNC (v{tx.glyph.version}, 40-byte binary OP_RETURN)
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <h3 className="panel-title">Contributors & Recipients</h3>
        </div>
        <div className="panel-body">
          {hasIndexedIo ? (
            <div className="io-grid">
              <div className="io-column">
                <div className="io-title">Contributors</div>
                {contributors.length === 0 ? (
                  <div className="io-item">
                    <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>
                      {isCoinbaseLike ? 'Coinbase / PoS reward inputs' : 'No indexed inputs'}
                    </span>
                  </div>
                ) : (
                  contributors.map((input: any, index: number) => (
                    <div className="io-item io-item-stacked" key={`${input.prev_txid}:${input.prev_vout_index}:${index}`}>
                      <div className="io-row-main">
                        <div className="io-address-wrap">
                          <a
                            href="#"
                            onClick={(e) => { e.preventDefault(); navigate(`/address/${input.address}`); }}
                            className="mono io-address"
                          >
                            {input.address}
                          </a>
                          {getKnownAddressTag(input.address) && (
                            <span
                              style={getKnownAddressTag(input.address)!.badgeStyle}
                              title={getKnownAddressTag(input.address)!.description}
                            >
                              {getKnownAddressTag(input.address)!.badgeText}
                            </span>
                          )}
                        </div>
                        <span className="amount mono">{formatQVNC(input.amount)}</span>
                      </div>
                      <div className="detail-muted mono io-prevout">
                        prevout{' '}
                        <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/tx/${input.prev_txid}`); }}>
                          {shortenHash(input.prev_txid)}
                        </a>
                        :{input.prev_vout_index}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="io-arrow">→</div>

              <div className="io-column">
                <div className="io-title">Recipients</div>
                {recipients.length === 0 ? (
                  tx.attestation ? (
                    <div className="io-item io-item-stacked">
                      <div className="io-row-main">
                        <span className="mono detail-muted" style={{ fontSize: '0.84rem' }}>
                          OP_RETURN QVAI (AI Consensus Anchor)
                        </span>
                        <span className="amount mono detail-muted">0.00000000 QVNC</span>
                      </div>
                    </div>
                  ) : (
                    <div className="io-item">
                      <span className="detail-muted">No payment outputs</span>
                    </div>
                  )
                ) : (
                  recipients.map((out: any, index: number) => (
                    <div className="io-item io-item-stacked" key={`${out.address}:${out.vout_index}:${index}`}>
                      <div className="io-row-main">
                        <div className="io-address-wrap">
                          <a
                            href="#"
                            onClick={(e) => { e.preventDefault(); navigate(`/address/${out.address}`); }}
                            className="mono io-address"
                          >
                            {out.address}
                          </a>
                          {getKnownAddressTag(out.address) && (
                            <span
                              style={getKnownAddressTag(out.address)!.badgeStyle}
                              title={getKnownAddressTag(out.address)!.description}
                            >
                              {getKnownAddressTag(out.address)!.badgeText}
                            </span>
                          )}
                        </div>
                        <span className="amount mono">{formatQVNC(out.amount)}</span>
                      </div>
                    </div>
                  ))
                )}
                {changeOutputs.length > 0 ? (
                  <div className="io-change-list">
                    <div className="io-title detail-muted">Change</div>
                    {changeOutputs.map((out: any, index: number) => (
                      <div className="io-item io-item-stacked detail-muted" key={`change:${out.address}:${out.vout_index}:${index}`}>
                        <div className="io-row-main">
                          <div className="io-address-wrap">
                            <a
                              href="#"
                              onClick={(e) => { e.preventDefault(); navigate(`/address/${out.address}`); }}
                              className="mono io-address"
                            >
                              {out.address}
                            </a>
                            {getKnownAddressTag(out.address) && (
                              <span
                                style={getKnownAddressTag(out.address)!.badgeStyle}
                                title={getKnownAddressTag(out.address)!.description}
                              >
                                {getKnownAddressTag(out.address)!.badgeText}
                              </span>
                            )}
                          </div>
                          <span className="amount mono">{formatQVNC(out.amount)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="loading-box">Indexed input/output breakdown is not available for this transaction yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
