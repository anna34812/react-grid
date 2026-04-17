import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getRows } from "../api/gridApi";

/** When not using server-side page params, request a single page large enough for the full filtered dataset. */
const UNPAGED_PAGE_SIZE = Number.MAX_SAFE_INTEGER;

export const useGridData = (queryState, setTotalCount, options = {}) => {
  const mode =
    options.paginationMode === "client" ? "client" : options.paginationMode === "none" ? "none" : "server";
  const paginationEnabled = mode !== "none";
  const clientSidePagination = mode === "client";

  const [sourceRows, setSourceRows] = useState([]);
  const requestIdRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
  }, [
    paginationEnabled,
    clientSidePagination,
    queryState.sortField,
    queryState.sortDirection,
    queryState.filters,
    queryState.treeMode,
    ...(paginationEnabled && !clientSidePagination ? [queryState.page, queryState.pageSize] : []),
  ]);

  const rows = useMemo(() => {
    if (!clientSidePagination) return sourceRows;
    const start = (queryState.page - 1) * queryState.pageSize;
    return sourceRows.slice(start, start + queryState.pageSize);
  }, [clientSidePagination, sourceRows, queryState.page, queryState.pageSize]);

  useEffect(() => {
    let active = true;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    async function loadRows() {
      setLoading(true);
      setError("");

      try {
        const response = await getRows(requestQuery);
        if (!active || requestId !== requestIdRef.current) return;

        setSourceRows(response.rows);
        setTotalCount(response.totalCount);
      } catch (requestError) {
        if (!active || requestId !== requestIdRef.current) return;

        setSourceRows([]);
        setError(requestError.message || "Failed to load rows");
      } finally {
        if (active && requestId === requestIdRef.current) setLoading(false);
      }
    }

    loadRows();

    return () => (active = false);
  }, [requestQuery, setTotalCount]);

  const setRows = useCallback((updater) => {
    setSourceRows((previous) => (typeof updater === "function" ? updater(previous) : updater));
  }, []);

  return { rows, loading, error, setRows };
};
