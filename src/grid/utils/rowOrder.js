/**
 * Reorder rows by moving the row with `sourceId` to the index of the row with `targetId`.
 */
export const reorderRowsById = (rows, sourceId, targetId) => {
  const from = rows.findIndex((r) => r.id == sourceId);
  const to = rows.findIndex((r) => r.id == targetId);
  if (from < 0 || to < 0 || from === to) return rows;

  const next = [...rows];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
};
