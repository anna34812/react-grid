import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDistinctColumnValues } from '../api/gridApi';

/**
 * Debounced filter draft → query, set-filter popover state, and distinct values for set filters.
 */
export function useGridFilters({ enableFiltering, columns, queryState, setFilter, clearFilters, treeMode }) {
  const [filterDraft, setFilterDraft] = useState({});
  const [filterPopoverField, setFilterPopoverField] = useState(null);
  const [distinctByField, setDistinctByField] = useState({});
  const filterFunnelRefs = useRef({});

  useEffect(() => {
    if (!enableFiltering) {
      setFilterDraft({});
      clearFilters();
    }
  }, [enableFiltering, clearFilters]);

  useEffect(() => {
    if (!enableFiltering) return;
    const debounceId = setTimeout(() => {
      Object.entries(filterDraft).forEach(([field, draft]) => {
        const column = columns.find((c) => c.field === field);
        const op = draft.operator ?? column?.filterOperator ?? 'contains';

        if (draft.inValues !== undefined && Array.isArray(draft.inValues)) {
          if (draft.inValues.length === 0) {
            setFilter(field, [], 'in');
            return;
          }
          const distinct = distinctByField[field];
          if (distinct && distinct.length > 0) {
            const allSelected = draft.inValues.length === distinct.length && distinct.every((v) => draft.inValues.includes(v));
            if (allSelected) {
              const q = draft.quick ?? draft.value ?? '';
              setFilter(field, q, op);
              return;
            }
          }
          setFilter(field, draft.inValues, 'in');
          return;
        }

        const quick = draft.quick ?? draft.value ?? '';
        setFilter(field, quick, op);
      });
    }, 300);

    return () => clearTimeout(debounceId);
  }, [enableFiltering, filterDraft, setFilter, columns, distinctByField]);

  const closeFilterPopover = useCallback(() => setFilterPopoverField(null), []);

  const handlePopoverSelectionChange = useCallback((field, nextSelected) => {
    setFilterDraft((previous) => {
      const cur = previous[field] ?? { quick: '', operator: 'contains' };
      return { ...previous, [field]: { ...cur, inValues: nextSelected } };
    });
  }, []);

  const toggleColumnFilterPopover = useCallback(
    async (field) => {
      if (filterPopoverField === field) {
        setFilterPopoverField(null);
        return;
      }
      const vals = await fetchDistinctColumnValues(field, { treeMode });
      setDistinctByField((p) => ({ ...p, [field]: vals }));
      setFilterDraft((prev) => {
        const cur = prev[field] ?? {};
        const quick = cur.quick ?? cur.value ?? '';
        const op = cur.operator ?? columns.find((c) => c.field === field)?.filterOperator ?? 'contains';
        const applied = queryState.filters[field];
        let inValues;
        if (applied?.operator === 'in' && Array.isArray(applied.value)) {
          inValues = applied.value.map(String);
        } else {
          inValues = [...vals];
        }
        return { ...prev, [field]: { quick, operator: op, inValues } };
      });
      setFilterPopoverField(field);
    },
    [filterPopoverField, columns, queryState.filters, treeMode],
  );

  return {
    filterDraft,
    setFilterDraft,
    filterPopoverField,
    setFilterPopoverField,
    distinctByField,
    setDistinctByField,
    filterFunnelRefs,
    closeFilterPopover,
    handlePopoverSelectionChange,
    toggleColumnFilterPopover,
  };
}
