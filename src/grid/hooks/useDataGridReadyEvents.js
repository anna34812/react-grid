import { useEffect, useMemo, useRef } from 'react';

export const useDataGridReadyEvents = ({ onReady, onQueryChange, currentQuery, setGridRows, gridRows, setRemoteLoading, setTotalCount, setPage, setPageSize, setSort, setFilter, clearFilters, requestReload }) => {
  const readyApi = useMemo(
    () => ({
      setRows: (nextRows) => setGridRows(Array.isArray(nextRows) ? nextRows : []),
      getRows: () => gridRows,
      getQuery: () => currentQuery,
      setLoading: (nextLoading) => setRemoteLoading(Boolean(nextLoading)),
      setTotalCount: (nextTotal) => setTotalCount(nextTotal),
      setPage,
      setPageSize,
      setSort,
      setFilter,
      clearFilters,
      resetPagination: ({ page = 1, pageSize, clearRows = false, clearTotal = false, reload = true } = {}) => {
        if (clearRows) setGridRows([]);
        if (clearTotal) setTotalCount(0);
        if (Number.isFinite(pageSize)) setPageSize(Number(pageSize));
        setPage(page);
        if (reload) requestReload();
      },
      reload: ({ clearRows = false, clearTotal = false } = {}) => {
        if (clearRows) setGridRows([]);
        if (clearTotal) setTotalCount(0);
        requestReload();
      },
    }),
    [setGridRows, gridRows, currentQuery, setRemoteLoading, setTotalCount, setPage, setPageSize, setSort, setFilter, clearFilters, requestReload],
  );

  const didEmitReadyRef = useRef(false);
  const didEmitInitialQueryRef = useRef(false);
  const previousQueryRef = useRef(null);

  useEffect(() => {
    if (didEmitReadyRef.current || typeof onReady !== 'function') return;
    didEmitReadyRef.current = true;
    onReady({ api: readyApi });
  }, [onReady, readyApi]);

  useEffect(() => {
    if (typeof onQueryChange !== 'function') return;
    const nextQuery = currentQuery;
    if (!didEmitInitialQueryRef.current) {
      didEmitInitialQueryRef.current = true;
      previousQueryRef.current = nextQuery;
      return;
    }

    const previous = previousQueryRef.current;
    previousQueryRef.current = nextQuery;
    if (!previous) return;

    let reason = 'query';
    if (previous.page !== nextQuery.page) reason = 'page';
    else if (previous.pageSize !== nextQuery.pageSize) reason = 'pageSize';
    else if (previous.sortField !== nextQuery.sortField || previous.sortDirection !== nextQuery.sortDirection) reason = 'sort';
    else if (JSON.stringify(previous.filters) !== JSON.stringify(nextQuery.filters)) reason = 'filter';
    onQueryChange({ query: nextQuery, reason, api: readyApi });
  }, [onQueryChange, currentQuery, readyApi]);
};
