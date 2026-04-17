import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getColumnSections } from "../utils/columnPinning";
import { mergeRowSelection, toIdSet } from "../utils/rowSelection";

/** Row selection, pane placement for the checkbox column, and background-click selection. */
export function useGridRowSelection({ rowSelection: rowSelectionProp, onSelectionChange, orderedColumns, pinnedOverrides, rows, viewRowIds, rowIdField = "id" }) {
  const rs = useMemo(() => mergeRowSelection(rowSelectionProp), [rowSelectionProp]);
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

  const editableClickSelectionTimerRef = useRef(null);

  const allSelectedInView = viewRowIds.length > 0 && viewRowIds.every((id) => selectedSet.has(id));
  const someSelectedInView = viewRowIds.some((id) => selectedSet.has(id)) && !allSelectedInView;

  const applySelection = useCallback(
    (nextSet) => {
      if (!selectionEnabled) return;

      const ids = [...nextSet];
      const selectedRows = rows.filter((r) => nextSet.has(r[rowIdField]));
      if (!isControlled) setInternalSelected(new Set(nextSet));
      onSelectionChange?.({ selectedIds: ids, selectedRows });
    },
    [selectionEnabled, rows, isControlled, onSelectionChange, rowIdField],
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

  const toggleSelectAllInView = useCallback(() => {
    if (rs.mode !== "multi" || !rs.checkboxes) return;

    const next = new Set(selectedSet);
    if (allSelectedInView) viewRowIds.forEach((id) => next.delete(id));
    else viewRowIds.forEach((id) => next.add(id));

    applySelection(next);
  }, [rs.mode, rs.checkboxes, viewRowIds, allSelectedInView, selectedSet, applySelection]);

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

  useEffect(() => {
    return () => {
      if (editableClickSelectionTimerRef.current) clearTimeout(editableClickSelectionTimerRef.current);
    };
  }, []);

  return {
    rs,
    selectedSet,
    selectionEnabled,
    showSelectColumn,
    enableClickSelection,
    isControlled,
    leftColumns,
    centerColumns,
    rightColumns,
    hasSplit,
    selectionPane,
    leadingPane,
    applySelection,
    toggleRowSelection,
    toggleSelectAllInView,
    allSelectedInView,
    someSelectedInView,
    applySelectionForRowClick,
    handleRowBackgroundClick,
    editableClickSelectionTimerRef,
  };
}
