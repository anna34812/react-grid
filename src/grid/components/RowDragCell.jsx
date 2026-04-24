import React from 'react';

const ROW_DRAG_MIME = 'application/x-data-grid-row-id';

export const RowDragCell = ({ rowId, onDragEnd }) => (
  <div role="gridcell" className="data-grid-cell grid-row-drag-cell" data-field="__rowDrag__" data-no-row-select>
    <button
      type="button"
      className="row-drag-handle"
      draggable
      aria-label={`Reorder row ${rowId}`}
      onDragStart={(e) => {
        e.dataTransfer.setData(ROW_DRAG_MIME, String(rowId));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={onDragEnd}
    >
      ⠿
    </button>
  </div>
);
