import { useEffect, useMemo, useState } from "react";
import { useGridQuery } from "../hooks/useGridQuery";
import { useGridData } from "../hooks/useGridData";
import { useInlineEdit } from "../hooks/useInlineEdit";
import {
  getColumnMinWidth,
  getColumnSections,
  getEffectivePin,
} from "../utils/columnPinning";

function nextSortDirection(currentField, currentDirection, field) {
  if (currentField !== field) {
    return "asc";
  }

  if (currentDirection === "asc") {
    return "desc";
  }

  if (currentDirection === "desc") {
    return null;
  }

  return "asc";
}

export function DataGrid({ columns }) {
  const {
    queryState,
    totalPages,
    setPage,
    setPageSize,
    setSort,
    setFilter,
    clearFilters,
    setTotalCount,
  } = useGridQuery();
  const { rows, loading, error, setRows } = useGridData(
    queryState,
    setTotalCount,
  );
  const {
    editingCell,
    draftValue,
    savingCell,
    editError,
    setDraftValue,
    startEdit,
    cancelEdit,
    saveEdit,
  } = useInlineEdit(setRows);
  const [filterDraft, setFilterDraft] = useState({});
  const [pinnedOverrides, setPinnedOverrides] = useState({});

  const {
    left: leftColumns,
    center: centerColumns,
    right: rightColumns,
  } = useMemo(
    () => getColumnSections(columns, pinnedOverrides),
    [columns, pinnedOverrides],
  );

  const hasSplit = leftColumns.length > 0 || rightColumns.length > 0;

  const setPinForField = (field, pin) => {
    setPinnedOverrides((previous) => ({
      ...previous,
      [field]: pin,
    }));
  };

  useEffect(() => {
    const debounceId = setTimeout(() => {
      Object.entries(filterDraft).forEach(([field, filter]) => {
        setFilter(field, filter.value, filter.operator);
      });
    }, 300);

    return () => {
      clearTimeout(debounceId);
    };
  }, [filterDraft, setFilter]);

  const pageFrom = (queryState.page - 1) * queryState.pageSize + 1;
  const pageTo = Math.min(
    queryState.page * queryState.pageSize,
    queryState.totalCount || 0,
  );
  const hasRows = rows.length > 0;

  const pageSizeOptions = useMemo(() => [10, 20, 50, 100], []);

  const handleSort = (field) => {
    const direction = nextSortDirection(
      queryState.sortField,
      queryState.sortDirection,
      field,
    );

    if (!direction) {
      setSort(null, null);
      return;
    }

    setSort(field, direction);
  };

  const renderCell = (row, column) => {
    const isEditing =
      editingCell?.rowId === row.id && editingCell?.field === column.field;
    const isSaving =
      savingCell?.rowId === row.id && savingCell?.field === column.field;

    if (isEditing) {
      return (
        <div className="edit-cell">
          <input
            value={draftValue}
            disabled={isSaving}
            onChange={(event) => {
              setDraftValue(event.target.value);
            }}
          />
          <div className="edit-actions">
            <button
              disabled={isSaving}
              onClick={() => {
                saveEdit({ rowId: row.id, field: column.field, column });
              }}
            >
              Save
            </button>
            <button disabled={isSaving} onClick={cancelEdit}>
              Cancel
            </button>
          </div>
        </div>
      );
    }

    return (
      <button
        className="cell-button"
        disabled={!column.editable || isSaving}
        onClick={() => {
          if (column.editable) {
            startEdit(row.id, column.field, row[column.field]);
          }
        }}
      >
        {String(row[column.field])}
      </button>
    );
  };

  const columnStyle = (column) => ({
    minWidth: getColumnMinWidth(column),
  });

  const renderSectionTable = (sectionColumns, pane) => {
    if (sectionColumns.length === 0) {
      return null;
    }

    return (
      <div className={`grid-pane grid-pane--${pane}`} data-pane={pane}>
        <div
          className={
            hasSplit
              ? "grid-pane-scroll grid-pane-scroll--pinned"
              : "grid-pane-scroll"
          }
          data-hscroll={hasSplit ? "always" : "auto"}
        >
          <table className="data-grid-table">
            <thead>
              <tr>
                {sectionColumns.map((column) => {
                  const isSorted = queryState.sortField === column.field;
                  const direction = isSorted ? queryState.sortDirection : null;
                  const pin = getEffectivePin(column, pinnedOverrides);
                  return (
                    <th
                      key={column.field}
                      style={columnStyle(column)}
                      data-field={column.field}
                      data-pinned={pin ?? undefined}
                    >
                      <div className="header-stack">
                        <div className="header-cell">
                          <button
                            type="button"
                            className="header-button"
                            onClick={() => {
                              handleSort(column.field);
                            }}
                          >
                            {column.label}
                            {direction === "asc" && " ↑"}
                            {direction === "desc" && " ↓"}
                          </button>
                          <div
                            className="pin-actions"
                            role="group"
                            aria-label={`${column.label} pinning`}
                          >
                            <button
                              type="button"
                              className={`pin-button${pin === "left" ? " active" : ""}`}
                              aria-pressed={pin === "left"}
                              aria-label={`Pin ${column.label} left`}
                              onClick={() => {
                                setPinForField(
                                  column.field,
                                  pin === "left" ? null : "left",
                                );
                              }}
                            >
                              L
                            </button>
                            <button
                              type="button"
                              className={`pin-button${pin === "right" ? " active" : ""}`}
                              aria-pressed={pin === "right"}
                              aria-label={`Pin ${column.label} right`}
                              onClick={() => {
                                setPinForField(
                                  column.field,
                                  pin === "right" ? null : "right",
                                );
                              }}
                            >
                              R
                            </button>
                          </div>
                        </div>
                        <div className="header-filter">
                          {column.filterable ? (
                            <input
                              className="header-filter-input"
                              placeholder={`Filter ${column.label}`}
                              value={filterDraft[column.field]?.value ?? ""}
                              onChange={(event) => {
                                const value = event.target.value;
                                setFilterDraft((previous) => ({
                                  ...previous,
                                  [column.field]: {
                                    value,
                                    operator:
                                      column.filterOperator || "contains",
                                  },
                                }));
                              }}
                            />
                          ) : (
                            <span
                              className="header-filter-spacer"
                              aria-hidden
                            />
                          )}
                        </div>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {sectionColumns.map((column) => (
                    <td
                      key={`${row.id}-${column.field}`}
                      style={columnStyle(column)}
                      data-field={column.field}
                      data-pinned={
                        getEffectivePin(column, pinnedOverrides) ?? undefined
                      }
                    >
                      {renderCell(row, column)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="grid-container">
      {/* <div className="grid-toolbar">
        <button
          onClick={() => {
            setFilterDraft({});
            clearFilters();
          }}
        >
          Reset filters
        </button>
      </div> */}

      {loading && <p className="status">Loading rows...</p>}
      {error && <p className="status error">{error}</p>}
      {editError && <p className="status error">{editError}</p>}
      {!loading && !hasRows && <p className="status">No rows found.</p>}

      <div
        className={`grid-split-root${hasSplit ? " grid-split-root--split" : ""}`}
      >
        <div className="grid-split-row">
          {renderSectionTable(leftColumns, "left")}
          {renderSectionTable(centerColumns, "center")}
          {renderSectionTable(rightColumns, "right")}
        </div>
      </div>

      <div className="pagination">
        <div className="grid-toolbar">
          <label>
            Page size
            <select
              value={queryState.pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
              }}
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          disabled={queryState.page <= 1}
          onClick={() => {
            setPage(queryState.page - 1);
          }}
        >
          Prev
        </button>
        <span>
          Page {queryState.page} / {Math.max(totalPages, 1)}
        </span>
        <button
          disabled={queryState.page >= totalPages}
          onClick={() => {
            setPage(queryState.page + 1);
          }}
        >
          Next
        </button>
        <span>
          Showing {hasRows ? pageFrom : 0}-{hasRows ? pageTo : 0} of{" "}
          {queryState.totalCount || 0}
        </span>
      </div>
    </div>
  );
}
