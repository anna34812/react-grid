export function GridInfiniteFooter({ pageSize, totalCount, loadedCount, onPageSizeChange, loadingMore, hasMore }) {
  const safeTotal = totalCount ?? 0;
  const statusText = loadingMore ? 'Loading more…' : hasMore ? 'Scroll for more' : 'All rows loaded';

  return (
    <nav className="pagination pagination--infinite" aria-label="Infinite scroll table status">
      <div className="pagination__inner">
        <div className="pagination__left">
          <label className="pagination__label" htmlFor="infinite-page-size">
            Rows
          </label>
          <select id="infinite-page-size" className="pagination__select" value={pageSize} onChange={(event) => onPageSizeChange?.(Number(event.target.value))}>
            {[10, 20, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
        <div className="pagination__meta">
          Loaded {loadedCount} / {safeTotal}
          <span className={loadingMore ? 'pagination__infinite-loading' : hasMore ? 'pagination__infinite-hint' : 'pagination__infinite-end'}>{statusText}</span>
        </div>
      </div>
    </nav>
  );
}
