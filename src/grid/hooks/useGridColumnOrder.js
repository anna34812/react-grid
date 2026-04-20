import { useCallback, useEffect, useMemo, useState } from 'react';
import { mergeColumnOrder, reorderFields } from '../utils/columnOrder';

/**
 * Column display order, pinning overrides, and column drag-reorder handlers (AG-style movable headers).
 */
export function useGridColumnOrder({ columns, columnOrder: columnOrderProp, onColumnOrderChange, enableColumnReorder = false }) {
  const [pinnedOverrides, setPinnedOverrides] = useState({});
  const isControlledColumnOrder = columnOrderProp !== undefined;
  const [internalColumnOrder, setInternalColumnOrder] = useState(() => mergeColumnOrder(undefined, columns));
  const [dragOverField, setDragOverField] = useState(null);

  useEffect(() => {
    if (!isControlledColumnOrder) {
      setInternalColumnOrder((prev) => mergeColumnOrder(prev, columns));
    }
  }, [columns, isControlledColumnOrder]);

  const displayOrder = useMemo(() => mergeColumnOrder(isControlledColumnOrder ? columnOrderProp : internalColumnOrder, columns), [isControlledColumnOrder, columnOrderProp, internalColumnOrder, columns]);

  const orderedColumns = useMemo(() => {
    const byField = Object.fromEntries(columns.map((c) => [c.field, c]));
    return displayOrder.map((f) => byField[f]).filter(Boolean);
  }, [columns, displayOrder]);

  const commitColumnOrder = useCallback(
    (next) => {
      onColumnOrderChange?.(next);
      if (!isControlledColumnOrder) setInternalColumnOrder(next);
    },
    [onColumnOrderChange, isControlledColumnOrder],
  );

  const handleColumnDrop = useCallback(
    (event, targetField) => {
      if (!enableColumnReorder) return;
      event.preventDefault();
      event.stopPropagation();
      setDragOverField(null);

      const sourceField = event.dataTransfer.getData('application/x-data-grid-field');
      if (!sourceField || sourceField === targetField) return;

      const next = reorderFields(displayOrder, sourceField, targetField);
      commitColumnOrder(next);
    },
    [enableColumnReorder, displayOrder, commitColumnOrder],
  );

  const handleColumnHeaderDragStart = useCallback(
    (event, column) => {
      if (!enableColumnReorder || column.movable !== true) return;
      if (event.target.closest('input, select, textarea, .header-filter, .pin-actions')) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.setData('application/x-data-grid-field', column.field);
      event.dataTransfer.effectAllowed = 'move';
    },
    [enableColumnReorder],
  );

  const setPinForField = useCallback((field, pin) => setPinnedOverrides((previous) => ({ ...previous, [field]: pin })), []);

  return {
    orderedColumns,
    displayOrder,
    pinnedOverrides,
    dragOverField,
    setDragOverField,
    handleColumnDrop,
    handleColumnHeaderDragStart,
    setPinForField,
  };
}
