/**
 * Merge a previous field order with the current column definitions: keep known order,
 * drop removed fields, append new fields in definition order.
 */
export const mergeColumnOrder = (prevOrder, columns) => {
  const fields = columns.map((c) => c.field);
  const fieldSet = new Set(fields);
  let base = (prevOrder ?? []).filter((f) => fieldSet.has(f));
  if (base.length === 0) {
    base = [...fields];
  } else {
    for (const f of fields) {
      if (!base.includes(f)) base.push(f);
    }
  }
  return base;
};

/** Move `fromField` to the index of `toField` in the order array. */
export const reorderFields = (order, fromField, toField) => {
  const from = order.indexOf(fromField);
  const to = order.indexOf(toField);
  if (from === -1 || to === -1 || from === to) return order;

  const next = [...order];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
};
