import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGridQuery } from '../hooks/useGridQuery';
import { useGridData } from '../hooks/useGridData';
import { useInlineEdit } from '../hooks/useInlineEdit';
import { patchRow } from '../api/gridApi';
import { getColumnMinWidth, getEffectivePin, isColumnResizable } from '../utils/columnPinning';
import { nextSortDirection } from '../utils/gridSort';
import { buildGridTemplateColumns, COLUMN_SIZE_MODE } from '../utils/gridTemplateColumns';
import { reorderRowsById } from '../utils/rowOrder';
import { useGridColumnOrder } from '../hooks/useGridColumnOrder';
import { useGridEditFocus } from '../hooks/useGridEditFocus';
import { useGridFilters } from '../hooks/useGridFilters';
import { useGridRowSelection } from '../hooks/useGridRowSelection';
import { useGridSplitPaneScrollSync } from '../hooks/useGridSplitPaneScrollSync';
import { useGridSplitSync } from '../hooks/useGridSplitSync';
import { useGridColumnResize } from '../hooks/useGridColumnResize';
import { ColumnFilterPopover, FilterFunnelIcon } from './ColumnFilterPopover';
import { ColumnResizeHandle } from './ColumnResizeHandle';
import { GridPagination } from './GridPagination';
import { SetFilterSummaryReadonlyInput } from './SetFilterSummaryReadonlyInput';

/** Re-export for apps that imported `DEFAULT_ROW_SELECTION` from `DataGrid`. */
export { DEFAULT_ROW_SELECTION } from '../utils/rowSelection';
export { COLUMN_SIZE_MODE } from '../utils/gridTemplateColumns';

/**
 * Column defs may set `resizable: false` to hide resize grip and double-click auto-fit for that column.
 *
 * Pagination: `paginationMode` controls the footer and how paging works:
 * - `server` — send `page` / `pageSize` to the API (default).
 * - `infinite` — server pages; append rows as the user scrolls the grid viewport (same horizontal scroll layout).
 * - `client` — fetch the full filtered/sorted result set and slice pages in the browser.
 * - `none` — no pagination UI; load and show all rows at once.
 *
 * Column sizing (`columnSizeMode`, Tabulator-style): `fitData` (fixed px), `fitDataStretchLast` (last column fills pane),
 * `fitWidth` (all columns share remaining width with `minmax(px, 1fr)`). After layout, default column widths use the
 * measured header width (label, filters, pin actions), not only `column.minWidth`, until the user resizes or auto-fits a column.
 */
export const DataGrid = ({ columns, columnOrder: columnOrderProp, onColumnOrderChange, enableColumnReorder = false, enableRowDrag = false, onRowOrderChange, rowSelection: rowSelectionProp, onSelectionChange, onEditedRowsChange, enableFiltering = true, enableColumnResize = true, paginationMode = 'server', columnSizeMode = COLUMN_SIZE_MODE.FIT_DATA }) => {
  const SIDE_X_OVERFLOW_THRESHOLD_PX = 6;
  const { queryState, totalPages, setPage, setPageSize, setSort, setFilter, clearFilters, setTotalCount } = useGridQuery();
  const { rows, loading, loadingMore, hasMore, loadMore, error, setRows } = useGridData(queryState, setTotalCount, { paginationMode });
  const { editingCell, draftValue, savingCell, editError, setDraftValue, startEdit, cancelEdit, saveEdit } = useInlineEdit(setRows);
  const [dragOverRowId, setDragOverRowId] = useState(null);
  const editedRowsRef = useRef(new Map());
  const [customSavingCell, setCustomSavingCell] = useState(null);
  const gridMeasureRootRef = useRef(null);
  /** Scrollport for infinite load + layout fill; center pane’s `.grid-pane-scroll` only. */
  const infiniteScrollRootRef = useRef(null);
  const infiniteSentinelRef = useRef(null);
  const paneScrollRefs = useRef({ left: null, right: null });
  const [sidePaneHasRealX, setSidePaneHasRealX] = useState({ left: false, right: false });

  const { orderedColumns, pinnedOverrides, dragOverField, setDragOverField, handleColumnDrop, handleColumnHeaderDragStart, setPinForField } = useGridColumnOrder({ columns, columnOrder: columnOrderProp, onColumnOrderChange, enableColumnReorder });

  const { columnWidths, startResize, autoFitColumn, resizingField } = useGridColumnResize({ enabled: enableColumnResize, columns: orderedColumns, columnSizeMode, measureRootRef: gridMeasureRootRef, enableFiltering });

  const viewRowIds = useMemo(() => rows.map((r) => r.id), [rows]);

  const { rs, selectedSet, selectionEnabled, showSelectColumn, enableClickSelection, leftColumns, centerColumns, rightColumns, hasSplit, selectionPane, leadingPane, toggleRowSelection, toggleSelectAllInView, allSelectedInView, someSelectedInView, applySelectionForRowClick, handleRowBackgroundClick, editableClickSelectionTimerRef } = useGridRowSelection({
    rowSelection: rowSelectionProp,
    onSelectionChange,
    orderedColumns,
    pinnedOverrides,
    rows,
    viewRowIds,
    rowIdField: 'id',
  });

  const { filterDraft, setFilterDraft, filterPopoverField, setFilterPopoverField, distinctByField, filterFunnelRefs, closeFilterPopover, handlePopoverSelectionChange, toggleColumnFilterPopover } = useGridFilters({ enableFiltering, columns, queryState, setFilter, clearFilters, treeMode: false });

  useGridEditFocus(editingCell);
  const verticalScrollMasterPane = hasSplit && rightColumns.length > 0 ? 'right' : 'center';

  const gridSplitRowRef = useGridSplitSync({ hasSplit, rowCount: rows.length, variant: 'dataGrid' });

  const splitScrollSyncKey = `${verticalScrollMasterPane}|${leftColumns.map((c) => c.field).join(',')}|${centerColumns.map((c) => c.field).join(',')}|${rightColumns.map((c) => c.field).join(',')}`;
  useGridSplitPaneScrollSync(gridSplitRowRef, hasSplit, rows.length, splitScrollSyncKey);

  const updateSidePaneRealX = useCallback(() => {
    if (!hasSplit) {
      setSidePaneHasRealX((prev) => (prev.left || prev.right ? { left: false, right: false } : prev));
      return;
    }
    const leftEl = paneScrollRefs.current.left;
    const rightEl = paneScrollRefs.current.right;
    const hasMeaningfulOverflow = (el) => el && el.scrollWidth - el.clientWidth > SIDE_X_OVERFLOW_THRESHOLD_PX;
    setSidePaneHasRealX((prev) => {
      const next = {
        left: Boolean(hasMeaningfulOverflow(leftEl)),
        right: Boolean(hasMeaningfulOverflow(rightEl)),
      };
      return prev.left === next.left && prev.right === next.right ? prev : next;
    });
  }, [hasSplit, SIDE_X_OVERFLOW_THRESHOLD_PX]);

  useLayoutEffect(() => {
    updateSidePaneRealX();
    const rafId = requestAnimationFrame(updateSidePaneRealX);
    return () => cancelAnimationFrame(rafId);
  }, [updateSidePaneRealX, rows.length, leftColumns.length, centerColumns.length, rightColumns.length, columnSizeMode, columnWidths]);

  useEffect(() => {
    if (!hasSplit) return;

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
  }, [hasSplit, updateSidePaneRealX]);

  const handleRowDrop = useCallback(
    (event, targetRowId) => {
      if (!enableRowDrag) return;
      event.preventDefault();
      event.stopPropagation();
      setDragOverRowId(null);
      const raw = event.dataTransfer.getData('application/x-data-grid-row-id');
      if (!raw || raw === String(targetRowId)) return;

      setRows((previous) => {
        const next = reorderRowsById(previous, raw, targetRowId);
        onRowOrderChange?.({ orderedIds: next.map((r) => r.id), rows: next });
        return next;
      });
    },
    [enableRowDrag, setRows, onRowOrderChange],
  );

  const effectiveTotal = queryState.totalCount || 0;
  const pageFrom = effectiveTotal === 0 ? 0 : (queryState.page - 1) * queryState.pageSize + 1;
  const pageTo = Math.min(queryState.page * queryState.pageSize, effectiveTotal);
  const hasRows = rows.length > 0;

  useEffect(() => {
    if (paginationMode !== 'infinite') return;
    const root = infiniteScrollRootRef.current;
    const sentinel = infiniteSentinelRef.current;
    if (!root || !sentinel) return;

    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && void loadMore(), { root, rootMargin: '160px', threshold: 0 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [paginationMode, loadMore, rows.length]);

  useLayoutEffect(() => {
    if (paginationMode !== 'infinite') return;
    if (loading || loadingMore || !hasMore) return;
    const root = infiniteScrollRootRef.current;
    const sentinel = infiniteSentinelRef.current;
    if (!root || !sentinel) return;
    const rootRect = root.getBoundingClientRect();
    const sentRect = sentinel.getBoundingClientRect();
    if (sentRect.bottom <= rootRect.bottom + 8) void loadMore();
  }, [paginationMode, loading, loadingMore, hasMore, rows.length, loadMore]);

  /** Keep the synthetic loading row visible (11th row position) while fetching next page. */
  useLayoutEffect(() => {
    if (paginationMode !== 'infinite' || !loadingMore) return;
    const root = infiniteScrollRootRef.current;
    if (!root) return;
    root.scrollTop = root.scrollHeight;
  }, [paginationMode, loadingMore, rows.length]);

  const handleSort = (field) => {
    const direction = nextSortDirection(queryState.sortField, queryState.sortDirection, field);
    if (!direction) {
      setSort(null, null);
      return;
    }

    setSort(field, direction);
  };

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
      setRows((rowsSnapshot) => {
        previousRows.push(...rowsSnapshot);
        return rowsSnapshot.map((currentRow) => (currentRow.id === row.id ? { ...currentRow, [column.field]: normalizedValue } : currentRow));
      });

      try {
        await patchRow(row.id, { [column.field]: normalizedValue }, { treeMode: false });
        emitEditedRowsChange({ rowId: row.id, field: column.field, value: normalizedValue, previousRow: row });
        return true;
      } catch (_error) {
        setRows(previousRows);
        return false;
      } finally {
        setCustomSavingCell(null);
      }
    },
    [setRows, emitEditedRowsChange],
  );

  const renderCell = (row, column) => {
    const isEditing = editingCell?.rowId === row.id && editingCell?.field === column.field;
    const isSaving = (savingCell?.rowId === row.id && savingCell?.field === column.field) || (customSavingCell?.rowId === row.id && customSavingCell?.field === column.field);
    const baseRenderParams = { row, column, value: row[column.field], isEditing, isSaving };

    if (isEditing) {
      const stopEditHostBubble = (event) => event.stopPropagation();
      const commitEditIfChanged = () => {
        if (isSaving) return false;
        const previousValue = row[column.field] == null ? '' : String(row[column.field]);
        if (draftValue === previousValue) {
          cancelEdit();
          return true;
        }
        void handleSaveEdit({ row, column });
        return true;
      };
      const handleEditHostBlur = (event) => {
        const editHost = event.currentTarget;
        const nextFocused = event.relatedTarget;
        if (nextFocused && editHost?.contains(nextFocused)) return;

        commitEditIfChanged();
      };
      const handleEditHostKeyDown = (event) => {
        if (event.key === 'Enter') {
          if (event.target.closest('textarea')) return;

          event.preventDefault();
          event.stopPropagation();
          commitEditIfChanged();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cancelEdit();
        }
      };

      if (typeof column.renderEditCell === 'function') {
        return (
          <div className="edit-cell" data-no-row-select data-edit-host onPointerDown={stopEditHostBubble} onPointerUp={stopEditHostBubble} onClick={stopEditHostBubble} onBlur={handleEditHostBlur} onKeyDown={handleEditHostKeyDown}>
            {column.renderEditCell({ ...baseRenderParams, value: draftValue, setValue: setDraftValue, save: () => handleSaveEdit({ row, column }), cancel: cancelEdit })}
          </div>
        );
      }

      return (
        <div className="edit-cell" data-no-row-select data-edit-host onPointerDown={stopEditHostBubble} onPointerUp={stopEditHostBubble} onClick={stopEditHostBubble} onBlur={handleEditHostBlur} onKeyDown={handleEditHostKeyDown}>
          <input value={draftValue} disabled={isSaving} onChange={(event) => setDraftValue(event.target.value)} onClick={stopEditHostBubble} onPointerDown={stopEditHostBubble} />
        </div>
      );
    }

    if (typeof column.renderCell === 'function') {
      return column.renderCell({
        ...baseRenderParams,
        startEdit: () => startEdit(row.id, column.field, row[column.field]),
        updateValue: (nextValue) => updateCustomCellValue({ row, column, nextValue }),
      });
    }

    if (!column.editable) return <span className="cell-display">{String(row[column.field])}</span>;

    const editableCellKey = `${row.id}:${column.field}`;

    return (
      <span
        role="button"
        tabIndex={isSaving ? -1 : 0}
        className="cell-button cell-button--editable"
        data-editable-cell={editableCellKey}
        aria-disabled={isSaving}
        onClick={(e) => {
          e.stopPropagation();
          if (!enableClickSelection || isSaving) return;
          if (e.detail >= 2) return;
          if (editableClickSelectionTimerRef.current) clearTimeout(editableClickSelectionTimerRef.current);

          editableClickSelectionTimerRef.current = setTimeout(() => {
            applySelectionForRowClick({ ctrlKey: e.ctrlKey, metaKey: e.metaKey }, row.id);
            editableClickSelectionTimerRef.current = null;
          }, 180);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();

          if (editableClickSelectionTimerRef.current) {
            clearTimeout(editableClickSelectionTimerRef.current);
            editableClickSelectionTimerRef.current = null;
          }
          if (isSaving) return;

          startEdit(row.id, column.field, row[column.field]);
        }}
        onKeyDown={(e) => {
          if (isSaving) return;

          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            startEdit(row.id, column.field, row[column.field]);
          }
        }}
      >
        {String(row[column.field])}
      </span>
    );
  };

  const columnStyle = (column) => {
    const minW = getColumnMinWidth(column);
    const w = columnWidths[column.field] ?? minW;
    return { minWidth: Math.max(minW, w) };
  };

  /** When a subset "in" filter is active, show count + value list (width-fitted) and funnel badge. */
  const getSetFilterSummary = (field) => {
    const distinct = distinctByField[field];
    const draft = filterDraft[field];
    const applied = queryState.filters[field];

    let values = null;
    if (draft?.inValues !== undefined && Array.isArray(draft.inValues)) values = draft.inValues.map(String);
    else if (applied?.operator === 'in' && Array.isArray(applied.value) && applied.value.length > 0) values = applied.value.map(String);

    if (!values || values.length === 0) return { isActive: false };

    if (distinct && distinct.length > 0) {
      const allSelected = values.length === distinct.length && distinct.every((v) => values.includes(String(v)));
      if (allSelected) return { isActive: false };
    }

    const sorted = [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return { isActive: true, count: values.length, values: sorted };
  };

  const renderSectionGrid = (sectionColumns, pane) => {
    if (sectionColumns.length === 0) return null;
    const isInfiniteScrollPane = paginationMode === 'infinite' && pane === verticalScrollMasterPane;
    const setScrollRef = (node) => {
      if (pane === 'left' || pane === 'right') paneScrollRefs.current[pane] = node;
    };
    const setBodyScrollRef = (node) => {
      if (isInfiniteScrollPane) infiniteScrollRootRef.current = node;
    };

    const showLeadingSelect = showSelectColumn && selectionPane === pane;
    const showLeadingRowDrag = enableRowDrag && leadingPane === pane;
    const colTpl = buildGridTemplateColumns(sectionColumns, { showRowDrag: showLeadingRowDrag, showSelect: showLeadingSelect, columnWidths, columnSizeMode });
    const ariaColCount = sectionColumns.length + (showLeadingSelect ? 1 : 0) + (showLeadingRowDrag ? 1 : 0);

    return (
      <div className={`grid-pane grid-pane--${pane}`} data-pane={pane}>
        <div ref={setScrollRef} className={[hasSplit ? 'grid-pane-scroll grid-pane-scroll--pinned' : 'grid-pane-scroll', hasSplit && pane !== 'center' && sidePaneHasRealX[pane] ? 'grid-pane-scroll--has-real-x' : ''].filter(Boolean).join(' ')} data-hscroll={hasSplit ? 'always' : 'auto'}>
          <div className={['data-grid', resizingField ? 'data-grid--column-resizing' : ''].filter(Boolean).join(' ') || undefined} data-column-size-mode={columnSizeMode} role="grid" aria-rowcount={rows.length} aria-colcount={ariaColCount}>
            <div className="data-grid-header" role="presentation">
              <div className="data-grid-header-row" role="row" {...(hasSplit ? { 'data-sync-header': '' } : {})} style={{ gridTemplateColumns: colTpl }}>
                {showLeadingRowDrag ? (
                  <div role="columnheader" className="data-grid-header-cell grid-row-drag-header" aria-label="Reorder rows" style={{ width: 36, minWidth: 36 }} data-field="__rowDrag__">
                    <div className="header-stack">
                      <div className="header-filter">
                        <span className="header-filter-spacer" aria-hidden />
                      </div>
                    </div>
                  </div>
                ) : null}
                {showLeadingSelect ? (
                  <div role="columnheader" className="data-grid-header-cell grid-select-header" style={{ width: 44, minWidth: 44 }} data-field="__select__">
                    {enableFiltering ? (
                      <div className="header-stack">
                        <div className="header-cell header-cell--select">{rs.mode === 'multi' ? <input className="grid-checkbox" type="checkbox" aria-label="Select all rows on this page" checked={allSelectedInView} ref={(el) => el && (el.indeterminate = someSelectedInView)} onChange={toggleSelectAllInView} /> : null}</div>
                        <div className="header-filter">
                          <span className="header-filter-spacer" aria-hidden />
                        </div>
                      </div>
                    ) : (
                      <div className="header-cell header-cell--select">{rs.mode === 'multi' ? <input className="grid-checkbox" type="checkbox" aria-label="Select all rows on this page" checked={allSelectedInView} ref={(el) => el && (el.indeterminate = someSelectedInView)} onChange={toggleSelectAllInView} /> : null}</div>
                    )}
                  </div>
                ) : null}
                {sectionColumns.map((column) => {
                  const isSorted = queryState.sortField === column.field;
                  const direction = isSorted ? queryState.sortDirection : null;
                  const pin = getEffectivePin(column, pinnedOverrides);
                  const dragOver = enableColumnReorder && dragOverField === column.field;
                  const headerDrag = enableColumnReorder && column.movable === true;
                  const thClassName = [dragOver && 'column-th--drag-over', headerDrag && 'column-th--movable', resizingField === column.field && 'column-th--resizing'].filter(Boolean).join(' ') || undefined;
                  return (
                    <div
                      key={column.field}
                      role="columnheader"
                      style={columnStyle(column)}
                      data-field={column.field}
                      data-pinned={pin ?? undefined}
                      className={['data-grid-header-cell', thClassName].filter(Boolean).join(' ') || undefined}
                      draggable={headerDrag}
                      onDragStart={headerDrag ? (e) => handleColumnHeaderDragStart(e, column) : undefined}
                      onDragEnd={headerDrag ? () => setDragOverField(null) : undefined}
                      onDragOverCapture={
                        enableColumnReorder
                          ? (e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                              setDragOverField(column.field);
                            }
                          : undefined
                      }
                      onDragLeave={enableColumnReorder ? (e) => !e.currentTarget.contains(e.relatedTarget) && setDragOverField(null) : undefined}
                      onDropCapture={enableColumnReorder ? (e) => handleColumnDrop(e, column.field) : undefined}
                    >
                      {enableFiltering ? (
                        <div className="header-stack">
                          <div className="header-cell header-cell--title-row">
                            <button type="button" className="header-button" onClick={() => handleSort(column.field)}>
                              {column.label}
                              {direction === 'asc' && ' \u2191'}
                              {direction === 'desc' && ' \u2193'}
                            </button>
                            {/* <button type='button' className='header-column-menu-btn' aria-label={`${column.label} column menu`} title='Column menu'>
                              ⋮
                            </button> */}
                            <div className="pin-actions" role="group" aria-label={`${column.label} pinning`}>
                              <button type="button" className={`pin-button${pin === 'left' ? ' active' : ''}`} aria-pressed={pin === 'left'} aria-label={`Pin ${column.label} left`} onClick={() => setPinForField(column.field, pin === 'left' ? null : 'left')}>
                                L
                              </button>
                              <button type="button" className={`pin-button${pin === 'right' ? ' active' : ''}`} aria-pressed={pin === 'right'} aria-label={`Pin ${column.label} right`} onClick={() => setPinForField(column.field, pin === 'right' ? null : 'right')}>
                                R
                              </button>
                            </div>
                          </div>
                          <div className="header-filter">
                            {column.filterable ? (
                              (() => {
                                const setSummary = getSetFilterSummary(column.field);
                                const quickValue = filterDraft[column.field]?.quick ?? filterDraft[column.field]?.value ?? '';

                                return (
                                  <div className={`header-filter-inline${setSummary.isActive ? ' header-filter-inline--set-active' : ''}`}>
                                    {setSummary.isActive ? (
                                      <SetFilterSummaryReadonlyInput count={setSummary.count} values={setSummary.values} columnLabel={column.label} className={`header-filter-input header-filter-input--set-active`} placeholder={`Filter ${column.label}`} onClick={() => void toggleColumnFilterPopover(column.field)} />
                                    ) : (
                                      <input
                                        className="header-filter-input"
                                        placeholder={`Filter ${column.label}`}
                                        aria-label={`Filter ${column.label}`}
                                        value={quickValue}
                                        onChange={(event) => {
                                          const value = event.target.value;
                                          const operator = column.filterOperator || 'contains';
                                          setFilterDraft((previous) => ({
                                            ...previous,
                                            [column.field]: {
                                              quick: value,
                                              operator,
                                              inValues: undefined,
                                            },
                                          }));
                                        }}
                                      />
                                    )}
                                    <button
                                      type="button"
                                      ref={(el) => {
                                        if (el) filterFunnelRefs.current[column.field] = el;
                                        else delete filterFunnelRefs.current[column.field];
                                      }}
                                      className={['header-filter-funnel', filterPopoverField === column.field ? 'header-filter-funnel--open' : '', setSummary.isActive ? 'header-filter-funnel--active' : ''].filter(Boolean).join(' ')}
                                      aria-label={`Filter options for ${column.label}`}
                                      aria-expanded={filterPopoverField === column.field}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void toggleColumnFilterPopover(column.field);
                                      }}
                                    >
                                      <FilterFunnelIcon />
                                      {setSummary.isActive ? <span className="header-filter-funnel-badge" aria-hidden /> : null}
                                    </button>
                                  </div>
                                );
                              })()
                            ) : (
                              <span className="header-filter-spacer" aria-hidden />
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="header-cell header-cell--title-row">
                          <button type="button" className="header-button" onClick={() => handleSort(column.field)}>
                            {column.label}
                            {direction === 'asc' && ' \u2191'}
                            {direction === 'desc' && ' \u2193'}
                          </button>
                          {/* <button type='button' className='header-column-menu-btn' aria-label={`${column.label} column menu`} title='Column menu'>
                            ⋮
                          </button> */}
                          <div className="pin-actions" role="group" aria-label={`${column.label} pinning`}>
                            <button type="button" className={`pin-button${pin === 'left' ? ' active' : ''}`} aria-pressed={pin === 'left'} aria-label={`Pin ${column.label} left`} onClick={() => setPinForField(column.field, pin === 'left' ? null : 'left')}>
                              L
                            </button>
                            <button type="button" className={`pin-button${pin === 'right' ? ' active' : ''}`} aria-pressed={pin === 'right'} aria-label={`Pin ${column.label} right`} onClick={() => setPinForField(column.field, pin === 'right' ? null : 'right')}>
                              R
                            </button>
                          </div>
                        </div>
                      )}
                      <ColumnResizeHandle column={column} enabled={enableColumnResize && isColumnResizable(column)} onResizeStart={startResize} onAutoFit={autoFitColumn} />
                    </div>
                  );
                })}
              </div>
            </div>
            <div ref={setBodyScrollRef} className={['grid-pane-body-scroll', pane === verticalScrollMasterPane ? 'grid-pane-scroll--y-master' : ''].filter(Boolean).join(' ')}>
              <div className="data-grid-body" role="rowgroup">
                {rows.map((row, rowIndex) => {
                  const rowSelected = selectedSet.has(row.id);
                  const rowDragOver = enableRowDrag && dragOverRowId === row.id;
                  return (
                    <div
                      key={row.id}
                      role="row"
                      {...(hasSplit ? { 'data-sync-row-index': rowIndex } : {})}
                      className={['data-grid-row', rowSelected ? 'data-grid-row--selected' : '', enableClickSelection ? 'data-grid-row--clickable' : '', rowDragOver ? 'data-grid-row--drag-over' : ''].filter(Boolean).join(' ') || undefined}
                      style={{ gridTemplateColumns: colTpl }}
                      aria-selected={selectionEnabled ? rowSelected : undefined}
                      onClick={(event) => handleRowBackgroundClick(event, row.id)}
                      onDragOverCapture={
                        enableRowDrag
                          ? (e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                              setDragOverRowId(row.id);
                            }
                          : undefined
                      }
                      onDragLeave={enableRowDrag ? (e) => !e.currentTarget.contains(e.relatedTarget) && setDragOverRowId(null) : undefined}
                      onDropCapture={enableRowDrag ? (e) => handleRowDrop(e, row.id) : undefined}
                    >
                      {showLeadingRowDrag ? (
                        <div role="gridcell" className="data-grid-cell grid-row-drag-cell" data-field="__rowDrag__" data-no-row-select>
                          <button
                            type="button"
                            className="row-drag-handle"
                            draggable
                            aria-label={`Reorder row ${row.id}`}
                            onDragStart={(e) => {
                              e.dataTransfer.setData('application/x-data-grid-row-id', String(row.id));
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={() => setDragOverRowId(null)}
                          >
                            ⠿
                          </button>
                        </div>
                      ) : null}
                      {showLeadingSelect ? (
                        <div role="gridcell" className="data-grid-cell grid-select-cell" data-field="__select__" data-no-row-select>
                          <input className="grid-checkbox" type="checkbox" checked={rowSelected} onChange={() => toggleRowSelection(row.id)} onClick={(e) => e.stopPropagation()} aria-label={`Select row ${row.id}`} />
                        </div>
                      ) : null}
                      {sectionColumns.map((column) => (
                        <div key={`${row.id}-${column.field}`} role="gridcell" className="data-grid-cell" style={columnStyle(column)} data-field={column.field} data-pinned={getEffectivePin(column, pinnedOverrides) ?? undefined}>
                          {renderCell(row, column)}
                        </div>
                      ))}
                    </div>
                  );
                })}
                {paginationMode === 'infinite' && loadingMore ? (
                  <div role="row" className="data-grid-row data-grid-row--loading" style={{ gridTemplateColumns: colTpl }}>
                    <div role="gridcell" className={`data-grid-cell data-grid-cell--loading ${pane === 'center' ? 'data-grid-cell--loading-primary' : 'data-grid-cell--loading-peer'}`} style={{ gridColumn: '1 / -1' }} aria-hidden={pane === 'center' ? undefined : true}>
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
                ) : null}
              </div>
              {isInfiniteScrollPane ? <div ref={infiniteSentinelRef} className="grid-infinite-sentinel" aria-hidden /> : null}
            </div>
          </div>
          {hasSplit && pane !== 'center' && !sidePaneHasRealX[pane] ? <div className="grid-pane-scroll-affordance" aria-hidden /> : null}
        </div>
      </div>
    );
  };

  return (
    <div className="grid-container" ref={gridMeasureRootRef}>
      {/* {error && <p className="status error">{error}</p>}
      {editError && <p className="status error">{editError}</p>} */}
      {!loading && !hasRows && <p className="status">No rows found.</p>}

      <div className={`grid-split-root${hasSplit ? ' grid-split-root--split' : ''}`}>
        {loading ? (
          <div className="grid-loading-overlay" role="status" aria-live="polite">
            <div className="grid-loading-chip">
              <span className="grid-loading-spinner" aria-hidden />
              <span>Loading...</span>
            </div>
          </div>
        ) : null}
        <div className="grid-split-row" ref={gridSplitRowRef}>
          {renderSectionGrid(leftColumns, 'left')}
          {renderSectionGrid(centerColumns, 'center')}
          {renderSectionGrid(rightColumns, 'right')}
        </div>
      </div>

      {paginationMode === 'server' || paginationMode === 'client' ? <GridPagination page={queryState.page} totalPages={totalPages} pageSize={queryState.pageSize} totalCount={queryState.totalCount} pageFrom={pageFrom} pageTo={pageTo} onPageChange={setPage} onPageSizeChange={setPageSize} /> : null}

      {filterPopoverField ? <ColumnFilterPopover isOpen onClose={closeFilterPopover} anchorEl={filterFunnelRefs.current[filterPopoverField]} label={columns.find((c) => c.field === filterPopoverField)?.label ?? filterPopoverField} distinctValues={distinctByField[filterPopoverField] ?? []} selectedValues={filterDraft[filterPopoverField]?.inValues ?? []} onChange={(next) => handlePopoverSelectionChange(filterPopoverField, next)} /> : null}
    </div>
  );
};
