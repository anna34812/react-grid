import { getColumnMinWidth } from './columnPinning';

/** Tabulator-style column width behavior (per pane / section). */
export const COLUMN_SIZE_MODE = {
  /** Fixed pixel tracks from min width + resize (default). */
  FIT_DATA: 'fitData',
  /** Center pane: fixed tracks except the last unpinned column (`minmax(px, 1fr)`). Pinned panes stay `px`. */
  FIT_DATA_STRETCH_LAST: 'fitDataStretchLast',
  /** Unpinned (center) columns use `minmax(px, 1fr)` to share remaining row width; pinned left/right stay fixed `px`. */
  FIT_WIDTH: 'fitWidth',
};

function normalizeColumnSizeMode(mode) {
  if (mode === COLUMN_SIZE_MODE.FIT_WIDTH || mode === COLUMN_SIZE_MODE.FIT_DATA_STRETCH_LAST) return mode;
  return COLUMN_SIZE_MODE.FIT_DATA;
}

/**
 * `grid-template-columns` for grid panes: optional row-drag + select fixed tracks, then one track per data column.
 * - `fitData`: plain `Npx` so resizing one column does not redistribute others.
 * - `fitDataStretchLast` / `fitWidth`: flexible `1fr` tracks apply only to the **center** (unpinned) pane; left/right pinned panes stay `px`.
 * @param {{ section?: "left" | "center" | "right" }} [options] Pass the pane id from `renderSectionGrid` so pinned vs center is respected.
 */
export function buildGridTemplateColumns(sectionColumns, options = {}) {
  const { showRowDrag = false, showSelect = false, columnWidths = {}, columnSizeMode: columnSizeModeRaw, section = 'center' } = options;
  const columnSizeMode = normalizeColumnSizeMode(columnSizeModeRaw);
  const flexiblePane = section === 'center';
  const parts = [];
  if (showRowDrag) parts.push('36px');
  if (showSelect) parts.push('44px');

  const n = sectionColumns.length;
  for (let i = 0; i < n; i++) {
    const c = sectionColumns[i];
    const minW = getColumnMinWidth(c);
    const w = columnWidths[c.field] ?? minW;
    const tr = Math.max(minW, w);
    const isLast = i === n - 1;

    if (flexiblePane && columnSizeMode === COLUMN_SIZE_MODE.FIT_WIDTH) {
      parts.push(`minmax(${tr}px, 1fr)`);
    } else if (flexiblePane && columnSizeMode === COLUMN_SIZE_MODE.FIT_DATA_STRETCH_LAST && isLast) {
      parts.push(`minmax(${tr}px, 1fr)`);
    } else {
      parts.push(`${tr}px`);
    }
  }

  return parts.join(' ');
}
