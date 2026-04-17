const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/**
 * Pagination bar: page size, prev/next, and range summary.
 */
export function GridPagination({ page, totalPages, pageSize, totalCount, pageFrom, pageTo, hasRows, onPageChange, onPageSizeChange, pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS }) {
  return (
    <div className='pagination'>
      <div className='grid-toolbar'>
        <label>
          Page size
          <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button type='button' disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        Prev
      </button>
      <span>
        Page {page} / {Math.max(totalPages, 1)}
      </span>
      <button type='button' disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        Next
      </button>
      <span>
        Showing {hasRows ? pageFrom : 0}-{hasRows ? pageTo : 0} of {totalCount || 0}
      </span>
    </div>
  );
}
