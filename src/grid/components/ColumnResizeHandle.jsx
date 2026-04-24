import React from 'react';

export const ColumnResizeHandle = ({ column, enabled, onResizeStart, onAutoFit }) => {
  if (!enabled) return null;

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${column.label}. Double-click to fit content.`}
      className="column-resize-handle"
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onResizeStart(column, e.clientX);
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onAutoFit?.(column, e);
      }}
    />
  );
};
