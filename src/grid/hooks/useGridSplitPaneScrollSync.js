import { useEffect } from 'react';

/**
 * Pinned split: show a single vertical scrollbar on the center pane only.
 * Side panes keep overflow-y hidden but stay aligned via scrollTop; wheel over pinned columns scrolls the center.
 */
export function useGridSplitPaneScrollSync(gridSplitRowRef, hasSplit, rowCount) {
  useEffect(() => {
    if (!hasSplit) return;
    const rowEl = gridSplitRowRef.current;
    if (!rowEl) return;

    const center = rowEl.querySelector('.grid-pane--center .grid-pane-scroll');
    const peers = [...rowEl.querySelectorAll('.grid-pane:not(.grid-pane--center) .grid-pane-scroll')];
    if (!center || peers.length === 0) return;

    let locked = false;
    const syncPeersFromCenter = () => {
      if (locked) return;
      locked = true;
      const top = center.scrollTop;
      for (const p of peers) {
        if (p.scrollTop !== top) p.scrollTop = top;
      }
      locked = false;
    };

    center.addEventListener('scroll', syncPeersFromCenter, { passive: true });

    const onWheelSides = (e) => {
      e.preventDefault();
      center.scrollTop += e.deltaY;
    };
    for (const p of peers) {
      p.addEventListener('wheel', onWheelSides, { passive: false });
    }

    return () => {
      center.removeEventListener('scroll', syncPeersFromCenter);
      for (const p of peers) {
        p.removeEventListener('wheel', onWheelSides);
      }
    };
  }, [gridSplitRowRef, hasSplit, rowCount]);
}
