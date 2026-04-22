export const InfiniteScrollLoadingRow = ({ gridTemplateColumns, pane }) => (
  <div role="row" className="data-grid-row data-grid-row--loading" style={{ gridTemplateColumns }}>
    <div
      role="gridcell"
      className={`data-grid-cell data-grid-cell--loading ${pane === 'center' ? 'data-grid-cell--loading-primary' : 'data-grid-cell--loading-peer'}`}
      style={{ gridColumn: '1 / -1' }}
      aria-hidden={pane === 'center' ? undefined : true}
    >
      {pane === 'center' ? (
        <>
          <span className="grid-loading-spinner" aria-hidden />
          <span className="grid-infinite-loading-row__text">One moment please…</span>
        </>
      ) : (
        <span className="grid-infinite-loading-row__peer-fill" aria-hidden />
      )}
    </div>
  </div>
);
