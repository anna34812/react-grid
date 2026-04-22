import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGridQuery } from '../hooks/useGridQuery';
import { useGridData } from '../hooks/useGridData';
import { useInlineEdit } from '../hooks/useInlineEdit';
import { patchRow } from '../api/gridApi';
import { getColumnMinWidth, getEffectivePin, isColumnResizable } from '../utils/columnPinning';
import { nextSortDirection } from '../utils/gridSort';
import { buildGridTemplateColumns, COLUMN_SIZE_MODE } from '../utils/gridTemplateColumns';
import { collectSubtreeIds, computeTreeAggregates, flattenTreeRows, getChildrenMap, getIdsWithChildren } from '../utils/treeData';
import { useGridColumnOrder } from '../hooks/useGridColumnOrder';
import { useGridEditFocus } from '../hooks/useGridEditFocus';
import { useGridFilters } from '../hooks/useGridFilters';
import { useGridRowSelection } from '../hooks/useGridRowSelection';
import { useGridSplitPaneScrollSync } from '../hooks/useGridSplitPaneScrollSync';
import { useGridSplitSync } from '../hooks/useGridSplitSync';
import { useGridColumnResize } from '../hooks/useGridColumnResize';
import { ColumnFilterPopover, FilterFunnelIcon } from './ColumnFilterPopover';
import { ColumnResizeHandle } from './ColumnResizeHandle';
import { SetFilterSummaryReadonlyInput } from './SetFilterSummaryReadonlyInput';
import { GridLoadingOverlay } from './GridLoadingOverlay';

export { DEFAULT_ROW_SELECTION } from '../utils/rowSelection';
export { COLUMN_SIZE_MODE } from '../utils/gridTemplateColumns';

const TREE_ROW_ANIM_MS = 420;
const TREE_ROW_STAGGER_MS = 32;

export const TreeDataGrid = (props) => {
  const { columns, dataSource, treeData: treeDataConfig, rowSelection: rowSelectionProp, onSelectionChange, animateRows = true, enableColumnResize = true, columnSizeMode = COLUMN_SIZE_MODE.FIT_DATA } = props;
  const { columnOrder: columnOrderProp, onColumnOrderChange, enableColumnReorder = false } = props;
  const { onEditedRowsChange = () => {} } = props;
  const { enableFiltering = true, LoadingComponent } = props;

  const SIDE_X_OVERFLOW_THRESHOLD_PX = 6;
  const gridQueryInitial = useMemo(() => ({ treeMode: true }), []);

  const { queryState, setSort, setFilter, clearFilters, setTotalCount } = useGridQuery(gridQueryInitial);
  const { rows, loading, error, setRows } = useGridData(queryState, setTotalCount);

  const usesExternalDataSource = Array.isArray(dataSource);
  const [externalRows, setExternalRows] = useState(() => (usesExternalDataSource ? dataSource : []));

  //
  useEffect(() => {
    if (!usesExternalDataSource) return;
    setExternalRows(Array.isArray(dataSource) ? dataSource : []);
  }, [usesExternalDataSource, dataSource]);

  const gridRows = usesExternalDataSource ? externalRows : rows;
  const setGridRows = usesExternalDataSource ? setExternalRows : setRows;
  const gridLoading = usesExternalDataSource ? false : loading;
  const gridError = usesExternalDataSource ? null : error;
  const { editingCell, draftValue, savingCell, editError, setDraftValue, startEdit, cancelEdit, saveEdit } = useInlineEdit(setGridRows, { apiOptions: { treeMode: true } });
  const treeParentField = treeDataConfig.parentField ?? 'parentId';
  const treeRowIdField = treeDataConfig.rowIdField ?? 'id';
  const treeExpandColumnField = treeDataConfig.expandColumnField ?? 'name';
  const treeIndentPerLevel = treeDataConfig.indentPerLevel ?? 16;
  const [expandedRowIds, setExpandedRowIds] = useState(() => new Set());
  const [pendingCollapseId, setPendingCollapseId] = useState(null);
  const [openAnimSuppressedIds, setOpenAnimSuppressedIds] = useState(() => new Set());
  const expandedRef = useRef(expandedRowIds);
  expandedRef.current = expandedRowIds;
  const pendingCollapseRef = useRef(null);
  pendingCollapseRef.current = pendingCollapseId;
  const collapseTimerRef = useRef(null);
  const treeExpandInitRef = useRef(false);
  const editedRowsRef = useRef(new Map());
  const [customSavingCell, setCustomSavingCell] = useState(null);
  const gridMeasureRootRef = useRef(null);
  const paneScrollRefs = useRef({ left: null, right: null });
  const [sidePaneHasRealX, setSidePaneHasRealX] = useState({ left: false, right: false });

  const { orderedColumns, pinnedOverrides, dragOverField, setDragOverField, handleColumnDrop, handleColumnHeaderDragStart, setPinForField } = useGridColumnOrder({ columns, columnOrder: columnOrderProp, onColumnOrderChange, enableColumnReorder });

  const { columnWidths, startResize, autoFitColumn, resizingField } = useGridColumnResize({ enabled: enableColumnResize, columns: orderedColumns, columnSizeMode, measureRootRef: gridMeasureRootRef, enableFiltering });

  useEffect(() => {
    if (!gridRows.length || treeExpandInitRef.current) return;
    treeExpandInitRef.current = true;
    setExpandedRowIds(getIdsWithChildren(gridRows, { idField: treeRowIdField, parentField: treeParentField }));
  }, [gridRows, treeRowIdField, treeParentField]);

  const rowsById = useMemo(() => new Map(gridRows.map((r) => [r[treeRowIdField], r])), [gridRows, treeRowIdField]);

  const childrenMap = useMemo(() => getChildrenMap(gridRows, { idField: treeRowIdField, parentField: treeParentField }), [gridRows, treeRowIdField, treeParentField]);

  const [groupSelection, setGroupSelection] = useState(() => treeDataConfig.groupSelection ?? 'self');
  useEffect(() => {
    if (treeDataConfig.groupSelection !== undefined) setGroupSelection(treeDataConfig.groupSelection);
  }, [treeDataConfig.groupSelection]);

  const treeOptions = useMemo(() => ({ groupSelection, childrenMap }), [groupSelection, childrenMap]);

  const isDescendantOf = useCallback(
    (row, ancestorId) => {
      let pid = row[treeParentField];
      while (pid != null) {
        if (pid === ancestorId) return true;
        pid = rowsById.get(pid)?.[treeParentField];
      }
      return false;
    },
    [rowsById, treeParentField],
  );

  const flattenedRows = useMemo(() => {
    const flat = flattenTreeRows(gridRows, expandedRowIds, { idField: treeRowIdField, parentField: treeParentField });
    if (pendingCollapseId == null) return flat;
    return flat.map((r) => (r[treeRowIdField] === pendingCollapseId ? { ...r, __treeExpanded: false } : r));
  }, [gridRows, expandedRowIds, pendingCollapseId, treeRowIdField, treeParentField]);

  useEffect(() => {
    const flatIds = new Set(flattenedRows.map((r) => r[treeRowIdField]));
    setOpenAnimSuppressedIds((prev) => {
      const next = new Set([...prev].filter((fid) => flatIds.has(fid)));
      if (next.size === prev.size && [...prev].every((x) => next.has(x))) return prev;
      return next;
    });
  }, [flattenedRows, treeRowIdField]);

  const closingMaxStaggerIndex = useMemo(() => {
    if (pendingCollapseId == null || !animateRows) return 0;
    let max = 0;
    for (let i = 0; i < flattenedRows.length; i += 1) {
      if (isDescendantOf(flattenedRows[i], pendingCollapseId)) max = Math.max(max, i);
    }
    return max;
  }, [pendingCollapseId, flattenedRows, isDescendantOf, animateRows]);

  const treeAggregateMap = useMemo(() => {
    if (!treeDataConfig.aggregateValueField) return null;
    return computeTreeAggregates(gridRows, {
      valueField: treeDataConfig.aggregateValueField,
      idField: treeRowIdField,
      parentField: treeParentField,
    });
  }, [gridRows, treeDataConfig.aggregateValueField, treeRowIdField, treeParentField]);

  useEffect(() => {
    setTotalCount(flattenedRows.length);
  }, [flattenedRows.length, setTotalCount]);

  useEffect(() => {
    if (!pendingCollapseId || !animateRows) return undefined;
    const collapseId = pendingCollapseId;
    const delay = TREE_ROW_ANIM_MS + closingMaxStaggerIndex * TREE_ROW_STAGGER_MS;
    const t = setTimeout(() => {
      setExpandedRowIds((prev) => {
        const next = new Set(prev);
        next.delete(collapseId);
        return next;
      });
      setPendingCollapseId(null);
    }, delay);
    collapseTimerRef.current = t;
    return () => {
      clearTimeout(t);
      collapseTimerRef.current = null;
    };
  }, [pendingCollapseId, animateRows, closingMaxStaggerIndex]);

  const toggleTreeExpand = useCallback(
    (id) => {
      const prev = expandedRef.current;

      if (!prev.has(id)) {
        setExpandedRowIds((s) => {
          const next = new Set(s);
          next.add(id);
          return next;
        });
        return;
      }

      if (pendingCollapseRef.current === id) {
        setOpenAnimSuppressedIds((prev) => {
          const next = new Set(prev);
          for (const r of gridRows) {
            if (isDescendantOf(r, id)) next.add(r[treeRowIdField]);
          }
          return next;
        });
        setPendingCollapseId(null);
        if (collapseTimerRef.current) {
          clearTimeout(collapseTimerRef.current);
          collapseTimerRef.current = null;
        }
        return;
      }

      if (!animateRows) {
        setExpandedRowIds((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
        return;
      }

      if (pendingCollapseRef.current != null && pendingCollapseRef.current !== id) {
        const flushId = pendingCollapseRef.current;
        const candidateRow = rowsById.get(id);
        if (candidateRow && isDescendantOf(candidateRow, flushId)) {
          setExpandedRowIds((s) => {
            const next = new Set(s);
            next.delete(flushId);
            return next;
          });
          setPendingCollapseId(null);
          if (collapseTimerRef.current) {
            clearTimeout(collapseTimerRef.current);
            collapseTimerRef.current = null;
          }
          return;
        }
        setExpandedRowIds((s) => {
          const next = new Set(s);
          next.delete(flushId);
          return next;
        });
        setPendingCollapseId(null);
        if (collapseTimerRef.current) {
          clearTimeout(collapseTimerRef.current);
          collapseTimerRef.current = null;
        }
      }

      setPendingCollapseId(id);
    },
    [animateRows, isDescendantOf, gridRows, rowsById, treeRowIdField],
  );

  const viewRowIds = useMemo(() => flattenedRows.map((r) => r[treeRowIdField]), [flattenedRows, treeRowIdField]);

  const { rs, selectedSet, selectionEnabled, showSelectColumn, enableClickSelection, leftColumns, centerColumns, rightColumns, hasSplit, selectionPane, toggleRowSelection, toggleSelectAllInView, allSelectedInView, someSelectedInView, applySelectionForRowClick, handleRowBackgroundClick, editableClickSelectionTimerRef } = useGridRowSelection({
    rowSelection: rowSelectionProp,
    onSelectionChange,
    orderedColumns,
    pinnedOverrides,
    rows: gridRows,
    viewRowIds,
    rowIdField: treeRowIdField,
    treeOptions,
  });

  const allSelectedVisible = allSelectedInView;
  const someSelectedVisible = someSelectedInView;
  const toggleSelectAllVisible = toggleSelectAllInView;

  const { filterDraft, setFilterDraft, filterPopoverField, filterPopoverSelection, setFilterPopoverSelection, distinctByField, filterFunnelRefs, closeFilterPopover, applyFilterPopover, toggleColumnFilterPopover } = useGridFilters({ enableFiltering, columns, queryState, setFilter, clearFilters, treeMode: true });

  useGridEditFocus(editingCell);
  const verticalScrollMasterPane = hasSplit && rightColumns.length > 0 ? 'right' : 'center';

  const gridSplitRowRef = useGridSplitSync({ hasSplit, rowCount: flattenedRows.length, variant: 'tree' });
  const splitScrollSyncKey = `${verticalScrollMasterPane}|${leftColumns.map((c) => c.field).join(',')}|${centerColumns.map((c) => c.field).join(',')}|${rightColumns.map((c) => c.field).join(',')}`;
  useGridSplitPaneScrollSync(gridSplitRowRef, hasSplit, flattenedRows.length, splitScrollSyncKey);

  const updateSidePaneRealX = useCallback(() => {
    if (!hasSplit) {
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
  }, [hasSplit, SIDE_X_OVERFLOW_THRESHOLD_PX]);

  useLayoutEffect(() => {
    updateSidePaneRealX();
    const rafId = requestAnimationFrame(updateSidePaneRealX);
    return () => cancelAnimationFrame(rafId);
  }, [updateSidePaneRealX, flattenedRows.length, leftColumns.length, centerColumns.length, rightColumns.length, columnSizeMode, columnWidths]);

  useEffect(() => {
    if (!hasSplit) return;

    const trackedPanes = [
      ['left', paneScrollRefs.current.left],
      ['right', paneScrollRefs.current.right],
    ].filter(([, el]) => Boolean(el));
    if (trackedPanes.length === 0) return;
    const trackedContent = trackedPanes.map(([, el]) => el.querySelector('.tree-data-grid')).filter(Boolean);

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

  const hasRows = flattenedRows.length > 0;

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
      setGridRows((rowsSnapshot) => {
        previousRows.push(...rowsSnapshot);
        return rowsSnapshot.map((currentRow) => (currentRow.id === row.id ? { ...currentRow, [column.field]: normalizedValue } : currentRow));
      });

      try {
        await patchRow(row.id, { [column.field]: normalizedValue }, { treeMode: true });
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

  const renderCell = (row, column) => {
    const isEditing = editingCell?.rowId === row.id && editingCell?.field === column.field;
    const isSaving = (savingCell?.rowId === row.id && savingCell?.field === column.field) || (customSavingCell?.rowId === row.id && customSavingCell?.field === column.field);
    const baseRenderParams = { row, column, value: row[column.field], isEditing, isSaving, treeAggregate: treeAggregateMap?.get(row[treeRowIdField]) };

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
    const applied = queryState.filters[field];

    let values = null;
    if (applied?.operator === 'in' && Array.isArray(applied.value) && applied.value.length > 0) values = applied.value.map(String);

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
    const setScrollRef = (node) => (pane === 'left' || pane === 'right') && (paneScrollRefs.current[pane] = node);

    const showLeadingSelect = showSelectColumn && selectionPane === pane;
    const colTpl = buildGridTemplateColumns(sectionColumns, { showSelect: showLeadingSelect, columnWidths, columnSizeMode });

    return (
      <div className={`grid-pane grid-pane--${pane}`} data-pane={pane}>
        <div ref={setScrollRef} className={[hasSplit ? 'grid-pane-scroll grid-pane-scroll--pinned' : 'grid-pane-scroll', hasSplit && pane !== 'center' && sidePaneHasRealX[pane] ? 'grid-pane-scroll--has-real-x' : ''].filter(Boolean).join(' ')} data-hscroll={hasSplit ? 'always' : 'auto'}>
          <div className={['tree-data-grid', resizingField ? 'tree-data-grid--column-resizing' : ''].filter(Boolean).join(' ') || undefined} data-column-size-mode={columnSizeMode} role="grid" aria-rowcount={flattenedRows.length} aria-colcount={sectionColumns.length + (showLeadingSelect ? 1 : 0)}>
            <div className="tree-data-grid-header" role="rowgroup">
              <div className="tree-data-grid-header-row" role="row" {...(hasSplit ? { 'data-tree-sync-header': '' } : {})} style={{ gridTemplateColumns: colTpl }}>
                {showLeadingSelect ? (
                  <div className="tree-grid-header-cell tree-grid-header-cell--select" role="columnheader" data-field="__select__">
                    {enableFiltering ? (
                      <div className="header-stack">
                        <div className="header-cell header-cell--select">{rs.mode === 'multi' ? <input className="grid-checkbox" type="checkbox" aria-label="Select all visible rows" checked={allSelectedVisible} ref={(el) => el && (el.indeterminate = someSelectedVisible)} onChange={toggleSelectAllVisible} /> : null}</div>
                        <div className="header-filter">
                          <span className="header-filter-spacer" aria-hidden />
                        </div>
                      </div>
                    ) : (
                      <div className="header-cell header-cell--select">{rs.mode === 'multi' ? <input className="grid-checkbox" type="checkbox" aria-label="Select all visible rows" checked={allSelectedVisible} ref={(el) => el && (el.indeterminate = someSelectedVisible)} onChange={toggleSelectAllVisible} /> : null}</div>
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
                      className={['tree-grid-header-cell', thClassName].filter(Boolean).join(' ') || undefined}
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
                                            [column.field]: { quick: value, operator, inValues: undefined },
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
            <div className={['grid-pane-body-scroll', pane === verticalScrollMasterPane ? 'grid-pane-scroll--y-master' : ''].filter(Boolean).join(' ')}>
              <div className="tree-data-grid-body" role="rowgroup">
                {flattenedRows.map((row, rowIndex) => {
                  const rid = row[treeRowIdField];
                  const subtreeIds = groupSelection === 'descendants' && (childrenMap.get(rid)?.length ?? 0) > 0 ? collectSubtreeIds(rid, childrenMap) : [rid];
                  const selectedInSubtree = subtreeIds.filter((id) => selectedSet.has(id)).length;
                  const checkboxChecked = selectedInSubtree === subtreeIds.length;
                  const checkboxIndeterminate = selectedInSubtree > 0 && selectedInSubtree < subtreeIds.length;
                  const rowHighlight = groupSelection === 'descendants' ? selectedInSubtree > 0 : selectedSet.has(rid);
                  const rowInner = (
                    <div role="row" className={['tree-data-grid-row', rowHighlight ? 'data-grid-row--selected' : '', enableClickSelection ? 'data-grid-row--clickable' : ''].filter(Boolean).join(' ') || undefined} style={{ gridTemplateColumns: colTpl }} aria-selected={selectionEnabled ? rowHighlight : undefined} onClick={(event) => handleRowBackgroundClick(event, rid)}>
                      {showLeadingSelect ? (
                        <div className="tree-grid-cell tree-grid-cell--select" role="gridcell" data-field="__select__" data-no-row-select>
                          <input
                            className="grid-checkbox"
                            type="checkbox"
                            checked={checkboxChecked}
                            ref={(el) => {
                              if (el) el.indeterminate = checkboxIndeterminate;
                            }}
                            onChange={() => toggleRowSelection(rid)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select row ${String(rid)}`}
                          />
                        </div>
                      ) : null}
                      {sectionColumns.map((column) => {
                        const cellInner = renderCell(row, column);
                        const treeWrap = column.field === treeExpandColumnField;
                        return (
                          <div key={`${row.id}-${column.field}`} role="gridcell" className="tree-grid-cell" style={columnStyle(column)} data-field={column.field} data-pinned={getEffectivePin(column, pinnedOverrides) ?? undefined}>
                            {treeWrap ? (
                              <div className="tree-cell" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: (row.__treeDepth ?? 0) * treeIndentPerLevel, flexShrink: 0 }} aria-hidden />
                                {row.__treeHasChildren ? (
                                  <button
                                    type="button"
                                    className="tree-toggle"
                                    data-no-row-select
                                    aria-expanded={row.__treeExpanded}
                                    aria-label={row.__treeExpanded ? 'Collapse' : 'Expand'}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleTreeExpand(row[treeRowIdField]);
                                    }}
                                  >
                                    <span className="tree-toggle-icon" aria-hidden>
                                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" focusable="false">
                                        <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                                      </svg>
                                    </span>
                                  </button>
                                ) : (
                                  <span className="tree-toggle-placeholder" aria-hidden style={{ width: 22, display: 'inline-block', flexShrink: 0 }} />
                                )}
                                <div className="tree-cell-body" style={{ flex: 1, minWidth: 0 }}>
                                  {cellInner}
                                </div>
                              </div>
                            ) : (
                              cellInner
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );

                  const isClosingRow = pendingCollapseId != null && animateRows && isDescendantOf(row, pendingCollapseId);
                  const suppressOpenAnim = openAnimSuppressedIds.has(row[treeRowIdField]);

                  return (
                    <div key={rid} className={['tree-row-height-anim', animateRows && !isClosingRow && !suppressOpenAnim && 'tree-row-height-anim--animate', animateRows && isClosingRow && 'tree-row-height-anim--animate-out'].filter(Boolean).join(' ') || undefined} {...(hasSplit ? { 'data-sync-row-index': rowIndex } : {})} style={{ '--tree-row-stagger': rowIndex }}>
                      <div className="tree-row-height-anim__clip">{rowInner}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {hasSplit && pane !== 'center' && !sidePaneHasRealX[pane] ? <div className="grid-pane-scroll-affordance" aria-hidden /> : null}
        </div>
      </div>
    );
  };

  return (
    <div className="grid-container" ref={gridMeasureRootRef}>
      {showSelectColumn && rs.mode === 'multi' && treeDataConfig.showGroupSelectionControl !== false ? (
        <div className="tree-grid-group-selection-toolbar">
          <label className="tree-grid-group-selection-label">
            Group selects:
            <select aria-label="Group selection mode" value={groupSelection} onChange={(e) => setGroupSelection(e.target.value)}>
              <option value="self">self</option>
              <option value="descendants">descendants</option>
            </select>
          </label>
        </div>
      ) : null}
      {gridError && <p className="status error">{gridError}</p>}
      {editError && <p className="status error">{editError}</p>}
      {!gridLoading && !hasRows && <p className="status">No rows found.</p>}

      <div className={`grid-split-root${hasSplit ? ' grid-split-root--split' : ''}`}>
        {gridLoading ? <GridLoadingOverlay LoadingComponent={LoadingComponent} /> : null}
        <div className="grid-split-row" ref={gridSplitRowRef}>
          {renderSectionGrid(leftColumns, 'left')}
          {renderSectionGrid(centerColumns, 'center')}
          {renderSectionGrid(rightColumns, 'right')}
        </div>
      </div>

      {filterPopoverField ? (
        <ColumnFilterPopover
          isOpen
          onClose={closeFilterPopover}
          onApply={applyFilterPopover}
          anchorEl={filterFunnelRefs.current[filterPopoverField]}
          label={columns.find((c) => c.field === filterPopoverField)?.label ?? filterPopoverField}
          distinctValues={distinctByField[filterPopoverField] ?? []}
          selectedValues={filterPopoverSelection}
          onChange={setFilterPopoverSelection}
        />
      ) : null}
    </div>
  );
};
