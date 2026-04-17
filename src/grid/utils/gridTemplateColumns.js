import { getColumnMinWidth } from "./columnPinning";

/**
 * `grid-template-columns` for grid panes: optional row-drag + select fixed tracks, then `minmax` per column.
 * Used by DataGrid and TreeDataGrid for aligned split panes.
 */
export function buildGridTemplateColumns(sectionColumns, options = {}) {
  const { showRowDrag = false, showSelect = false } = options;
  const parts = [];
  if (showRowDrag) parts.push("36px");
  if (showSelect) parts.push("44px");
  for (const c of sectionColumns) {
    parts.push(`minmax(${getColumnMinWidth(c)}px, 1fr)`);
  }
  return parts.join(" ");
}
