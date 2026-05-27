/** Base defaults merged inside the grid via `mergeRowSelection`. Override with the `rowSelection` prop only. */
export const DEFAULT_ROW_SELECTION = { mode: 'none', checkboxes: true, enableClickSelection: false, selectedIds: undefined, defaultSelectedIds: undefined };

export const mergeRowSelection = (partial) => {
  const rs = { ...DEFAULT_ROW_SELECTION, ...(partial ?? {}) };
  if (rs.mode !== 'none' && !rs.checkboxes && !rs.enableClickSelection) rs.enableClickSelection = true;
  return rs;
};

export const toIdSet = (ids) => {
  if (ids == null) return new Set();
  return new Set(Array.isArray(ids) ? ids : [...ids]);
};
