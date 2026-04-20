import { useEffect } from 'react';

/**
 * Pinned split: show a single vertical scrollbar on one master pane.
 * Prefer right pane (so the bar is on the far-right edge), fallback to center.
 * Other panes keep overflow-y hidden but stay aligned via scrollTop.
 */
export function useGridSplitPaneScrollSync(gridSplitRowRef, hasSplit, rowCount, syncKey = '') {
  useEffect(() => {
    if (!hasSplit) return;
    const rowEl = gridSplitRowRef.current;
    if (!rowEl) return;

    const master =
      rowEl.querySelector('.grid-pane-body-scroll.grid-pane-scroll--y-master') ??
      rowEl.querySelector('.grid-pane--center .grid-pane-body-scroll') ??
      rowEl.querySelector('.grid-pane-scroll.grid-pane-scroll--y-master') ??
      rowEl.querySelector('.grid-pane--center .grid-pane-scroll');
    const allScrollPanes = [...rowEl.querySelectorAll('.grid-pane .grid-pane-body-scroll')];
    const effectiveScrollPanes = allScrollPanes.length > 0 ? allScrollPanes : [...rowEl.querySelectorAll('.grid-pane .grid-pane-scroll')];
    if (!master || effectiveScrollPanes.length <= 1) return;
    const peers = effectiveScrollPanes.filter((pane) => pane !== master);

    let locked = false;
    const syncAllFrom = (source) => {
      if (locked) return;
      locked = true;
      const top = source.scrollTop;
      for (const pane of effectiveScrollPanes) {
        if (pane === source) continue;
        if (pane.scrollTop !== top) pane.scrollTop = top;
      }
      locked = false;
    };

    const onScrollByPane = new Map();
    for (const pane of effectiveScrollPanes) {
      const onScroll = () => syncAllFrom(pane);
      onScrollByPane.set(pane, onScroll);
      pane.addEventListener('scroll', onScroll, { passive: true });
    }

    const onWheelPeers = (e) => {
      e.preventDefault();
      master.scrollTop += e.deltaY;
    };
    for (const p of peers) {
      p.addEventListener('wheel', onWheelPeers, { passive: false });
    }

    syncAllFrom(master);

    return () => {
      for (const pane of effectiveScrollPanes) {
        const onScroll = onScrollByPane.get(pane);
        if (onScroll) pane.removeEventListener('scroll', onScroll);
      }
      for (const p of peers) p.removeEventListener('wheel', onWheelPeers);
    };
  }, [gridSplitRowRef, hasSplit, rowCount, syncKey]);
}
