import { useLayoutEffect, useRef } from "react";

const PRESETS = {
  dataGrid: {
    headerSelector: ".data-grid-header-row[data-sync-header]",
    rowIndexSelector: (i) => `.data-grid-row[data-sync-row-index="${i}"]`,
    gridRoot: ".data-grid",
  },
  tree: {
    headerSelector: ".tree-data-grid-header-row[data-tree-sync-header]",
    rowIndexSelector: (i) => `.tree-row-height-anim[data-sync-row-index="${i}"]`,
    gridRoot: ".tree-data-grid",
  },
};

/**
 * When left/right column pinning splits the grid into panes, keep header and body row heights aligned across panes.
 * @param {'dataGrid' | 'tree'} variant
 */
export function useGridSplitSync({ hasSplit, rowCount, variant }) {
  const gridSplitRowRef = useRef(null);

  useLayoutEffect(() => {
    if (!hasSplit) return;

    const preset = PRESETS[variant];
    if (!preset) return;

    const rootEl = gridSplitRowRef.current;
    if (!rootEl || typeof ResizeObserver === "undefined") return;

    let rafId = 0;
    const syncSplitHeights = () => {
      const headerTrs = [...rootEl.querySelectorAll(preset.headerSelector)];
      if (headerTrs.length > 1) {
        headerTrs.forEach((tr) => (tr.style.height = ""));

        const maxHeader = Math.max(0, ...headerTrs.map((tr) => tr.getBoundingClientRect().height));
        headerTrs.forEach((tr) => (tr.style.height = `${maxHeader}px`));
      }

      for (let i = 0; i < rowCount; i += 1) {
        const trs = [...rootEl.querySelectorAll(preset.rowIndexSelector(i))];
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
    rootEl.querySelectorAll(preset.gridRoot).forEach((el) => ro.observe(el));

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [hasSplit, rowCount, variant]);

  return gridSplitRowRef;
}
