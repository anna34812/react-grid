import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getColumnMinWidth } from "../utils/columnPinning";
import { measureColumnContentWidth, measureColumnHeaderContentWidth } from "../utils/gridColumnMeasure";
import { COLUMN_SIZE_MODE } from "../utils/gridTemplateColumns";

const DRAG_THRESHOLD_PX = 3;

/**
 * Tracks per-field pixel widths for grid columns, pointer-drag resize, and double-click auto-fit.
 * When `measureRootRef` + `columns` are set, measures header intrinsic width after layout so "fit to data"
 * uses label/filter/pin width, not only `column.minWidth`.
 *
 * @param {{
 *   enabled?: boolean;
 *   columns?: Array<{ field: string; minWidth?: number; width?: number }>;
 *   columnSizeMode?: string;
 *   measureRootRef?: { current: HTMLElement | null } | null;
 *   enableFiltering?: boolean;
 * }} [options]
 */
export function useGridColumnResize({
  enabled = true,
  columns = [],
  columnSizeMode = COLUMN_SIZE_MODE.FIT_DATA,
  measureRootRef = null,
  enableFiltering = true,
} = {}) {
  const [columnWidths, setColumnWidths] = useState({});
  const [resizing, setResizing] = useState(null);
  const widthsRef = useRef(columnWidths);
  widthsRef.current = columnWidths;

  /** Fields the user has resized or auto-fitted — do not overwrite with header measure. */
  const userSizedFieldsRef = useRef(new Set());

  const columnsKey = useMemo(() => columns.map((c) => c.field).join("|"), [columns]);

  useLayoutEffect(() => {
    const root = measureRootRef?.current;
    if (!root || columns.length === 0) return;

    setColumnWidths((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const column of columns) {
        const field = column.field;
        if (userSizedFieldsRef.current.has(field)) continue;
        const minW = getColumnMinWidth(column);
        const measured = measureColumnHeaderContentWidth(root, field, minW);
        if (next[field] !== measured) {
          next[field] = measured;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [columnsKey, columnSizeMode, enableFiltering, measureRootRef]);

  const startResize = useCallback(
    (column, clientX) => {
      if (!enabled) return;
      const minW = getColumnMinWidth(column);
      const startWidth = widthsRef.current[column.field] ?? minW;
      const field = column.field;
      let started = false;

      const onMove = (e) => {
        if (!started) {
          if (Math.abs(e.clientX - clientX) < DRAG_THRESHOLD_PX) return;
          started = true;
          setResizing({ field, startX: clientX, startWidth, minW });
          document.body.style.cursor = "col-resize";
        }
        const delta = e.clientX - clientX;
        const next = Math.round(Math.max(minW, startWidth + delta));
        setColumnWidths((prev) => {
          if (prev[field] === next) return prev;
          return { ...prev, [field]: next };
        });
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setResizing(null);
        if (started) userSizedFieldsRef.current.add(field);
      };

      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [enabled],
  );

  const autoFitColumn = useCallback(
    (column, event) => {
      if (!enabled) return;
      const root = event.currentTarget.closest(".data-grid, .tree-data-grid");
      if (!root) return;
      const minW = getColumnMinWidth(column);
      const field = column.field;
      const next = measureColumnContentWidth(root, field, minW);
      userSizedFieldsRef.current.add(field);
      setColumnWidths((prev) => ({ ...prev, [field]: next }));
    },
    [enabled],
  );

  return { columnWidths, startResize, autoFitColumn, resizingField: resizing?.field ?? null };
};
