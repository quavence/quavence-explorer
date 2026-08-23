const PAGE_SIZE_OPTIONS = [25, 50, 100];

export function Pagination({ limit, offset, total, onPageChange }: { limit: number; offset: number; total: number; onPageChange: (newOffset: number) => void }) {
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);

  if (totalPages <= 1) return null;

  const pages: (number | 'ellipsis')[] = [];

  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    if (currentPage <= 4) {
      pages.push(1, 2, 3, 4, 5, 'ellipsis', totalPages);
    } else if (currentPage >= totalPages - 3) {
      pages.push(1, 'ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    } else {
      pages.push(1, 'ellipsis', currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2, 'ellipsis', totalPages);
    }
  }

  return (
    <div className="pagination numbered-pagination">
      <button
        className="pagination-btn"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(Math.max(0, offset - limit))}
      >
        Previous
      </button>
      {pages.map((p, idx) =>
        p === 'ellipsis' ? (
          <span key={idx} className="pagination-ellipsis">...</span>
        ) : (
          <button
            key={p}
            className={`pagination-btn ${p === currentPage ? 'active' : ''}`}
            onClick={() => onPageChange((p - 1) * limit)}
          >
            {p}
          </button>
        )
      )}
      <button
        className="pagination-btn"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(offset + limit)}
      >
        Next
      </button>
    </div>
  );
}

export function formatShowingRange(offset: number, limit: number, total: number, itemCount: number): string {
  if (total <= 0 || itemCount <= 0) return 'Showing 0 of 0';
  const start = offset + 1;
  const end = Math.min(offset + itemCount, total);
  return `Showing ${start}-${end} of ${total}`;
}

export function PageSizeSelect({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="page-size-control">
      <span className="page-size-label">Rows</span>
      <div className="page-size-segments" aria-label="Rows per page">
        {PAGE_SIZE_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            className={`page-size-segment ${option === value ? 'active' : ''}`}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
