import React, { useEffect, useState } from 'react';
import { fetchJson } from '../utils/fetchJson';
import { formatTime, shortenHash } from '../utils/formatting';
import BlockPrimaryAmount from '../components/BlockPrimaryAmount';
import { Pagination, PageSizeSelect, formatShowingRange } from '../components/Pagination';

type Navigate = (to: string) => void;

export default function BlocksListView({ navigate }: { navigate: (to: string) => void }) {
  const [data, setData] = useState<any>(null);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(true);

  const loadBlocks = async () => {
    setLoading(true);
    const json = await fetchJson<any>(`/api/blocks?limit=${limit}&offset=${offset}`, null);
    setData(json);
    setLoading(false);
  };

  useEffect(() => {
    loadBlocks();
  }, [offset, limit]);

  if (loading && !data) return <div className="loading-box">Loading blocks...</div>;
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
            <p className="panel-description">Indexed block history</p>
          </div>
          <div className="panel-heading-actions">
            <span className="result-summary">{showingRange}</span>
            <PageSizeSelect value={limit} onChange={handlePageSizeChange} />
          </div>
        </div>
      </div>
      <div className="table-responsive sticky-headers">
        <table className="dense-table">
          <thead>
            <tr>
              <th style={{ width: '130px' }}>Height</th>
              <th>Hash</th>
              <th>Time (UTC)</th>
              <th style={{ width: '90px', textAlign: 'center' }}>TXs</th>
              <th className="col-amount" style={{ textAlign: 'right', paddingRight: '1rem' }}>Block Reward / Amount</th>
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
                <td className="col-amount" style={{ textAlign: 'right', paddingRight: '1rem' }}>
                  <BlockPrimaryAmount block={block} />
                </td>
              </tr>
            ))}
            {blocksList.length === 0 && (
              <tr>
                <td colSpan={5} className="table-empty">No blocks found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination limit={limit} offset={offset} total={total} onPageChange={setOffset} />
    </div>
  );
}


