import { getColumnMinWidth } from "./columnPinning";

/**
 * `grid-template-columns` for grid panes: optional row-drag + select fixed tracks, then one fixed `px` track per column.
 * Using plain `Npx` (not `1fr`) so resizing one column does not redistribute width across other columns.
 * Used by DataGrid and TreeDataGrid for aligned split panes.
 */
export function buildGridTemplateColumns(sectionColumns, options = {}) {
  const { showRowDrag = false, showSelect = false, columnWidths = {} } = options;
  const parts = [];
  if (showRowDrag) parts.push("36px");
  if (showSelect) parts.push("44px");
  for (const c of sectionColumns) {
    const minW = getColumnMinWidth(c);
    const w = columnWidths[c.field] ?? minW;
    const tr = Math.max(minW, w);
    parts.push(`${tr}px`);
  }
  return parts.join(" ");
}
