import { useCallback, useMemo, useState } from "react";
import { DEFAULT_QUERY_STATE } from "../utils/query";

export const useGridQuery = (initialState = {}) => {
  const [queryState, setQueryState] = useState({ ...DEFAULT_QUERY_STATE, ...initialState });

  const totalPages = useMemo(() => (queryState.pageSize > 0 ? Math.ceil((queryState.totalCount ?? 0) / queryState.pageSize) : 0), [queryState.pageSize, queryState.totalCount]);

  const setPage = useCallback((page) => setQueryState((previous) => ({ ...previous, page })), []);

  const setPageSize = useCallback((pageSize) => setQueryState((previous) => ({ ...previous, pageSize, page: 1 })), []);

  const setSort = useCallback((sortField, sortDirection) => setQueryState((previous) => ({ ...previous, sortField, sortDirection, page: 1 })), []);

  const setFilter = useCallback((field, value, operator = "contains") => {
    setQueryState((previous) => {
      const nextFilters = { ...previous.filters };
      if (value === "" || value == null) delete nextFilters[field];
      else nextFilters[field] = { value, operator };

      return { ...previous, filters: nextFilters, page: 1 };
    });
  }, []);

  const clearFilters = useCallback(() => {
    setQueryState((previous) => {
      const filters = previous.filters ?? {};
      if (Object.keys(filters).length === 0) return previous;

      return { ...previous, filters: {}, page: 1 };
    });
  }, []);

  const setTotalCount = useCallback((totalCount) => setQueryState((previous) => ({ ...previous, totalCount })), []);

  return { queryState, totalPages, setPage, setPageSize, setSort, setFilter, clearFilters, setTotalCount };
};
