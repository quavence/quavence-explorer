import React, { useEffect, useState } from 'react';
import { fetchJson } from '../utils/fetchJson';
import { formatTime, shortenHash } from '../utils/formatting';
import { isolateSvgGradients } from '../utils/svg';
import { Pagination, PageSizeSelect, formatShowingRange } from '../components/Pagination';
import LoadingState from '../components/LoadingState';
import CustomSelect from '../components/CustomSelect';

type Navigate = (to: string) => void;
type RarityFilter = 'all' | 'legendary' | 'epic' | 'rare' | 'common';
type SortOption = 'edition_asc' | 'edition_desc' | 'newest';

const SORT_OPTIONS = [
  { value: 'edition_asc', label: 'Edition (Asc)' },
  { value: 'edition_desc', label: 'Edition (Desc)' },
  { value: 'newest', label: 'Newest Mint' },
];

export default function GlyphsView({
  navigate,
  initialSelection,
}: {
  navigate: (to: string) => void;
  initialSelection?: string;
}) {
  const [data, setData] = useState<any>(null);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(24);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [rarity, setRarity] = useState<RarityFilter>('all');
  const [sort, setSort] = useState<SortOption>('edition_asc');
  const [loading, setLoading] = useState(true);
  const [selectedGlyph, setSelectedGlyph] = useState<any>(null);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Load glyphs catalog
  useEffect(() => {
    let cancelled = false;

    const loadGlyphs = async () => {
      setLoading(true);
      try {
        const queryParams = new URLSearchParams({
          limit: limit.toString(),
          offset: offset.toString(),
          sort,
        });
        if (debouncedSearch) queryParams.set('search', debouncedSearch);
        if (rarity !== 'all') queryParams.set('rarity', rarity);

        const json = await fetchJson<any>(`/api/glyphs?${queryParams.toString()}`, null);
        if (!cancelled && json) {
          setData(json);
        }
      } catch {
        // silent fail
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadGlyphs();

    return () => {
      cancelled = true;
    };
  }, [offset, limit, debouncedSearch, rarity, sort]);

  // Handle initial selection if navigating directly to a glyph
  useEffect(() => {
    if (initialSelection) {
      fetchJson<any>(`/api/glyphs/${initialSelection}`, null).then((res) => {
        if (res) setSelectedGlyph(res);
      });
    }
  }, [initialSelection]);

  const items = data?.items ?? [];
  const total = data?.pagination?.total ?? 0;
  const stats = data?.stats ?? { totalMinted: 0, uniqueHolders: 0, consensusRatio: '100% PoUS', carrierBaseSat: 10000 };
  const showingRange = formatShowingRange(offset, limit, total, items.length);

  const handlePageSizeChange = (val: number) => {
    setLimit(val);
    setOffset(0);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Telemetry KPI Metrics */}
      <section className="telemetry-grid">
        <div className="telemetry-cell">
          <div className="telemetry-header">
            <span className="telemetry-label">Official Registry</span>
            <span className="telemetry-pill pill-pos">POUS L1</span>
          </div>
          <div className="telemetry-main">
            <span className="telemetry-value mono">{stats.totalMinted}</span>
          </div>
          <div className="telemetry-meta-grid">
            <div className="meta-item">
              <span className="meta-label">Consensus State</span>
              <span className="meta-value mono">{stats.consensusRatio}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">On-Chain Layer</span>
              <span className="meta-value mono">Quavence L1</span>
            </div>
          </div>
        </div>

        <div className="telemetry-cell">
          <div className="telemetry-header">
            <span className="telemetry-label">Unique Holders</span>
            <span className="telemetry-pill pill-neutral">DISTRIBUTED</span>
          </div>
          <div className="telemetry-main">
            <span className="telemetry-value mono">{stats.uniqueHolders}</span>
          </div>
          <div className="telemetry-meta-grid">
            <div className="meta-item">
              <span className="meta-label">Carrier UTXO</span>
              <span className="meta-value mono">10 000 sat</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Dust Value</span>
              <span className="meta-value mono">0.00010000 QVNC</span>
            </div>
          </div>
        </div>

        <div className="telemetry-cell">
          <div className="telemetry-header">
            <span className="telemetry-label">Cryptographic Proof</span>
            <span className="telemetry-pill pill-pos">VERIFIED</span>
          </div>
          <div className="telemetry-main">
            <span className="telemetry-value mono" style={{ fontSize: '1.25rem', color: '#c084fc' }}>
              VRF + SHA256
            </span>
          </div>
          <div className="telemetry-meta-grid">
            <div className="meta-item">
              <span className="meta-label">AI Quorum</span>
              <span
                className="meta-value mono"
                title="DePIN PoUS Protocol: Multi-node quorum consensus (2+ operator verification)"
              >
                Multi-Node
              </span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Carrier Script</span>
              <span className="meta-value mono">OP_RETURN</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Catalog Panel */}
      <div className="panel">
        <div className="panel-header panel-header-stacked">
          <div className="panel-heading-row">
            <div className="panel-heading-main">
              <h3 className="panel-title">Official PoUS AI Glyphs ({total})</h3>
              <p className="panel-description">
                Official on-chain vector artifacts linked to verified PoUS work and minted on Quavence L1
              </p>
            </div>
            <div className="panel-heading-actions">
              <span className="result-summary">{showingRange}</span>
              <PageSizeSelect value={limit} onChange={handlePageSizeChange} />
            </div>
          </div>
        </div>

        {/* Toolbar: Search, Filters & Sorting */}
        <div
          style={{
            padding: '0.85rem 1rem',
            borderBottom: '1px solid var(--border-subtle)',
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
          }}
        >
          {/* Search box */}
          <div style={{ position: 'relative', width: '280px', maxWidth: '100%' }}>
            <input
              type="text"
              placeholder="Search by edition #, title, or holder..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
              style={{
                width: '100%',
                padding: '0.35rem 0.75rem',
                fontSize: '0.78rem',
                backgroundColor: 'rgba(3, 7, 18, 0.75)',
                borderColor: 'var(--border-divider)',
                borderRadius: '4px',
              }}
            />
          </div>

          {/* Rarity Filter Pills */}
          <div className="filter-pills">
            {(['all', 'legendary', 'epic', 'rare', 'common'] as RarityFilter[]).map((r) => (
              <button
                key={r}
                type="button"
                className={`filter-pill-btn ${rarity === r ? 'active' : ''}`}
                onClick={() => { setRarity(r); setOffset(0); }}
                style={
                  rarity === r && r === 'legendary'
                    ? { borderColor: 'rgba(192, 132, 252, 0.4)', color: '#c084fc', background: 'rgba(192, 132, 252, 0.12)' }
                    : rarity === r && r === 'rare'
                    ? { borderColor: 'rgba(56, 189, 248, 0.4)', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.12)' }
                    : undefined
                }
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Sorting */}
          <CustomSelect
            value={sort}
            onChange={(val) => { setSort(val as SortOption); setOffset(0); }}
            options={SORT_OPTIONS}
            labelPrefix="Sort:"
          />
        </div>

        {/* Content Body: Grid of Glyphs */}
        <div className="panel-body" style={{ padding: '1rem' }}>
          {loading && !data ? (
            <LoadingState message="Loading official PoUS Glyphs catalog..." />
          ) : items.length === 0 ? (
            <div className="no-results-box" style={{ margin: '1rem 0' }}>
              <h2>No artifacts found</h2>
              <p style={{ marginTop: '0.5rem', color: '#94a3b8' }}>
                {search || rarity !== 'all'
                  ? 'Try modifying your search or rarity filter criteria.'
                  : 'No on-chain PoUS Glyphs indexed in the network yet.'}
              </p>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '1rem',
                alignItems: 'stretch',
              }}
            >
              {items.map((item: any, idx: number) => {
                const svgOrImg = item.svgContent || item.imageRef;
                const isDataSvg = typeof svgOrImg === 'string' && svgOrImg.startsWith('data:image/svg+xml');
                const isRawSvg = typeof svgOrImg === 'string' && svgOrImg.includes('<svg');
                const decodedSvg = isDataSvg
                  ? decodeURIComponent(svgOrImg.replace(/^data:image\/svg\+xml;utf8,/, ''))
                  : null;

                const rarityColor =
                  item.rarity?.toLowerCase() === 'legendary'
                    ? '#c084fc'
                    : item.rarity?.toLowerCase() === 'epic'
                    ? '#f472b6'
                    : item.rarity?.toLowerCase() === 'rare'
                    ? '#38bdf8'
                    : '#94a3b8';

                return (
                  <div
                    key={idx}
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
                      transition: 'border-color 0.15s ease, transform 0.15s ease',
                    }}
                  >
                    {/* Visual Vector Container */}
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <div
                        onClick={() => navigate(`/glyphs/${item.edition}`)}
                        style={{
                          width: 140,
                          height: 140,
                          borderRadius: 10,
                          background: '#030712',
                          border: '1px solid rgba(168, 85, 247, 0.35)',
                          boxShadow: '0 4px 14px rgba(168, 85, 247, 0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                          padding: 4,
                          cursor: 'pointer',
                        }}
                        title="Click to view full on-chain glyph page"
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
                              __html: isolateSvgGradients(decodedSvg || svgOrImg, item.edition || item.id || idx),
                            }}
                          />
                        ) : (
                          <img
                            src={svgOrImg}
                            alt={item.name}
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                          />
                        )}
                      </div>
                    </div>

                    {/* Metadata block */}
                    <div>
                      {/* Title + Edition Badge Slot */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: '0.5rem',
                          minHeight: '2.5rem',
                          marginBottom: '0.25rem',
                        }}
                      >
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
                            cursor: 'pointer',
                          }}
                          onClick={() => navigate(`/glyphs/${item.edition}`)}
                          title={item.name}
                        >
                          {item.name}
                        </div>
                        <span
                          className="badge glyph"
                          style={{ fontSize: '0.7rem', flexShrink: 0, marginTop: '2px', cursor: 'pointer' }}
                          onClick={() => navigate(`/glyphs/${item.edition}`)}
                        >
                          #{item.edition}
                        </span>
                      </div>

                      {/* Theme & Rarity Slot */}
                      <div
                        style={{
                          minHeight: '2.5rem',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                        }}
                      >
                        {item.theme ? (
                          <div
                            style={{
                              fontSize: '0.8rem',
                              color: '#94a3b8',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              marginBottom: '0.2rem',
                            }}
                            title={item.theme}
                          >
                            {item.theme}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.2rem' }}>—</div>
                        )}
                        <div
                          style={{
                            fontSize: '0.78rem',
                            color: rarityColor,
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}
                        >
                          {item.rarity}
                        </div>
                      </div>

                      {/* Current Carrier Holder */}
                      <div
                        style={{
                          marginTop: '0.4rem',
                          fontSize: '0.72rem',
                          color: 'var(--text-dim)',
                          fontFamily: 'var(--font-mono)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        <span style={{ color: '#64748b' }}>Holder: </span>
                        {item.carrierAddress ? (
                          <a
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              navigate(`/address/${item.carrierAddress}`);
                            }}
                            className="hash"
                            style={{ color: '#93c5fd' }}
                            title={item.carrierAddress}
                          >
                            {shortenHash(item.carrierAddress)}
                          </a>
                        ) : (
                          'Unassigned'
                        )}
                      </div>
                    </div>

                    {/* Action footer */}
                    <div
                      style={{
                        marginTop: 'auto',
                        paddingTop: '0.65rem',
                        borderTop: '1px solid rgba(51, 65, 85, 0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => navigate(`/glyphs/${item.edition}`)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          fontSize: '0.78rem',
                          color: '#c084fc',
                          cursor: 'pointer',
                          fontWeight: 500,
                        }}
                      >
                        Inspect Details →
                      </button>
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(`/tx/${item.txid}`);
                        }}
                        style={{ fontSize: '0.78rem', color: '#38bdf8', textDecoration: 'none' }}
                      >
                        Txid →
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination footer */}
        <Pagination limit={limit} offset={offset} total={total} onPageChange={setOffset} />
      </div>

      {/* Detail Inspection Modal */}
      {selectedGlyph && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1.5rem',
          }}
          onClick={() => setSelectedGlyph(null)}
        >
          <div
            style={{
              background: '#0B0F19',
              border: '1px solid rgba(168, 85, 247, 0.4)',
              borderRadius: 14,
              maxWidth: '680px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#f8fafc', fontWeight: 600 }}>
                  {selectedGlyph.name || `PoUS Glyph #${selectedGlyph.edition}`}
                </h3>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                  Edition #{selectedGlyph.edition} · {selectedGlyph.theme}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGlyph(null)}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid var(--border-divider)',
                  color: '#94a3b8',
                  borderRadius: 6,
                  padding: '0.35rem 0.65rem',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                ✕ Close
              </button>
            </div>

            {/* Modal Artwork Large */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div
                style={{
                  width: 240,
                  height: 240,
                  borderRadius: 12,
                  background: '#030712',
                  border: '1px solid rgba(168, 85, 247, 0.45)',
                  boxShadow: '0 8px 32px rgba(168, 85, 247, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  padding: 8,
                }}
              >
                {selectedGlyph.svgContent?.includes('<svg') ||
                selectedGlyph.svgContent?.startsWith('data:image/svg+xml') ? (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    dangerouslySetInnerHTML={{
                      __html: isolateSvgGradients(
                        selectedGlyph.svgContent.startsWith('data:image/svg+xml')
                          ? decodeURIComponent(selectedGlyph.svgContent.replace(/^data:image\/svg\+xml;utf8,/, ''))
                          : selectedGlyph.svgContent,
                        selectedGlyph.edition || selectedGlyph.id || 'inspect'
                      ),
                    }}
                  />
                ) : (
                  <img
                    src={selectedGlyph.svgContent || selectedGlyph.imageRef}
                    alt={selectedGlyph.name}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                )}
              </div>
            </div>

            {/* Technical Parameters Table */}
            <div
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                borderRadius: 8,
                border: '1px solid var(--border-subtle)',
                padding: '0.75rem',
              }}
            >
              <div className="detail-row" style={{ padding: '0.45rem 0.25rem' }}>
                <div className="detail-label">Rarity Tier</div>
                <div className="detail-value">
                  <span className="badge glyph">{selectedGlyph.rarity}</span>
                </div>
              </div>
              <div className="detail-row" style={{ padding: '0.45rem 0.25rem' }}>
                <div className="detail-label">Current Holder</div>
                <div className="detail-value mono">
                  {selectedGlyph.carrierAddress ? (
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setSelectedGlyph(null);
                        navigate(`/address/${selectedGlyph.carrierAddress}`);
                      }}
                      className="hash"
                    >
                      {selectedGlyph.carrierAddress}
                    </a>
                  ) : (
                    '—'
                  )}
                </div>
              </div>
              <div className="detail-row" style={{ padding: '0.45rem 0.25rem' }}>
                <div className="detail-label">Carrier UTXO</div>
                <div className="detail-value mono">
                  {selectedGlyph.carrierAmount ? `${(selectedGlyph.carrierAmount / 100000000).toFixed(8)} QVNC` : '0.00010000 QVNC'}
                </div>
              </div>
              <div className="detail-row" style={{ padding: '0.45rem 0.25rem' }}>
                <div className="detail-label">Mint Block</div>
                <div className="detail-value mono">
                  {selectedGlyph.blockHeight ? (
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setSelectedGlyph(null);
                        navigate(`/block/${selectedGlyph.blockHeight}`);
                      }}
                    >
                      #{selectedGlyph.blockHeight}
                    </a>
                  ) : (
                    '—'
                  )}
                </div>
              </div>
              <div className="detail-row" style={{ padding: '0.45rem 0.25rem' }}>
                <div className="detail-label">Carrier TXID</div>
                <div className="detail-value mono" style={{ wordBreak: 'break-all' }}>
                  {selectedGlyph.txid ? (
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setSelectedGlyph(null);
                        navigate(`/tx/${selectedGlyph.txid}`);
                      }}
                      className="hash"
                    >
                      {selectedGlyph.txid}
                    </a>
                  ) : (
                    '—'
                  )}
                </div>
              </div>
              {selectedGlyph.glyphHash && (
                <div className="detail-row" style={{ padding: '0.45rem 0.25rem' }}>
                  <div className="detail-label">Glyph Hash</div>
                  <div className="detail-value mono" style={{ wordBreak: 'break-all', fontSize: '0.75rem' }}>
                    {selectedGlyph.glyphHash}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="terminal-link-btn"
                onClick={() => {
                  if (selectedGlyph.svgContent) {
                    const blob = new Blob([
                      selectedGlyph.svgContent.startsWith('data:image/svg+xml')
                        ? decodeURIComponent(selectedGlyph.svgContent.replace(/^data:image\/svg\+xml;utf8,/, ''))
                        : selectedGlyph.svgContent,
                    ], { type: 'image/svg+xml' });
                    const url = URL.createObjectURL(blob);
                    window.open(url, '_blank');
                  }
                }}
                style={{ cursor: 'pointer', background: 'none', border: 'none' }}
              >
                Open Vector SVG ↗
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
