import { useCallback, useRef, useState } from "react";
import { getColumnMinWidth } from "../utils/columnPinning";
import { measureColumnContentWidth } from "../utils/gridColumnMeasure";

const DRAG_THRESHOLD_PX = 3;

/**
 * Tracks per-field pixel widths for grid columns, pointer-drag resize, and double-click auto-fit.
 * @param {{ enabled?: boolean }} options
 */
export function useGridColumnResize({ enabled = true }) {
  const [columnWidths, setColumnWidths] = useState({});
  const [resizing, setResizing] = useState(null);
  const widthsRef = useRef(columnWidths);
  widthsRef.current = columnWidths;

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
      /** Defer until after layout so header flex / scrollWidth are up to date. */
      requestAnimationFrame(() => {
        const next = measureColumnContentWidth(root, field, minW);
        setColumnWidths((prev) => ({ ...prev, [field]: next }));
      });
    },
    [enabled],
  );

  return { columnWidths, startResize, autoFitColumn, resizingField: resizing?.field ?? null };
}
