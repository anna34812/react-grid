import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useGridQuery } from "../hooks/useGridQuery";
import { useGridData } from "../hooks/useGridData";
import { useInlineEdit } from "../hooks/useInlineEdit";
import { fetchDistinctColumnValues, patchRow } from "../api/gridApi";
import { mergeColumnOrder, reorderFields } from "../utils/columnOrder";
import { getColumnMinWidth, getColumnSections, getEffectivePin } from "../utils/columnPinning";
import { reorderRowsById } from "../utils/rowOrder";
import { ColumnFilterPopover, FilterFunnelIcon } from "./ColumnFilterPopover";
import { GridPagination } from "./GridPagination";
import { SetFilterSummaryReadonlyInput } from "./SetFilterSummaryReadonlyInput";

const nextSortDirection = (currentField, currentDirection, field) => {
  if (currentField !== field) return "asc";
  if (currentDirection === "asc") return "desc";
  if (currentDirection === "desc") return null;
  return "asc";
};

const toIdSet = (ids) => {
  if (ids == null) return new Set();
  return new Set(Array.isArray(ids) ? ids : [...ids]);
};

/** Merged with `rowSelection` from props; spread this in the app for partial overrides. */
export const DEFAULT_ROW_SELECTION = { mode: "none", checkboxes: true, enableClickSelection: false, selectedIds: undefined, defaultSelectedIds: undefined };

const mergeRowSelection = (partial) => {
  const rs = { ...DEFAULT_ROW_SELECTION, ...(partial ?? {}) };
  if (rs.mode !== "none" && !rs.checkboxes && !rs.enableClickSelection) rs.enableClickSelection = true;
  return rs;
};

export const DataGrid = ({ columns, columnOrder: columnOrderProp, onColumnOrderChange, enableColumnReorder = false, enableRowDrag = false, onRowOrderChange, rowSelection: rowSelectionProp, onSelectionChange, onEditedRowsChange, enableFiltering = true }) => {
  const rs = useMemo(() => mergeRowSelection(rowSelectionProp), [rowSelectionProp]);
  const { queryState, totalPages, setPage, setPageSize, setSort, setFilter, clearFilters, setTotalCount } = useGridQuery();
  const { rows, loading, error, setRows } = useGridData(queryState, setTotalCount);
  const { editingCell, draftValue, savingCell, editError, setDraftValue, startEdit, cancelEdit, saveEdit } = useInlineEdit(setRows);
  const [filterDraft, setFilterDraft] = useState({});
  const [filterPopoverField, setFilterPopoverField] = useState(null);
  const [distinctByField, setDistinctByField] = useState({});
  const filterFunnelRefs = useRef({});
  const [pinnedOverrides, setPinnedOverrides] = useState({});
  const isControlledColumnOrder = columnOrderProp !== undefined;
  const [internalColumnOrder, setInternalColumnOrder] = useState(() => mergeColumnOrder(undefined, columns));
  const [dragOverField, setDragOverField] = useState(null);
  const [dragOverRowId, setDragOverRowId] = useState(null);
  const editableClickSelectionTimerRef = useRef(null);
  const editedRowsRef = useRef(new Map());
  const [customSavingCell, setCustomSavingCell] = useState(null);

  useLayoutEffect(() => {
    if (!editingCell) return;

    const host = document.querySelector("[data-edit-host]");
    if (!host) return;

    const focusable = host.querySelector("input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [contenteditable='true'], [tabindex]:not([tabindex='-1'])");
    if (focusable instanceof HTMLElement) {
      focusable.focus({ preventScroll: true });
      if (focusable instanceof HTMLInputElement) focusable.select();
    }
  }, [editingCell]);

  useEffect(() => {
    if (!isControlledColumnOrder) {
      setInternalColumnOrder((prev) => mergeColumnOrder(prev, columns));
    }
  }, [columns, isControlledColumnOrder]);

  const displayOrder = useMemo(() => mergeColumnOrder(isControlledColumnOrder ? columnOrderProp : internalColumnOrder, columns), [isControlledColumnOrder, columnOrderProp, internalColumnOrder, columns]);

  const orderedColumns = useMemo(() => {
    const byField = Object.fromEntries(columns.map((c) => [c.field, c]));
    return displayOrder.map((f) => byField[f]).filter(Boolean);
  }, [columns, displayOrder]);

  const commitColumnOrder = useCallback(
    (next) => {
      onColumnOrderChange?.(next);
      if (!isControlledColumnOrder) setInternalColumnOrder(next);
    },
    [onColumnOrderChange, isControlledColumnOrder],
  );

  const handleColumnDrop = useCallback(
    (event, targetField) => {
      if (!enableColumnReorder) return;
      event.preventDefault();
      event.stopPropagation();
      setDragOverField(null);

      const sourceField = event.dataTransfer.getData("application/x-data-grid-field");
      if (!sourceField || sourceField === targetField) return;

      const next = reorderFields(displayOrder, sourceField, targetField);
      commitColumnOrder(next);
    },
    [enableColumnReorder, displayOrder, commitColumnOrder],
  );

  const handleColumnHeaderDragStart = useCallback(
    (event, column) => {
      if (!enableColumnReorder || column.movable !== true) return;
      if (event.target.closest("input, select, textarea, .header-filter, .pin-actions")) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.setData("application/x-data-grid-field", column.field);
      event.dataTransfer.effectAllowed = "move";
    },
    [enableColumnReorder],
  );

  const handleRowDrop = useCallback(
    (event, targetRowId) => {
      if (!enableRowDrag) return;
      event.preventDefault();
      event.stopPropagation();
      setDragOverRowId(null);
      const raw = event.dataTransfer.getData("application/x-data-grid-row-id");
      if (!raw || raw === String(targetRowId)) return;

      setRows((previous) => {
        const next = reorderRowsById(previous, raw, targetRowId);
        onRowOrderChange?.({ orderedIds: next.map((r) => r.id), rows: next });
        return next;
      });
    },
    [enableRowDrag, setRows, onRowOrderChange],
  );

  const selectionEnabled = rs.mode === "single" || rs.mode === "multi";
  const showSelectColumn = selectionEnabled && rs.checkboxes;
  const enableClickSelection = selectionEnabled && rs.enableClickSelection;
  const isControlled = rs.selectedIds !== undefined;

  const [internalSelected, setInternalSelected] = useState(() => toIdSet(mergeRowSelection(rowSelectionProp).defaultSelectedIds));

  const { left: leftColumns, center: centerColumns, right: rightColumns } = useMemo(() => getColumnSections(orderedColumns, pinnedOverrides), [orderedColumns, pinnedOverrides]);

  const hasSplit = leftColumns.length > 0 || rightColumns.length > 0;

  const selectedSet = useMemo(() => {
    if (!selectionEnabled) return new Set();
    if (isControlled) return toIdSet(rs.selectedIds);

    return internalSelected;
  }, [selectionEnabled, isControlled, rs.selectedIds, internalSelected]);

  const selectionPane = useMemo(() => {
    if (!showSelectColumn) return null;
    if (leftColumns.length > 0) return "left";
    if (centerColumns.length > 0) return "center";
    if (rightColumns.length > 0) return "right";

    return null;
  }, [showSelectColumn, leftColumns.length, centerColumns.length, rightColumns.length]);

  const leadingPane = useMemo(() => {
    if (leftColumns.length > 0) return "left";
    if (centerColumns.length > 0) return "center";
    if (rightColumns.length > 0) return "right";

    return null;
  }, [leftColumns.length, centerColumns.length, rightColumns.length]);

  const pageIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const gridSplitRowRef = useRef(null);

  useLayoutEffect(() => {
    if (!hasSplit) return;

    const rootEl = gridSplitRowRef.current;
    if (!rootEl || typeof ResizeObserver === "undefined") return;

    let rafId = 0;
    const syncSplitHeights = () => {
      const headerTrs = [...rootEl.querySelectorAll("thead tr[data-sync-header]")];
      if (headerTrs.length > 1) {
        headerTrs.forEach((tr) => (tr.style.height = ""));

        const maxHeader = Math.max(0, ...headerTrs.map((tr) => tr.getBoundingClientRect().height));
        headerTrs.forEach((tr) => (tr.style.height = `${maxHeader}px`));
      }

      for (let i = 0; i < rows.length; i += 1) {
        const trs = [...rootEl.querySelectorAll(`tbody tr[data-sync-row-index="${i}"]`)];
        if (trs.length <= 1) continue;
        trs.forEach((tr) => (tr.style.height = ""));

        const maxRow = Math.max(0, ...trs.map((tr) => tr.getBoundingClientRect().height));
        trs.forEach((tr) => (tr.style.height = `${maxRow}px`));
      }
    };

    const scheduleSync = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(syncSplitHeights);
    };

    scheduleSync();

    const ro = new ResizeObserver(scheduleSync);
    ro.observe(rootEl);
    rootEl.querySelectorAll("table.data-grid-table").forEach((table) => ro.observe(table));

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [hasSplit, rows]);

  const allSelectedOnPage = pageIds.length > 0 && pageIds.every((id) => selectedSet.has(id));
  const someSelectedOnPage = pageIds.some((id) => selectedSet.has(id)) && !allSelectedOnPage;

  const applySelection = useCallback(
    (nextSet) => {
      if (!selectionEnabled) return;

      const ids = [...nextSet];
      const selectedRows = rows.filter((r) => nextSet.has(r.id));
      if (!isControlled) setInternalSelected(new Set(nextSet));
      onSelectionChange?.({ selectedIds: ids, selectedRows });
    },
    [selectionEnabled, rows, isControlled, onSelectionChange],
  );

  const toggleRowSelection = useCallback(
    (rowId) => {
      if (!selectionEnabled) return;

      const next = new Set(selectedSet);
      if (rs.mode === "single") {
        if (next.has(rowId)) next.clear();
        else {
          next.clear();
          next.add(rowId);
        }
      } else if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      applySelection(next);
    },
    [selectionEnabled, rs.mode, selectedSet, applySelection],
  );

  const toggleSelectAllPage = useCallback(() => {
    if (rs.mode !== "multi" || !rs.checkboxes) return;

    const next = new Set(selectedSet);
    if (allSelectedOnPage) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));

    applySelection(next);
  }, [rs.mode, rs.checkboxes, pageIds, allSelectedOnPage, selectedSet, applySelection]);

  const applySelectionForRowClick = useCallback(
    (event, rowId) => {
      if (!enableClickSelection) return;
      const multiClickWithoutCheckbox = rs.mode === "multi" && !rs.checkboxes && enableClickSelection;
      if (multiClickWithoutCheckbox) {
        const additive = event.ctrlKey || event.metaKey;
        if (additive) toggleRowSelection(rowId);
        else {
          const next = new Set(selectedSet);
          if (next.size === 1 && next.has(rowId)) next.clear();
          else {
            next.clear();
            next.add(rowId);
          }
          applySelection(next);
        }
        return;
      }

      toggleRowSelection(rowId);
    },
    [enableClickSelection, rs.mode, rs.checkboxes, selectedSet, applySelection, toggleRowSelection],
  );

  const handleRowBackgroundClick = useCallback(
    (event, rowId) => {
      if (!enableClickSelection) return;
      if (event.target.closest("[data-no-row-select]")) return;
      if (event.target.closest("[data-edit-host]")) return;
      if (event.target.closest("[data-editable-cell]")) return;

      const btn = event.target.closest("button");
      if (btn && !btn.disabled) return;
      if (event.target.closest("input, select, textarea, a, label")) return;

      applySelectionForRowClick(event, rowId);
    },
    [enableClickSelection, applySelectionForRowClick],
  );

  const setPinForField = (field, pin) => setPinnedOverrides((previous) => ({ ...previous, [field]: pin }));

  useEffect(() => {
    return () => {
      if (editableClickSelectionTimerRef.current) clearTimeout(editableClickSelectionTimerRef.current);
    };
  }, []);

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
        const op = draft.operator ?? column?.filterOperator ?? "contains";

        if (draft.inValues !== undefined && Array.isArray(draft.inValues)) {
          if (draft.inValues.length === 0) {
            setFilter(field, [], "in");
            return;
          }
          const distinct = distinctByField[field];
          if (distinct && distinct.length > 0) {
            const allSelected = draft.inValues.length === distinct.length && distinct.every((v) => draft.inValues.includes(v));
            if (allSelected) {
              const q = draft.quick ?? draft.value ?? "";
              setFilter(field, q, op);
              return;
            }
          }
          setFilter(field, draft.inValues, "in");
          return;
        }

        const quick = draft.quick ?? draft.value ?? "";
        setFilter(field, quick, op);
      });
    }, 300);

    return () => clearTimeout(debounceId);
  }, [enableFiltering, filterDraft, setFilter, columns, distinctByField]);

  const closeFilterPopover = useCallback(() => setFilterPopoverField(null), []);

  const handlePopoverSelectionChange = useCallback((field, nextSelected) => {
    setFilterDraft((previous) => {
      const cur = previous[field] ?? { quick: "", operator: "contains" };
      return { ...previous, [field]: { ...cur, inValues: nextSelected } };
    });
  }, []);

  const toggleColumnFilterPopover = useCallback(
    async (field) => {
      if (filterPopoverField === field) {
        setFilterPopoverField(null);
        return;
      }
      const vals = await fetchDistinctColumnValues(field);
      setDistinctByField((p) => ({ ...p, [field]: vals }));
      setFilterDraft((prev) => {
        const cur = prev[field] ?? {};
        const quick = cur.quick ?? cur.value ?? "";
        const op = cur.operator ?? columns.find((c) => c.field === field)?.filterOperator ?? "contains";
        const applied = queryState.filters[field];
        let inValues;
        if (applied?.operator === "in" && Array.isArray(applied.value)) {
          inValues = applied.value.map(String);
        } else {
          inValues = [...vals];
        }
        return { ...prev, [field]: { quick, operator: op, inValues } };
      });
      setFilterPopoverField(field);
    },
    [filterPopoverField, columns, queryState.filters],
  );

  const pageFrom = (queryState.page - 1) * queryState.pageSize + 1;
  const pageTo = Math.min(queryState.page * queryState.pageSize, queryState.totalCount || 0);
  const hasRows = rows.length > 0;

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
      const nextValue = column.type === "number" ? Number(draftValue) : draftValue;
      const didSave = await saveEdit({ rowId: row.id, field: column.field, column });
      if (!didSave) return;

      emitEditedRowsChange({ rowId: row.id, field: column.field, value: nextValue, previousRow });
    },
    [draftValue, saveEdit, emitEditedRowsChange],
  );

  const updateCustomCellValue = useCallback(
    async ({ row, column, nextValue }) => {
      const normalizedValue = column.type === "number" ? Number(nextValue) : nextValue;
      if (Object.is(row[column.field], normalizedValue)) return true;

      const previousRows = [];
      setCustomSavingCell({ rowId: row.id, field: column.field });
      setRows((rowsSnapshot) => {
        previousRows.push(...rowsSnapshot);
        return rowsSnapshot.map((currentRow) => (currentRow.id === row.id ? { ...currentRow, [column.field]: normalizedValue } : currentRow));
      });

      try {
        await patchRow(row.id, { [column.field]: normalizedValue });
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
        const previousValue = row[column.field] == null ? "" : String(row[column.field]);
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
        if (event.key === "Enter") {
          if (event.target.closest("textarea")) return;

          event.preventDefault();
          event.stopPropagation();
          commitEditIfChanged();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancelEdit();
        }
      };

      if (typeof column.renderEditCell === "function") {
        return (
          <div className='edit-cell' data-no-row-select data-edit-host onPointerDown={stopEditHostBubble} onPointerUp={stopEditHostBubble} onClick={stopEditHostBubble} onBlur={handleEditHostBlur} onKeyDown={handleEditHostKeyDown}>
            {column.renderEditCell({ ...baseRenderParams, value: draftValue, setValue: setDraftValue, save: () => handleSaveEdit({ row, column }), cancel: cancelEdit })}
          </div>
        );
      }

      return (
        <div className='edit-cell' data-no-row-select data-edit-host onPointerDown={stopEditHostBubble} onPointerUp={stopEditHostBubble} onClick={stopEditHostBubble} onBlur={handleEditHostBlur} onKeyDown={handleEditHostKeyDown}>
          <input value={draftValue} disabled={isSaving} onChange={(event) => setDraftValue(event.target.value)} onClick={stopEditHostBubble} onPointerDown={stopEditHostBubble} />
        </div>
      );
    }

    if (typeof column.renderCell === "function") {
      return column.renderCell({
        ...baseRenderParams,
        startEdit: () => startEdit(row.id, column.field, row[column.field]),
        updateValue: (nextValue) => updateCustomCellValue({ row, column, nextValue }),
      });
    }

    if (!column.editable) return <span className='cell-display'>{String(row[column.field])}</span>;

    const editableCellKey = `${row.id}:${column.field}`;

    return (
      <span
        role='button'
        tabIndex={isSaving ? -1 : 0}
        className='cell-button cell-button--editable'
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

          if (e.key === "Enter" || e.key === " ") {
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

  const columnStyle = (column) => ({ minWidth: getColumnMinWidth(column) });

  /** When a subset "in" filter is active, show count + value list (width-fitted) and funnel badge. */
  const getSetFilterSummary = (field) => {
    const distinct = distinctByField[field];
    const draft = filterDraft[field];
    const applied = queryState.filters[field];

    let values = null;
    if (draft?.inValues !== undefined && Array.isArray(draft.inValues)) {
      values = draft.inValues.map(String);
    } else if (applied?.operator === "in" && Array.isArray(applied.value) && applied.value.length > 0) {
      values = applied.value.map(String);
    }

    if (!values || values.length === 0) return { isActive: false };

    if (distinct && distinct.length > 0) {
      const allSelected = values.length === distinct.length && distinct.every((v) => values.includes(String(v)));
      if (allSelected) return { isActive: false };
    }

    const sorted = [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return { isActive: true, count: values.length, values: sorted };
  };

  const renderColumnDragHandle = (column) => {
    if (!enableColumnReorder || column.movable === true) return null;

    return (
      <button
        type='button'
        className='column-drag-handle'
        data-column-drag-handle
        aria-label={`Move column ${column.label}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("application/x-data-grid-field", column.field);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => setDragOverField(null)}
      >
        ⠿
      </button>
    );
  };

  const renderSectionTable = (sectionColumns, pane) => {
    if (sectionColumns.length === 0) return null;

    const showLeadingSelect = showSelectColumn && selectionPane === pane;
    const showLeadingRowDrag = enableRowDrag && leadingPane === pane;

    return (
      <div className={`grid-pane grid-pane--${pane}`} data-pane={pane}>
        <div className={hasSplit ? "grid-pane-scroll grid-pane-scroll--pinned" : "grid-pane-scroll"} data-hscroll={hasSplit ? "always" : "auto"}>
          <table className='data-grid-table'>
            <thead>
              <tr {...(hasSplit ? { "data-sync-header": "" } : {})}>
                {showLeadingRowDrag ? (
                  <th className='grid-row-drag-header' scope='col' aria-label='Reorder rows' style={{ width: 36, minWidth: 36 }} data-field='__rowDrag__'>
                    <div className='header-stack'>
                      <div className='header-filter'>
                        <span className='header-filter-spacer' aria-hidden />
                      </div>
                    </div>
                  </th>
                ) : null}
                {showLeadingSelect ? (
                  <th className='grid-select-header' style={{ width: 44, minWidth: 44 }} data-field='__select__'>
                    {enableFiltering ? (
                      <div className='header-stack'>
                        <div className='header-cell header-cell--select'>{rs.mode === "multi" ? <input type='checkbox' aria-label='Select all rows on this page' checked={allSelectedOnPage} ref={(el) => el && (el.indeterminate = someSelectedOnPage)} onChange={toggleSelectAllPage} /> : null}</div>
                        <div className='header-filter'>
                          <span className='header-filter-spacer' aria-hidden />
                        </div>
                      </div>
                    ) : (
                      <div className='header-cell header-cell--select'>{rs.mode === "multi" ? <input type='checkbox' aria-label='Select all rows on this page' checked={allSelectedOnPage} ref={(el) => el && (el.indeterminate = someSelectedOnPage)} onChange={toggleSelectAllPage} /> : null}</div>
                    )}
                  </th>
                ) : null}
                {sectionColumns.map((column) => {
                  const isSorted = queryState.sortField === column.field;
                  const direction = isSorted ? queryState.sortDirection : null;
                  const pin = getEffectivePin(column, pinnedOverrides);
                  const dragOver = enableColumnReorder && dragOverField === column.field;
                  const headerDrag = enableColumnReorder && column.movable === true;
                  const thClassName = [dragOver && "column-th--drag-over", headerDrag && "column-th--movable"].filter(Boolean).join(" ") || undefined;
                  return (
                    <th
                      key={column.field}
                      style={columnStyle(column)}
                      data-field={column.field}
                      data-pinned={pin ?? undefined}
                      className={thClassName}
                      draggable={headerDrag}
                      onDragStart={headerDrag ? (e) => handleColumnHeaderDragStart(e, column) : undefined}
                      onDragEnd={headerDrag ? () => setDragOverField(null) : undefined}
                      onDragOverCapture={
                        enableColumnReorder
                          ? (e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "move";
                              setDragOverField(column.field);
                            }
                          : undefined
                      }
                      onDragLeave={enableColumnReorder ? (e) => !e.currentTarget.contains(e.relatedTarget) && setDragOverField(null) : undefined}
                      onDropCapture={enableColumnReorder ? (e) => handleColumnDrop(e, column.field) : undefined}
                    >
                      {enableFiltering ? (
                        <div className='header-stack'>
                          <div className='header-cell header-cell--title-row'>
                            {renderColumnDragHandle(column)}
                            <button type='button' className='header-button' onClick={() => handleSort(column.field)}>
                              {column.label}
                              {direction === "asc" && " \u2191"}
                              {direction === "desc" && " \u2193"}
                            </button>
                            {/* <button type='button' className='header-column-menu-btn' aria-label={`${column.label} column menu`} title='Column menu'>
                              ⋮
                            </button> */}
                            <div className='pin-actions' role='group' aria-label={`${column.label} pinning`}>
                              <button type='button' className={`pin-button${pin === "left" ? " active" : ""}`} aria-pressed={pin === "left"} aria-label={`Pin ${column.label} left`} onClick={() => setPinForField(column.field, pin === "left" ? null : "left")}>
                                L
                              </button>
                              <button type='button' className={`pin-button${pin === "right" ? " active" : ""}`} aria-pressed={pin === "right"} aria-label={`Pin ${column.label} right`} onClick={() => setPinForField(column.field, pin === "right" ? null : "right")}>
                                R
                              </button>
                            </div>
                          </div>
                          <div className='header-filter'>
                            {column.filterable ? (
                              (() => {
                                const setSummary = getSetFilterSummary(column.field);
                                const quickValue = filterDraft[column.field]?.quick ?? filterDraft[column.field]?.value ?? "";

                                return (
                                  <div className={`header-filter-inline${setSummary.isActive ? " header-filter-inline--set-active" : ""}`}>
                                    {setSummary.isActive ? (
                                      <SetFilterSummaryReadonlyInput
                                        count={setSummary.count}
                                        values={setSummary.values}
                                        columnLabel={column.label}
                                        className={`header-filter-input header-filter-input--set-active`}
                                        placeholder={`Filter ${column.label}`}
                                        onClick={() => void toggleColumnFilterPopover(column.field)}
                                      />
                                    ) : (
                                      <input
                                        className='header-filter-input'
                                        placeholder={`Filter ${column.label}`}
                                        aria-label={`Filter ${column.label}`}
                                        value={quickValue}
                                        onChange={(event) => {
                                          const value = event.target.value;
                                          const operator = column.filterOperator || "contains";
                                          setFilterDraft((previous) => ({
                                            ...previous,
                                            [column.field]: { quick: value, operator, inValues: undefined },
                                          }));
                                        }}
                                      />
                                    )}
                                    <button
                                      type='button'
                                      ref={(el) => {
                                        if (el) filterFunnelRefs.current[column.field] = el;
                                        else delete filterFunnelRefs.current[column.field];
                                      }}
                                      className={[
                                        "header-filter-funnel",
                                        filterPopoverField === column.field ? "header-filter-funnel--open" : "",
                                        setSummary.isActive ? "header-filter-funnel--active" : "",
                                      ]
                                        .filter(Boolean)
                                        .join(" ")}
                                      aria-label={`Filter options for ${column.label}`}
                                      aria-expanded={filterPopoverField === column.field}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void toggleColumnFilterPopover(column.field);
                                      }}
                                    >
                                      <FilterFunnelIcon />
                                      {setSummary.isActive ? <span className='header-filter-funnel-badge' aria-hidden /> : null}
                                    </button>
                                  </div>
                                );
                              })()
                            ) : (
                              <span className='header-filter-spacer' aria-hidden />
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className='header-cell header-cell--title-row'>
                          {renderColumnDragHandle(column)}
                          <button type='button' className='header-button' onClick={() => handleSort(column.field)}>
                            {column.label}
                            {direction === "asc" && " \u2191"}
                            {direction === "desc" && " \u2193"}
                          </button>
                          {/* <button type='button' className='header-column-menu-btn' aria-label={`${column.label} column menu`} title='Column menu'>
                            ⋮
                          </button> */}
                          <div className='pin-actions' role='group' aria-label={`${column.label} pinning`}>
                            <button type='button' className={`pin-button${pin === "left" ? " active" : ""}`} aria-pressed={pin === "left"} aria-label={`Pin ${column.label} left`} onClick={() => setPinForField(column.field, pin === "left" ? null : "left")}>
                              L
                            </button>
                            <button type='button' className={`pin-button${pin === "right" ? " active" : ""}`} aria-pressed={pin === "right"} aria-label={`Pin ${column.label} right`} onClick={() => setPinForField(column.field, pin === "right" ? null : "right")}>
                              R
                            </button>
                          </div>
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                const rowSelected = selectedSet.has(row.id);
                const rowDragOver = enableRowDrag && dragOverRowId === row.id;
                return (
                  <tr
                    key={row.id}
                    role='row'
                    {...(hasSplit ? { "data-sync-row-index": rowIndex } : {})}
                    className={[rowSelected ? "data-grid-row--selected" : "", enableClickSelection ? "data-grid-row--clickable" : "", rowDragOver ? "data-grid-row--drag-over" : ""].filter(Boolean).join(" ") || undefined}
                    aria-selected={selectionEnabled ? rowSelected : undefined}
                    onClick={(event) => handleRowBackgroundClick(event, row.id)}
                    onDragOverCapture={
                      enableRowDrag
                        ? (e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            setDragOverRowId(row.id);
                          }
                        : undefined
                    }
                    onDragLeave={enableRowDrag ? (e) => !e.currentTarget.contains(e.relatedTarget) && setDragOverRowId(null) : undefined}
                    onDropCapture={enableRowDrag ? (e) => handleRowDrop(e, row.id) : undefined}
                  >
                    {showLeadingRowDrag ? (
                      <td className='grid-row-drag-cell' data-field='__rowDrag__' data-no-row-select>
                        <button
                          type='button'
                          className='row-drag-handle'
                          draggable
                          aria-label={`Reorder row ${row.id}`}
                          onDragStart={(e) => {
                            e.dataTransfer.setData("application/x-data-grid-row-id", String(row.id));
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => setDragOverRowId(null)}
                        >
                          ⠿
                        </button>
                      </td>
                    ) : null}
                    {showLeadingSelect ? (
                      <td className='grid-select-cell' data-field='__select__' data-no-row-select>
                        <input type='checkbox' checked={rowSelected} onChange={() => toggleRowSelection(row.id)} onClick={(e) => e.stopPropagation()} aria-label={`Select row ${row.id}`} />
                      </td>
                    ) : null}
                    {sectionColumns.map((column) => (
                      <td key={`${row.id}-${column.field}`} style={columnStyle(column)} data-field={column.field} data-pinned={getEffectivePin(column, pinnedOverrides) ?? undefined}>
                        {renderCell(row, column)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className='grid-container'>
      {error && <p className='status error'>{error}</p>}
      {editError && <p className='status error'>{editError}</p>}
      {!loading && !hasRows && <p className='status'>No rows found.</p>}

      <div className={`grid-split-root${hasSplit ? " grid-split-root--split" : ""}`}>
        {loading ? (
          <div className='grid-loading-overlay' role='status' aria-live='polite'>
            <div className='grid-loading-chip'>
              <span className='grid-loading-spinner' aria-hidden />
              <span>Loading...</span>
            </div>
          </div>
        ) : null}
        <div className='grid-split-row' ref={gridSplitRowRef}>
          {renderSectionTable(leftColumns, "left")}
          {renderSectionTable(centerColumns, "center")}
          {renderSectionTable(rightColumns, "right")}
        </div>
      </div>

      <GridPagination page={queryState.page} totalPages={totalPages} pageSize={queryState.pageSize} totalCount={queryState.totalCount} pageFrom={pageFrom} pageTo={pageTo} hasRows={hasRows} onPageChange={setPage} onPageSizeChange={setPageSize} />

      {filterPopoverField ? (
        <ColumnFilterPopover
          isOpen
          onClose={closeFilterPopover}
          anchorEl={filterFunnelRefs.current[filterPopoverField]}
          label={columns.find((c) => c.field === filterPopoverField)?.label ?? filterPopoverField}
          distinctValues={distinctByField[filterPopoverField] ?? []}
          selectedValues={filterDraft[filterPopoverField]?.inValues ?? []}
          onChange={(next) => handlePopoverSelectionChange(filterPopoverField, next)}
        />
      ) : null}
    </div>
  );
};
