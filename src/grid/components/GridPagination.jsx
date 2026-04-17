const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const IconFirstPage = () => {
  return (
    <svg className='pagination__nav-icon' width='16' height='16' viewBox='0 0 24 24' fill='currentColor' aria-hidden focusable='false'>
      <path d='M18.41 16.59L13.83 12l4.58-4.59L17 6l-6 6 6 6zM6 6h2v12H6z' />
    </svg>
  );
};

const IconLastPage = () => {
  return (
    <svg className='pagination__nav-icon' width='16' height='16' viewBox='0 0 24 24' fill='currentColor' aria-hidden focusable='false'>
      <path d='M5.59 7.41L10.18 12l-4.59 4.59L7 18l6-6-6-6zM16 6h2v12h-2z' />
    </svg>
  );
};

const IconChevronLeft = () => {
  return (
    <svg className='pagination__nav-icon' width='16' height='16' viewBox='0 0 24 24' fill='currentColor' aria-hidden focusable='false'>
      <path d='M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z' />
    </svg>
  );
};
const IconChevronRight = () => {
  return (
    <svg className='pagination__nav-icon' width='16' height='16' viewBox='0 0 24 24' fill='currentColor' aria-hidden focusable='false'>
      <path d='M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z' />
    </svg>
  );
};

/**
 * Enterprise-style pagination: page size, range summary, first/prev/next/last.
 */
export const GridPagination = ({ page, totalPages, pageSize, totalCount, pageFrom, pageTo, onPageChange, onPageSizeChange, pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS }) => {
  const total = totalCount ?? 0;
  const safeTotalPages = total > 0 ? Math.max(totalPages, 1) : 1;
  const safePage = total > 0 ? page : 1;
  const atFirst = safePage <= 1;
  const atLast = total === 0 || safePage >= safeTotalPages;

  return (
    <footer className='pagination' role='navigation' aria-label='Table pagination'>
      <div className='pagination__inner'>
        <div className='pagination__group pagination__group--page-size'>
          <label className='pagination__label'>
            Page Size:
            <select className='pagination__select' value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} aria-label='Rows per page'>
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className='pagination__group pagination__group--range' aria-live='polite'>
          <span className='pagination__range'>
            {total > 0 ? (
              <>
                {pageFrom} to <strong>{pageTo}</strong> of <strong>{total}</strong>
              </>
            ) : (
              <>
                0 to <strong>0</strong> of <strong>0</strong>
              </>
            )}
          </span>
        </div>

        <div className='pagination__group pagination__group--nav'>
          <button type='button' className='pagination__icon-btn' aria-label='First page' disabled={atFirst} onClick={() => onPageChange(1)}>
            <IconFirstPage />
          </button>
          <button type='button' className='pagination__icon-btn' aria-label='Previous page' disabled={atFirst} onClick={() => onPageChange(safePage - 1)}>
            <IconChevronLeft />
          </button>
          <span className='pagination__page-status'>
            Page <strong>{total > 0 ? safePage : 0}</strong> of <strong>{total > 0 ? safeTotalPages : 0}</strong>
          </span>
          <button type='button' className='pagination__icon-btn' aria-label='Next page' disabled={atLast} onClick={() => onPageChange(safePage + 1)}>
            <IconChevronRight />
          </button>
          <button type='button' className='pagination__icon-btn' aria-label='Last page' disabled={atLast} onClick={() => onPageChange(safeTotalPages)}>
            <IconLastPage />
          </button>
        </div>
      </div>
    </footer>
  );
};
