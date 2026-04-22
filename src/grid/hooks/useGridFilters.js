import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDistinctColumnValues } from '../api/gridApi';

/**
 * Header quick filter: debounced draft → query.
 * Set ("in") filter: popover-only selection until Apply commits via setFilter.
 */
export function useGridFilters({ enableFiltering, columns, queryState, setFilter, clearFilters, treeMode }) {
  const [filterDraft, setFilterDraft] = useState({});
  const [filterPopoverField, setFilterPopoverField] = useState(null);
  /** Pending checkbox values for the open popover only; not synced to query until Apply. */
  const [filterPopoverSelection, setFilterPopoverSelection] = useState([]);
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
        const quick = draft.quick ?? draft.value ?? '';
        setFilter(field, quick, op);
      });
    }, 300);

    return () => clearTimeout(debounceId);
  }, [enableFiltering, filterDraft, setFilter, columns]);

  const closeFilterPopover = useCallback(() => {
    setFilterPopoverField(null);
    setFilterPopoverSelection([]);
  }, []);

  const applyFilterPopover = useCallback(() => {
    const field = filterPopoverField;
    if (!field) return;

    const distinct = distinctByField[field];
    const pending = filterPopoverSelection;
    const column = columns.find((c) => c.field === field);
    const op = filterDraft[field]?.operator ?? column?.filterOperator ?? 'contains';
    const quick = filterDraft[field]?.quick ?? filterDraft[field]?.value ?? '';

    if (!distinct || distinct.length === 0) {
      closeFilterPopover();
      return;
    }

    if (pending.length === 0) {
      setFilter(field, [], 'in');
    } else {
      const allSelected = pending.length === distinct.length && distinct.every((v) => pending.includes(String(v)));
      if (allSelected) {
        setFilter(field, quick, op);
      } else {
        setFilter(field, pending, 'in');
      }
    }
    closeFilterPopover();
  }, [filterPopoverField, distinctByField, filterPopoverSelection, columns, filterDraft, setFilter, closeFilterPopover]);

  const toggleColumnFilterPopover = useCallback(
    async (field) => {
      if (filterPopoverField === field) {
        closeFilterPopover();
        return;
      }
      const vals = await fetchDistinctColumnValues(field, { treeMode });
      setDistinctByField((p) => ({ ...p, [field]: vals }));
      const applied = queryState.filters[field];
      let initialSelection;
      if (applied?.operator === 'in' && Array.isArray(applied.value)) {
        initialSelection = applied.value.map((v) => String(v));
      } else {
        initialSelection = vals.map((v) => String(v));
      }
      setFilterPopoverSelection(initialSelection);
      setFilterPopoverField(field);
    },
    [filterPopoverField, queryState.filters, treeMode, closeFilterPopover],
  );

  return {
    filterDraft,
    setFilterDraft,
    filterPopoverField,
    setFilterPopoverField,
    filterPopoverSelection,
    setFilterPopoverSelection,
    distinctByField,
    setDistinctByField,
    filterFunnelRefs,
    closeFilterPopover,
    applyFilterPopover,
    toggleColumnFilterPopover,
  };
}
