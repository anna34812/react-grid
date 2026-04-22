import { useCallback, useEffect, useMemo, useState } from 'react';

const getRowIdentity = (row, fallback) => {
  const id = row?.id;
  if (id === undefined || id === null || id === '') return `__fallback__${fallback}`;
  return String(id);
};

const dedupeRowsByIdentity = (rows) => {
  const seen = new Set();
  return rows.filter((row, index) => {
    const identity = getRowIdentity(row, index);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
};

export const useDataGridRemoteData = ({ dataSource, fetchData, loadingProp, paginationMode, queryState, rows, loading, loadingMore, hasMore, loadMore, setRows, setPage, setTotalCount }) => {
  const usesExternalDataSource = Array.isArray(dataSource) || typeof fetchData === 'function';
  const [externalRows, setExternalRows] = useState(() => (Array.isArray(dataSource) ? dataSource : []));
  const [externalLoading, setExternalLoading] = useState(false);
  const [externalLoadingMore, setExternalLoadingMore] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!Array.isArray(dataSource)) return;
    setExternalRows(Array.isArray(dataSource) ? dataSource : []);
  }, [dataSource]);

  const gridRows = usesExternalDataSource ? externalRows : rows;
  const displayRows = useMemo(() => {
    if (!usesExternalDataSource || paginationMode !== 'client') return gridRows;
    const start = Math.max(0, (queryState.page - 1) * queryState.pageSize);
    return gridRows.slice(start, start + queryState.pageSize);
  }, [usesExternalDataSource, paginationMode, gridRows, queryState.page, queryState.pageSize]);
  const setGridRows = usesExternalDataSource ? setExternalRows : setRows;
  const gridLoading = usesExternalDataSource ? loadingProp || externalLoading : loading;
  const gridLoadingMore = usesExternalDataSource ? externalLoadingMore : loadingMore;
  const gridHasMore = usesExternalDataSource ? (paginationMode === 'infinite' ? gridRows.length < (queryState.totalCount ?? 0) : false) : hasMore;

  useEffect(() => {
    if (!usesExternalDataSource) return;
    if (paginationMode === 'client' || paginationMode === 'none') setTotalCount(gridRows.length);
  }, [usesExternalDataSource, paginationMode, gridRows.length, setTotalCount]);

  const externalLoadMore = useCallback(() => {
    if (paginationMode !== 'infinite') return;
    if (externalLoading || externalLoadingMore) return;
    if (queryState.totalCount > 0 && gridRows.length >= queryState.totalCount) return;
    setPage(queryState.page + 1);
  }, [paginationMode, externalLoading, externalLoadingMore, queryState.totalCount, queryState.page, gridRows.length, setPage]);
  const gridLoadMore = usesExternalDataSource ? externalLoadMore : loadMore;

  const currentQuery = useMemo(
    () => ({ page: queryState.page, pageSize: queryState.pageSize, sortField: queryState.sortField, sortDirection: queryState.sortDirection, filters: queryState.filters, paginationMode }),
    [queryState.page, queryState.pageSize, queryState.sortField, queryState.sortDirection, queryState.filters, paginationMode],
  );

  const runFetchData = useCallback(
    async (query) => {
      if (typeof fetchData !== 'function') return;
      if (paginationMode !== 'server' && paginationMode !== 'client' && paginationMode !== 'none' && paginationMode !== 'infinite') return;
      const appendMode = paginationMode === 'infinite' && query.page > 1;
      if (appendMode) setExternalLoadingMore(true);
      else setExternalLoading(true);
      try {
        const result = await fetchData({
          page: query.page,
          pageSize: query.pageSize,
          sortField: query.sortField,
          sortDirection: query.sortDirection,
          filters: query.filters,
          paginationMode: query.paginationMode,
        });
        const nextRows = dedupeRowsByIdentity(Array.isArray(result?.rows) ? result.rows : []);
        const nextTotal = Number.isFinite(result?.total) ? Number(result.total) : nextRows.length;
        setGridRows((previousRows) => (appendMode ? dedupeRowsByIdentity([...previousRows, ...nextRows]) : nextRows));
        setTotalCount(nextTotal);
      } finally {
        if (appendMode) setExternalLoadingMore(false);
        else setExternalLoading(false);
      }
    },
    [fetchData, paginationMode, setGridRows, setTotalCount],
  );

  useEffect(() => {
    if (typeof fetchData !== 'function') return;
    void runFetchData(currentQuery);
  }, [fetchData, currentQuery, runFetchData, reloadToken]);

  const requestReload = useCallback(() => setReloadToken((v) => v + 1), []);

  return {
    usesExternalDataSource,
    gridRows,
    displayRows,
    setGridRows,
    gridLoading,
    gridLoadingMore,
    gridHasMore,
    gridLoadMore,
    currentQuery,
    requestReload,
    setRemoteLoading: setExternalLoading,
  };
};
