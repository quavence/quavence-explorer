import React, { useEffect, useState } from 'react';
import { fetchJson } from '../utils/fetchJson';
import { formatTime, shortenHash } from '../utils/formatting';
import BlockPrimaryAmount from '../components/BlockPrimaryAmount';
import BlockActivityBadges from '../components/BlockActivityBadges';
import { Pagination, PageSizeSelect, formatShowingRange } from '../components/Pagination';
import LoadingState from '../components/LoadingState';

type Navigate = (to: string) => void;
type BlockFilter = 'all' | 'glyphs' | 'attestations' | 'transfers';

export default function BlocksListView({ navigate }: { navigate: (to: string) => void }) {
  const [data, setData] = useState<any>(null);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(50);
  const [filter, setFilter] = useState<BlockFilter>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: any = null;

    const loadBlocks = async (isBackground = false) => {
      if (!isBackground) setLoading(true);
      try {
        const filterQuery = filter !== 'all' ? `&filter=${filter}` : '';
        const json = await fetchJson<any>(`/api/blocks?limit=${limit}&offset=${offset}${filterQuery}`, null);
        if (!cancelled && json) {
          setData(json);
        }
      } catch {
        // silent fail in background
      } finally {
        if (!cancelled && !isBackground) {
          setLoading(false);
        }
      }
    };

    const poll = async () => {
      await loadBlocks(false);
      const scheduleNext = () => {
        if (cancelled) return;
        if (offset === 0) {
          timeoutId = setTimeout(async () => {
            if (cancelled) return;
            await loadBlocks(true);
            scheduleNext();
          }, 8000);
        }
      };
      scheduleNext();
    };

    poll();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [offset, limit, filter]);

  const handleFilterChange = (newFilter: BlockFilter) => {
    setFilter(newFilter);
    setOffset(0);
  };

  if (loading && !data) return <LoadingState message="Loading blocks..." />;
  if (!data) {
    return (
      <div className="error-box">
        Could not retrieve blocks list. Verify the Express API server is running on port 3039.
      </div>
    );
  }

  const total = data?.pagination?.total ?? 0;
  const blocksList = data?.blocks ?? [];
  const showingRange = formatShowingRange(offset, limit, total, blocksList.length);

  const handlePageSizeChange = (value: number) => {
    setLimit(value);
    setOffset(0);
  };

  return (
    <div className="panel">
      <div className="panel-header panel-header-stacked">
        <div className="panel-heading-row">
          <div className="panel-heading-main">
            <h3 className="panel-title">All Blocks ({total})</h3>
            <p className="panel-description">Indexed block history and activity ledger</p>
          </div>
          <div className="panel-heading-actions">
            <div className="filter-pills">
              <button
                type="button"
                className={`filter-pill-btn ${filter === 'all' ? 'active' : ''}`}
                onClick={() => handleFilterChange('all')}
              >
                ALL
              </button>
              <button
                type="button"
                className={`filter-pill-btn ${filter === 'glyphs' ? 'active' : ''}`}
                onClick={() => handleFilterChange('glyphs')}
                style={filter === 'glyphs' ? { borderColor: 'rgba(168, 85, 247, 0.4)', color: '#c084fc', background: 'rgba(168, 85, 247, 0.12)' } : undefined}
              >
                GLYPHS
              </button>
              <button
                type="button"
                className={`filter-pill-btn ${filter === 'attestations' ? 'active' : ''}`}
                onClick={() => handleFilterChange('attestations')}
                style={filter === 'attestations' ? { borderColor: 'rgba(56, 189, 248, 0.4)', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.12)' } : undefined}
              >
                AI ATTEST
              </button>
              <button
                type="button"
                className={`filter-pill-btn ${filter === 'transfers' ? 'active' : ''}`}
                onClick={() => handleFilterChange('transfers')}
                style={filter === 'transfers' ? { borderColor: 'rgba(52, 211, 153, 0.4)', color: '#34d399', background: 'rgba(52, 211, 153, 0.12)' } : undefined}
              >
                TRANSFERS
              </button>
            </div>
            <span className="result-summary">{showingRange}</span>
            <PageSizeSelect value={limit} onChange={handlePageSizeChange} />
          </div>
        </div>
      </div>
      <div className="table-responsive sticky-headers">
        <table className="dense-table">
          <thead>
            <tr>
              <th style={{ width: '120px' }}>Height</th>
              <th>Hash</th>
              <th>Time (UTC)</th>
              <th style={{ width: '60px', textAlign: 'center' }}>TXs</th>
              <th>Activity</th>
              <th className="col-amount" style={{ textAlign: 'right', paddingRight: '1rem' }}>Reward / Volume</th>
            </tr>
          </thead>
          <tbody>
            {blocksList.map((block: any) => (
              <tr key={block?.height}>
                <td>
                  <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/block/${block?.height}`); }} className="hash">
                    #{block?.height}
                  </a>
                  {block?.height === 0 && <span className="badge genesis" style={{ marginLeft: '6px' }}>GENESIS</span>}
                </td>
                <td>
                  <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/block/${block?.hash}`); }} className="hash">
                    {shortenHash(block?.hash)}
                  </a>
                </td>
                <td className="timestamp">{formatTime(block?.time)}</td>
                <td style={{ textAlign: 'center' }} className="mono">{block?.tx_count ?? 0}</td>
                <td>
                  <BlockActivityBadges block={block} />
                </td>
                <td className="col-amount" style={{ textAlign: 'right', paddingRight: '1rem' }}>
                  <BlockPrimaryAmount block={block} />
                </td>
              </tr>
            ))}
            {blocksList.length === 0 && (
              <tr>
                <td colSpan={6} className="table-empty">
                  {filter === 'all' ? 'No blocks found' : `No blocks found for filter: ${filter}`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination limit={limit} offset={offset} total={total} onPageChange={setOffset} />
    </div>
  );
}


