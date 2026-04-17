export const getColumnMinWidth = (column) => {
  if (typeof column.width === "number") return column.width;
  if (typeof column.minWidth === "number") return column.minWidth;
  return 140;
};

/** Column resize handle + double-click auto-fit; set `resizable: false` to disable. */
export const isColumnResizable = (column) => column != null && column.resizable !== false;

export const getEffectivePin = (column, pinnedOverrides) => {
  if (Object.prototype.hasOwnProperty.call(pinnedOverrides, column.field)) return pinnedOverrides[column.field];
  return column.pinned ?? null;
};

export const getColumnSections = (columns, pinnedOverrides) => {
  const enriched = columns.map((column, originalIndex) => ({ column, originalIndex }));
  const pin = (item) => getEffectivePin(item.column, pinnedOverrides);

  const left = enriched
    .filter((item) => pin(item) === "left")
    .sort((a, b) => a.originalIndex - b.originalIndex)
    .map((item) => item.column);
  const center = enriched
    .filter((item) => !pin(item))
    .sort((a, b) => a.originalIndex - b.originalIndex)
    .map((item) => item.column);
  const right = enriched
    .filter((item) => pin(item) === "right")
    .sort((a, b) => a.originalIndex - b.originalIndex)
    .map((item) => item.column);

  return { left, center, right };
};

export const getDisplayColumns = (columns, pinnedOverrides) => {
  const { left, center, right } = getColumnSections(columns, pinnedOverrides);
  return [...left, ...center, ...right];
};
