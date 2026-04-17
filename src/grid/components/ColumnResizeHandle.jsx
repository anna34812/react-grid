/**
 * Thin vertical grip on the right edge of a header cell for column width drag.
 * Double-click fits width to visible cell content (same grid root).
 */
export function ColumnResizeHandle({ column, enabled, onResizeStart, onAutoFit }) {
  if (!enabled) return null;

  return (
    <span
      role='separator'
      aria-orientation='vertical'
      aria-label={`Resize ${column.label}. Double-click to fit content.`}
      className='column-resize-handle'
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
}
