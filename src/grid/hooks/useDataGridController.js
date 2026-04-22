import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { patchRow } from '../api/gridApi';
import { useGridQuery } from './useGridQuery';
import { useGridData } from './useGridData';
import { useInlineEdit } from './useInlineEdit';
import { nextSortDirection } from '../utils/gridSort';
import { reorderRowsById } from '../utils/rowOrder';
import { useGridColumnOrder } from './useGridColumnOrder';
import { useGridEditFocus } from './useGridEditFocus';
import { useGridFilters } from './useGridFilters';
import { useGridRowSelection } from './useGridRowSelection';
import { useGridSplitPaneScrollSync } from './useGridSplitPaneScrollSync';
import { useGridSplitSync } from './useGridSplitSync';
import { useGridColumnResize } from './useGridColumnResize';
import { useDataGridRemoteData } from './useDataGridRemoteData';
import { useDataGridReadyEvents } from './useDataGridReadyEvents';

export const useDataGridController = ({ columns, dataSource, fetchData, loading: loadingProp = false, onReady, onQueryChange, resetPaginationTrigger, columnOrder: columnOrderProp, onColumnOrderChange, enableColumnReorder = false, enableRowDrag = false, onRowOrderChange, rowSelection: rowSelectionProp, onSelectionChange, onEditedRowsChange, enableFiltering = true, enableColumnResize = true, paginationMode = 'server', columnSizeMode }) => {
  const SIDE_X_OVERFLOW_THRESHOLD_PX = 6;
  const { queryState, totalPages, setPage, setPageSize, setSort, setFilter, clearFilters, setTotalCount } = useGridQuery();
  const { rows, loading, loadingMore, hasMore, loadMore, setRows } = useGridData(queryState, setTotalCount, { paginationMode });
  const { gridRows, displayRows, setGridRows, gridLoading, gridLoadingMore, gridHasMore, gridLoadMore, currentQuery, requestReload, setRemoteLoading } = useDataGridRemoteData({
    dataSource,
    fetchData,
    loadingProp,
    paginationMode,
    queryState,
    rows,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    setRows,
    setPage,
    setTotalCount,
  });
  const { editingCell, draftValue, savingCell, editError, setDraftValue, startEdit, cancelEdit, saveEdit } = useInlineEdit(setGridRows);
  const [dragOverRowId, setDragOverRowId] = useState(null);
  const editedRowsRef = useRef(new Map());
  const [customSavingCell, setCustomSavingCell] = useState(null);
  const gridMeasureRootRef = useRef(null);
  const infiniteScrollRootRef = useRef(null);
  const infiniteSentinelRef = useRef(null);
  const paneScrollRefs = useRef({ left: null, right: null });
  const [sidePaneHasRealX, setSidePaneHasRealX] = useState({ left: false, right: false });

  const { orderedColumns, pinnedOverrides, dragOverField, setDragOverField, handleColumnDrop, handleColumnHeaderDragStart, setPinForField } = useGridColumnOrder({ columns, columnOrder: columnOrderProp, onColumnOrderChange, enableColumnReorder });
  const { columnWidths, startResize, autoFitColumn, resizingField } = useGridColumnResize({ enabled: enableColumnResize, columns: orderedColumns, columnSizeMode, measureRootRef: gridMeasureRootRef, enableFiltering });

  const viewRowIds = useMemo(() => displayRows.map((r) => r.id), [displayRows]);
  const selectionState = useGridRowSelection({
    rowSelection: rowSelectionProp,
    onSelectionChange,
    orderedColumns,
    pinnedOverrides,
    rows: gridRows,
    viewRowIds,
    rowIdField: 'id',
  });

  const filterState = useGridFilters({ enableFiltering, columns, queryState, setFilter, clearFilters, treeMode: false });

  useGridEditFocus(editingCell);
  const verticalScrollMasterPane = selectionState.hasSplit && selectionState.rightColumns.length > 0 ? 'right' : 'center';
  const gridSplitRowRef = useGridSplitSync({ hasSplit: selectionState.hasSplit, rowCount: displayRows.length, variant: 'dataGrid' });
  const splitScrollSyncKey = `${verticalScrollMasterPane}|${selectionState.leftColumns.map((c) => c.field).join(',')}|${selectionState.centerColumns.map((c) => c.field).join(',')}|${selectionState.rightColumns.map((c) => c.field).join(',')}`;
  useGridSplitPaneScrollSync(gridSplitRowRef, selectionState.hasSplit, displayRows.length, splitScrollSyncKey);

  const updateSidePaneRealX = useCallback(() => {
    if (!selectionState.hasSplit) {
      setSidePaneHasRealX((prev) => (prev.left || prev.right ? { left: false, right: false } : prev));
      return;
    }
    const leftEl = paneScrollRefs.current.left;
    const rightEl = paneScrollRefs.current.right;
    const hasMeaningfulOverflow = (el) => el && el.scrollWidth - el.clientWidth > SIDE_X_OVERFLOW_THRESHOLD_PX;
    setSidePaneHasRealX((prev) => {
      const next = { left: Boolean(hasMeaningfulOverflow(leftEl)), right: Boolean(hasMeaningfulOverflow(rightEl)) };
      return prev.left === next.left && prev.right === next.right ? prev : next;
    });
  }, [selectionState.hasSplit, SIDE_X_OVERFLOW_THRESHOLD_PX]);

  useLayoutEffect(() => {
    updateSidePaneRealX();
    const rafId = requestAnimationFrame(updateSidePaneRealX);
    return () => cancelAnimationFrame(rafId);
  }, [updateSidePaneRealX, displayRows.length, selectionState.leftColumns.length, selectionState.centerColumns.length, selectionState.rightColumns.length, columnSizeMode, columnWidths]);

  useEffect(() => {
    if (!selectionState.hasSplit) return;
    const trackedPanes = [
      ['left', paneScrollRefs.current.left],
      ['right', paneScrollRefs.current.right],
    ].filter(([, el]) => Boolean(el));
    if (trackedPanes.length === 0) return;
    const trackedContent = trackedPanes.map(([, el]) => el.querySelector('.data-grid')).filter(Boolean);
    updateSidePaneRealX();
    const timeoutId = setTimeout(updateSidePaneRealX, 0);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(updateSidePaneRealX);
    for (const [, el] of trackedPanes) ro.observe(el);
    for (const el of trackedContent) ro.observe(el);
    if (gridSplitRowRef.current) ro.observe(gridSplitRowRef.current);
    return () => {
      clearTimeout(timeoutId);
      ro.disconnect();
    };
  }, [selectionState.hasSplit, updateSidePaneRealX, gridSplitRowRef]);

  const handleRowDrop = useCallback(
    (event, targetRowId) => {
      if (!enableRowDrag) return;
      event.preventDefault();
      event.stopPropagation();
      setDragOverRowId(null);
      const raw = event.dataTransfer.getData('application/x-data-grid-row-id');
      if (!raw || raw === String(targetRowId)) return;
      setGridRows((previous) => {
        const next = reorderRowsById(previous, raw, targetRowId);
        onRowOrderChange?.({ orderedIds: next.map((r) => r.id), rows: next });
        return next;
      });
    },
    [enableRowDrag, setGridRows, onRowOrderChange],
  );

  const effectiveTotal = queryState.totalCount || 0;
  const pageFrom = effectiveTotal === 0 ? 0 : (queryState.page - 1) * queryState.pageSize + 1;
  const pageTo = Math.min(queryState.page * queryState.pageSize, effectiveTotal);
  const hasRows = displayRows.length > 0;
  const controlledLoading = paginationMode === 'infinite' ? gridLoading && queryState.page <= 1 : gridLoading;
  useDataGridReadyEvents({
    onReady,
    onQueryChange,
    currentQuery,
    setGridRows,
    gridRows,
    setRemoteLoading,
    setTotalCount,
    setPage,
    setPageSize,
    setSort,
    setFilter,
    clearFilters,
    requestReload,
  });
  const applyPaginationReset = useCallback(() => {
    setPage(1);
    requestReload();
  }, [setPage, requestReload]);

  const previousResetTriggerRef = useRef(resetPaginationTrigger);
  const resetTriggerReadyRef = useRef(false);
  useEffect(() => {
    if (resetPaginationTrigger === undefined) return;
    if (!resetTriggerReadyRef.current) {
      resetTriggerReadyRef.current = true;
      previousResetTriggerRef.current = resetPaginationTrigger;
      return;
    }
    if (Object.is(previousResetTriggerRef.current, resetPaginationTrigger)) return;
    previousResetTriggerRef.current = resetPaginationTrigger;
    applyPaginationReset();
  }, [resetPaginationTrigger, applyPaginationReset]);

  useEffect(() => {
    if (paginationMode !== 'infinite') return;
    const root = infiniteScrollRootRef.current;
    const sentinel = infiniteSentinelRef.current;
    if (!root || !sentinel) return;
    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && void gridLoadMore(), { root, rootMargin: '160px', threshold: 0 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [paginationMode, gridLoadMore, displayRows.length]);

  useLayoutEffect(() => {
    if (paginationMode !== 'infinite') return;
    if (gridLoading || gridLoadingMore || !gridHasMore) return;
    const root = infiniteScrollRootRef.current;
    const sentinel = infiniteSentinelRef.current;
    if (!root || !sentinel) return;
    const rootRect = root.getBoundingClientRect();
    const sentRect = sentinel.getBoundingClientRect();
    if (sentRect.bottom <= rootRect.bottom + 8) void gridLoadMore();
  }, [paginationMode, gridLoading, gridLoadingMore, gridHasMore, displayRows.length, gridLoadMore]);

  useLayoutEffect(() => {
    if (paginationMode !== 'infinite' || !gridLoadingMore) return;
    const root = infiniteScrollRootRef.current;
    if (!root) return;
    root.scrollTop = root.scrollHeight;
  }, [paginationMode, gridLoadingMore, displayRows.length]);

  const handleSort = useCallback(
    (field) => {
      const direction = nextSortDirection(queryState.sortField, queryState.sortDirection, field);
      if (!direction) {
        setSort(null, null);
        return;
      }
      setSort(field, direction);
    },
    [queryState.sortField, queryState.sortDirection, setSort],
  );

  const emitEditedRowsChange = useCallback(
    ({ rowId, field, value, previousRow }) => {
      const nextEditedRow = { ...previousRow, [field]: value };
      editedRowsRef.current.set(rowId, nextEditedRow);
      const editedRows = [...editedRowsRef.current.values()];
      onEditedRowsChange?.({ currentEditedRow: nextEditedRow, editedRows });
    },
    [onEditedRowsChange],
  );

  const handleSaveEdit = useCallback(
    async ({ row, column }) => {
      const previousRow = row;
      const nextValue = column.type === 'number' ? Number(draftValue) : draftValue;
      const didSave = await saveEdit({ rowId: row.id, field: column.field, column });
      if (!didSave) return;
      emitEditedRowsChange({ rowId: row.id, field: column.field, value: nextValue, previousRow });
    },
    [draftValue, saveEdit, emitEditedRowsChange],
  );

  const updateCustomCellValue = useCallback(
    async ({ row, column, nextValue }) => {
      const normalizedValue = column.type === 'number' ? Number(nextValue) : nextValue;
      if (Object.is(row[column.field], normalizedValue)) return true;
      const previousRows = [];
      setCustomSavingCell({ rowId: row.id, field: column.field });
      setGridRows((rowsSnapshot) => {
        previousRows.push(...rowsSnapshot);
        return rowsSnapshot.map((currentRow) => (currentRow.id === row.id ? { ...currentRow, [column.field]: normalizedValue } : currentRow));
      });
      try {
        await patchRow(row.id, { [column.field]: normalizedValue }, { treeMode: false });
        emitEditedRowsChange({ rowId: row.id, field: column.field, value: normalizedValue, previousRow: row });
        return true;
      } catch {
        setGridRows(previousRows);
        return false;
      } finally {
        setCustomSavingCell(null);
      }
    },
    [setGridRows, emitEditedRowsChange],
  );

  return {
    queryState,
    totalPages,
    setPage,
    setPageSize,
    displayRows,
    gridRows,
    controlledLoading,
    gridLoadingMore,
    hasRows,
    pageFrom,
    pageTo,
    editError,
    editingCell,
    draftValue,
    savingCell,
    customSavingCell,
    setDraftValue,
    startEdit,
    cancelEdit,
    handleSaveEdit,
    updateCustomCellValue,
    orderedColumns,
    pinnedOverrides,
    dragOverField,
    setDragOverField,
    handleColumnDrop,
    handleColumnHeaderDragStart,
    setPinForField,
    columnWidths,
    startResize,
    autoFitColumn,
    resizingField,
    selectionState,
    filterState,
    verticalScrollMasterPane,
    gridSplitRowRef,
    paneScrollRefs,
    sidePaneHasRealX,
    handleSort,
    handleRowDrop,
    dragOverRowId,
    setDragOverRowId,
    gridMeasureRootRef,
    infiniteScrollRootRef,
    infiniteSentinelRef,
  };
};
