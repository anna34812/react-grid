import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useGridQuery } from "../hooks/useGridQuery";
import { useGridData } from "../hooks/useGridData";
import { useInlineEdit } from "../hooks/useInlineEdit";
import { fetchDistinctColumnValues, patchRow } from "../api/gridApi";
import { mergeColumnOrder, reorderFields } from "../utils/columnOrder";
import { getColumnMinWidth, getColumnSections, getEffectivePin } from "../utils/columnPinning";
import { computeTreeAggregates, flattenTreeRows, getIdsWithChildren } from "../utils/treeData";
import { ColumnFilterPopover, FilterFunnelIcon } from "./ColumnFilterPopover";
import { GridPagination } from "./GridPagination";
import { SetFilterSummaryReadonlyInput } from "./SetFilterSummaryReadonlyInput";
import { DEFAULT_ROW_SELECTION } from "./DataGrid";

/** Must match `.tree-row-height-anim--animate` / `--animate-out` duration in App.css */
const TREE_ROW_ANIM_MS = 420;
const TREE_ROW_STAGGER_MS = 32;

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

/** Re-export for convenience; same shape as DataGrid. */
export { DEFAULT_ROW_SELECTION };

const mergeRowSelection = (partial) => {
  const rs = { ...DEFAULT_ROW_SELECTION, ...(partial ?? {}) };
  if (rs.mode !== "none" && !rs.checkboxes && !rs.enableClickSelection) rs.enableClickSelection = true;
  return rs;
};

/**
 * Tree (hierarchical) data grid: div-based body for reliable row animations; same features as DataGrid tree mode (filters, sort, pin, column reorder, selection, pagination, aggregates, expand/collapse).
 * Pass flat rows with `parentId` (or `treeData.parentField`); roots use `null` parent.
 *
 * `animateRows`: each body row uses `0fr → 1fr` on mount (expand) and `1fr → 0fr` before removal (collapse). Set `false` for instant show/hide.
 */
export const TreeDataGrid = ({ columns, treeData: treeDataConfig, columnOrder: columnOrderProp, onColumnOrderChange, enableColumnReorder = false, rowSelection: rowSelectionProp, onSelectionChange, onEditedRowsChange, enableFiltering = true, animateRows = true }) => {
  const rs = useMemo(() => mergeRowSelection(rowSelectionProp), [rowSelectionProp]);
  const gridQueryInitial = useMemo(() => ({ treeMode: true, pageSize: treeDataConfig.pageSize ?? 50 }), [treeDataConfig.pageSize]);

  const { queryState, totalPages, setPage, setPageSize, setSort, setFilter, clearFilters, setTotalCount } = useGridQuery(gridQueryInitial);
  const { rows, loading, error, setRows } = useGridData(queryState, setTotalCount);
  const { editingCell, draftValue, savingCell, editError, setDraftValue, startEdit, cancelEdit, saveEdit } = useInlineEdit(setRows, { apiOptions: { treeMode: true } });
  const [filterDraft, setFilterDraft] = useState({});
  const [filterPopoverField, setFilterPopoverField] = useState(null);
  const [distinctByField, setDistinctByField] = useState({});
  const filterFunnelRefs = useRef({});
  const [pinnedOverrides, setPinnedOverrides] = useState({});
  const isControlledColumnOrder = columnOrderProp !== undefined;
  const [internalColumnOrder, setInternalColumnOrder] = useState(() => mergeColumnOrder(undefined, columns));
  const [dragOverField, setDragOverField] = useState(null);
  const treeParentField = treeDataConfig.parentField ?? "parentId";
  const treeRowIdField = treeDataConfig.rowIdField ?? "id";
  const treeExpandColumnField = treeDataConfig.expandColumnField ?? "name";
  const treeIndentPerLevel = treeDataConfig.indentPerLevel ?? 16;
  const [expandedRowIds, setExpandedRowIds] = useState(() => new Set());
  /** While set, that node is visually collapsed but children stay mounted until close animation finishes. */
  const [pendingCollapseId, setPendingCollapseId] = useState(null);
  /** Descendants of a cancelled collapse: keep full height without re-running the open animation. */
  const [openAnimSuppressedIds, setOpenAnimSuppressedIds] = useState(() => new Set());
  const expandedRef = useRef(expandedRowIds);
  expandedRef.current = expandedRowIds;
  const pendingCollapseRef = useRef(null);
  pendingCollapseRef.current = pendingCollapseId;
  const collapseTimerRef = useRef(null);
  const treeExpandInitRef = useRef(false);
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

  useEffect(() => {
    if (!rows.length || treeExpandInitRef.current) return;
    treeExpandInitRef.current = true;
    setExpandedRowIds(getIdsWithChildren(rows, { idField: treeRowIdField, parentField: treeParentField }));
  }, [rows, treeRowIdField, treeParentField]);

  const rowsById = useMemo(() => new Map(rows.map((r) => [r[treeRowIdField], r])), [rows, treeRowIdField]);

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
    const flat = flattenTreeRows(rows, expandedRowIds, { idField: treeRowIdField, parentField: treeParentField });
    if (pendingCollapseId == null) return flat;
    return flat.map((r) => (r[treeRowIdField] === pendingCollapseId ? { ...r, __treeExpanded: false } : r));
  }, [rows, expandedRowIds, pendingCollapseId, treeRowIdField, treeParentField]);

  const displayRows = useMemo(() => {
    const start = (queryState.page - 1) * queryState.pageSize;
    return flattenedRows.slice(start, start + queryState.pageSize);
  }, [flattenedRows, queryState.page, queryState.pageSize]);

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
    for (let i = 0; i < displayRows.length; i += 1) {
      if (isDescendantOf(displayRows[i], pendingCollapseId)) max = Math.max(max, i);
    }
    return max;
  }, [pendingCollapseId, displayRows, isDescendantOf, animateRows]);

  const treeAggregateMap = useMemo(() => {
    if (!treeDataConfig.aggregateValueField) return null;
    return computeTreeAggregates(rows, {
      valueField: treeDataConfig.aggregateValueField,
      idField: treeRowIdField,
      parentField: treeParentField,
    });
  }, [rows, treeDataConfig.aggregateValueField, treeRowIdField, treeParentField]);

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
          for (const r of rows) {
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
    [animateRows, isDescendantOf, rows, rowsById],
  );

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

  const pageIds = useMemo(() => displayRows.map((r) => r.id), [displayRows]);
  const gridSplitRowRef = useRef(null);

  useLayoutEffect(() => {
    if (!hasSplit) return;

    const rootEl = gridSplitRowRef.current;
    if (!rootEl || typeof ResizeObserver === "undefined") return;

    let rafId = 0;
    const syncSplitHeights = () => {
      const headerTrs = [...rootEl.querySelectorAll(".tree-data-grid-header-row[data-tree-sync-header]")];
      if (headerTrs.length > 1) {
        headerTrs.forEach((tr) => (tr.style.height = ""));

        const maxHeader = Math.max(0, ...headerTrs.map((tr) => tr.getBoundingClientRect().height));
        headerTrs.forEach((tr) => (tr.style.height = `${maxHeader}px`));
      }

      for (let i = 0; i < displayRows.length; i += 1) {
        const trs = [...rootEl.querySelectorAll(`.tree-row-height-anim[data-sync-row-index="${i}"]`)];
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
    rootEl.querySelectorAll(".tree-data-grid").forEach((el) => ro.observe(el));

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [hasSplit, displayRows]);

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
      const vals = await fetchDistinctColumnValues(field, { treeMode: true });
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

  const effectiveTotal = flattenedRows.length;
  const pageFrom = effectiveTotal === 0 ? 0 : (queryState.page - 1) * queryState.pageSize + 1;
  const pageTo = Math.min(queryState.page * queryState.pageSize, effectiveTotal);
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
        await patchRow(row.id, { [column.field]: normalizedValue }, { treeMode: true });
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
    const baseRenderParams = { row, column, value: row[column.field], isEditing, isSaving, treeAggregate: treeAggregateMap?.get(row[treeRowIdField]) };

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

  const buildTreeGridTemplateColumns = (sectionColumns, showSelect) => {
    const parts = [];
    if (showSelect) parts.push("44px");
    sectionColumns.forEach((c) => parts.push(`minmax(${getColumnMinWidth(c)}px, 1fr)`));
    return parts.join(" ");
  };

  const renderSectionGrid = (sectionColumns, pane) => {
    if (sectionColumns.length === 0) return null;

    const showLeadingSelect = showSelectColumn && selectionPane === pane;
    const colTpl = buildTreeGridTemplateColumns(sectionColumns, showLeadingSelect);

    return (
      <div className={`grid-pane grid-pane--${pane}`} data-pane={pane}>
        <div className={hasSplit ? "grid-pane-scroll grid-pane-scroll--pinned" : "grid-pane-scroll"} data-hscroll={hasSplit ? "always" : "auto"}>
          <div className='tree-data-grid' role='grid' aria-rowcount={flattenedRows.length} aria-colcount={sectionColumns.length + (showLeadingSelect ? 1 : 0)}>
            <div className='tree-data-grid-header' role='rowgroup'>
              <div
                className='tree-data-grid-header-row'
                role='row'
                {...(hasSplit ? { "data-tree-sync-header": "" } : {})}
                style={{ gridTemplateColumns: colTpl }}
              >
                {showLeadingSelect ? (
                  <div className='tree-grid-header-cell tree-grid-header-cell--select' role='columnheader' data-field='__select__'>
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
                  </div>
                ) : null}
                {sectionColumns.map((column) => {
                  const isSorted = queryState.sortField === column.field;
                  const direction = isSorted ? queryState.sortDirection : null;
                  const pin = getEffectivePin(column, pinnedOverrides);
                  const dragOver = enableColumnReorder && dragOverField === column.field;
                  const headerDrag = enableColumnReorder && column.movable === true;
                  const thClassName = [dragOver && "column-th--drag-over", headerDrag && "column-th--movable"].filter(Boolean).join(" ") || undefined;
                  return (
                    <div
                      key={column.field}
                      role='columnheader'
                      style={columnStyle(column)}
                      data-field={column.field}
                      data-pinned={pin ?? undefined}
                      className={["tree-grid-header-cell", thClassName].filter(Boolean).join(" ") || undefined}
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
                                      <SetFilterSummaryReadonlyInput count={setSummary.count} values={setSummary.values} columnLabel={column.label} className={`header-filter-input header-filter-input--set-active`} placeholder={`Filter ${column.label}`} onClick={() => void toggleColumnFilterPopover(column.field)} />
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
                                      className={["header-filter-funnel", filterPopoverField === column.field ? "header-filter-funnel--open" : "", setSummary.isActive ? "header-filter-funnel--active" : ""].filter(Boolean).join(" ")}
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
                    </div>
                  );
                })}
              </div>
            </div>
            <div className='tree-data-grid-body' role='rowgroup'>
              {displayRows.map((row, rowIndex) => {
                const rowSelected = selectedSet.has(row.id);
                const rowInner = (
                  <div
                    role='row'
                    className={["tree-data-grid-row", rowSelected ? "data-grid-row--selected" : "", enableClickSelection ? "data-grid-row--clickable" : ""].filter(Boolean).join(" ") || undefined}
                    style={{ gridTemplateColumns: colTpl }}
                    aria-selected={selectionEnabled ? rowSelected : undefined}
                    onClick={(event) => handleRowBackgroundClick(event, row.id)}
                  >
                    {showLeadingSelect ? (
                      <div className='tree-grid-cell tree-grid-cell--select' role='gridcell' data-field='__select__' data-no-row-select>
                        <input type='checkbox' checked={rowSelected} onChange={() => toggleRowSelection(row.id)} onClick={(e) => e.stopPropagation()} aria-label={`Select row ${row.id}`} />
                      </div>
                    ) : null}
                    {sectionColumns.map((column) => {
                      const cellInner = renderCell(row, column);
                      const treeWrap = column.field === treeExpandColumnField;
                      return (
                        <div key={`${row.id}-${column.field}`} role='gridcell' className='tree-grid-cell' style={columnStyle(column)} data-field={column.field} data-pinned={getEffectivePin(column, pinnedOverrides) ?? undefined}>
                          {treeWrap ? (
                            <div className='tree-cell' style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{ width: (row.__treeDepth ?? 0) * treeIndentPerLevel, flexShrink: 0 }} aria-hidden />
                              {row.__treeHasChildren ? (
                                <button
                                  type='button'
                                  className='tree-toggle'
                                  data-no-row-select
                                  aria-expanded={row.__treeExpanded}
                                  aria-label={row.__treeExpanded ? "Collapse" : "Expand"}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleTreeExpand(row[treeRowIdField]);
                                  }}
                                >
                                  <span className='tree-toggle-icon' aria-hidden>
                                    <svg viewBox='0 0 24 24' width='16' height='16' fill='currentColor' focusable='false'>
                                      <path d='M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z' />
                                    </svg>
                                  </span>
                                </button>
                              ) : (
                                <span className='tree-toggle-placeholder' aria-hidden style={{ width: 22, display: "inline-block", flexShrink: 0 }} />
                              )}
                              <div className='tree-cell-body' style={{ flex: 1, minWidth: 0 }}>
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
                  <div
                    key={row.id}
                    className={["tree-row-height-anim", animateRows && !isClosingRow && !suppressOpenAnim && "tree-row-height-anim--animate", animateRows && isClosingRow && "tree-row-height-anim--animate-out"].filter(Boolean).join(" ") || undefined}
                    {...(hasSplit ? { "data-sync-row-index": rowIndex } : {})}
                    style={{ "--tree-row-stagger": rowIndex }}
                  >
                    <div className='tree-row-height-anim__clip'>{rowInner}</div>
                  </div>
                );
              })}
            </div>
          </div>
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
          {renderSectionGrid(leftColumns, "left")}
          {renderSectionGrid(centerColumns, "center")}
          {renderSectionGrid(rightColumns, "right")}
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
