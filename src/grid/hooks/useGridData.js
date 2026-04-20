import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getRows } from '../api/gridApi';

/** When not using server-side page params, request a single page large enough for the full filtered dataset. */
const UNPAGED_PAGE_SIZE = Number.MAX_SAFE_INTEGER;

const resolvePaginationMode = (paginationMode) => {
  if (paginationMode === 'client') return 'client';
  if (paginationMode === 'none') return 'none';
  if (paginationMode === 'infinite') return 'infinite';
  return 'server';
};

export const useGridData = (queryState, setTotalCount, options = {}) => {
  const mode = resolvePaginationMode(options.paginationMode);
  const paginationEnabled = mode !== 'none';
  const clientSidePagination = mode === 'client';

  const [sourceRows, setSourceRows] = useState([]);
  const requestIdRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');

  const infiniteSignature = useMemo(
    () =>
      JSON.stringify({
        sortField: queryState.sortField,
        sortDirection: queryState.sortDirection,
        filters: queryState.filters ?? {},
        pageSize: queryState.pageSize,
        treeMode: queryState.treeMode ?? false,
      }),
    [queryState.sortField, queryState.sortDirection, queryState.filters, queryState.pageSize, queryState.treeMode],
  );

  const dataGenerationRef = useRef(0);
  const nextPageRef = useRef(1);
  const loadMoreInFlightRef = useRef(false);
  const loadedPagesRef = useRef(new Set());

  const requestQuery = useMemo(() => {
    const base = {
      sortField: queryState.sortField,
      sortDirection: queryState.sortDirection,
      filters: queryState.filters ?? {},
      treeMode: queryState.treeMode ?? false,
    };
    if (!paginationEnabled) {
      return { ...base, page: 1, pageSize: UNPAGED_PAGE_SIZE };
    }
    if (clientSidePagination) {
      return { ...base, page: 1, pageSize: UNPAGED_PAGE_SIZE };
    }
    return { ...base, page: queryState.page, pageSize: queryState.pageSize };
  }, [paginationEnabled, clientSidePagination, queryState.sortField, queryState.sortDirection, queryState.filters, queryState.treeMode, ...(paginationEnabled && !clientSidePagination ? [queryState.page, queryState.pageSize] : [])]);

  const rows = useMemo(() => {
    if (!clientSidePagination) return sourceRows;
    const start = (queryState.page - 1) * queryState.pageSize;
    return sourceRows.slice(start, start + queryState.pageSize);
  }, [clientSidePagination, sourceRows, queryState.page, queryState.pageSize]);

  /** Server-side infinite: reset and load page 1 when sort/filter/pageSize/tree changes. */
  useEffect(() => {
    if (mode !== 'infinite') return;

    dataGenerationRef.current += 1;
    const generation = dataGenerationRef.current;
    let active = true;
    nextPageRef.current = 1;
    loadedPagesRef.current = new Set();

    async function loadFirstPage() {
      setLoading(true);
      setLoadingMore(false);
      setError('');
      setHasMore(true);

      try {
        const response = await getRows({
          sortField: queryState.sortField,
          sortDirection: queryState.sortDirection,
          filters: queryState.filters ?? {},
          treeMode: queryState.treeMode ?? false,
          page: 1,
          pageSize: queryState.pageSize,
        });
        if (!active || generation !== dataGenerationRef.current) return;

        const chunk = response.rows ?? [];
        const total = response.totalCount ?? 0;
        setSourceRows(chunk);
        setTotalCount(total);
        loadedPagesRef.current = new Set([1]);
        nextPageRef.current = 2;
        setHasMore(chunk.length === queryState.pageSize && chunk.length < total);
      } catch (requestError) {
        if (!active || generation !== dataGenerationRef.current) return;

        setSourceRows([]);
        setError(requestError.message || 'Failed to load rows');
        setHasMore(false);
      } finally {
        if (active && generation === dataGenerationRef.current) setLoading(false);
      }
    }

    void loadFirstPage();

    return () => {
      active = false;
    };
  }, [mode, infiniteSignature, setTotalCount]);

  useEffect(() => {
    if (mode === 'infinite') return;

    let active = true;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    async function loadRows() {
      setLoading(true);
      setError('');

      try {
        const response = await getRows(requestQuery);
        if (!active || requestId !== requestIdRef.current) return;

        setSourceRows(response.rows ?? []);
        setTotalCount(response.totalCount ?? 0);
      } catch (requestError) {
        if (!active || requestId !== requestIdRef.current) return;

        setSourceRows([]);
        setError(requestError.message || 'Failed to load rows');
      } finally {
        if (active && requestId === requestIdRef.current) setLoading(false);
      }
    }

    loadRows();

    return () => (active = false);
  }, [mode, requestQuery, setTotalCount]);

  const loadMore = useCallback(async () => {
    if (mode !== 'infinite') return;
    if (loading || loadingMore || !hasMore) return;
    if (loadMoreInFlightRef.current) return;

    loadMoreInFlightRef.current = true;
    const generationAtStart = dataGenerationRef.current;
    const page = nextPageRef.current;
    if (loadedPagesRef.current.has(page)) {
      nextPageRef.current = page + 1;
      return;
    }

    setLoadingMore(true);
    setError('');

    try {
      const response = await getRows({
        sortField: queryState.sortField,
        sortDirection: queryState.sortDirection,
        filters: queryState.filters ?? {},
        treeMode: queryState.treeMode ?? false,
        page,
        pageSize: queryState.pageSize,
      });
      if (generationAtStart !== dataGenerationRef.current) return;

      const chunk = response.rows ?? [];
      const total = response.totalCount ?? 0;
      setTotalCount(total);

      if (chunk.length === 0) {
        loadedPagesRef.current.add(page);
        nextPageRef.current = page + 1;
        setHasMore(false);
        return;
      }

      let nextSnapshot;
      setSourceRows((prev) => {
        const existingIds = new Set(prev.map((row) => row.id));
        const uniqueChunk = chunk.filter((row) => !existingIds.has(row.id));
        nextSnapshot = [...prev, ...uniqueChunk];
        return nextSnapshot;
      });

      loadedPagesRef.current.add(page);
      const stillMore = chunk.length === queryState.pageSize && page * queryState.pageSize < total;
      setHasMore(stillMore);
      nextPageRef.current = page + 1;
    } catch (requestError) {
      if (generationAtStart !== dataGenerationRef.current) return;
      setError(requestError.message || 'Failed to load rows');
    } finally {
      loadMoreInFlightRef.current = false;
      if (generationAtStart === dataGenerationRef.current) setLoadingMore(false);
    }
  }, [mode, loading, loadingMore, hasMore, queryState.sortField, queryState.sortDirection, queryState.filters, queryState.treeMode, queryState.pageSize]);

  const setRows = useCallback((updater) => {
    setSourceRows((previous) => (typeof updater === 'function' ? updater(previous) : updater));
  }, []);

  return {
    rows,
    loading,
    error,
    setRows,
    loadingMore: mode === 'infinite' ? loadingMore : false,
    hasMore: mode === 'infinite' ? hasMore : false,
    loadMore: mode === 'infinite' ? loadMore : () => {},
  };
};
