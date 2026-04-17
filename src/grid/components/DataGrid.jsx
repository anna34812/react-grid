import { useCallback, useEffect, useMemo, useState } from "react";
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

function toIdSet(ids) {
  if (ids == null) {
    return new Set();
  }
  return new Set(Array.isArray(ids) ? ids : [...ids]);
}

/** Merged with `rowSelection` from props; spread this in the app for partial overrides. */
export const DEFAULT_ROW_SELECTION = {
  mode: "none",
  checkboxes: true,
  enableClickSelection: false,
  selectedIds: undefined,
  defaultSelectedIds: undefined,
};

function mergeRowSelection(partial) {
  const rs = { ...DEFAULT_ROW_SELECTION, ...(partial ?? {}) };
  if (rs.mode !== "none" && !rs.checkboxes && !rs.enableClickSelection) {
    rs.enableClickSelection = true;
  }
  return rs;
}

export function DataGrid({
  columns,
  rowSelection: rowSelectionProp,
  onSelectionChange,
  enableFiltering = true,
}) {
  const rs = useMemo(
    () => mergeRowSelection(rowSelectionProp),
    [rowSelectionProp],
  );
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

  const selectionEnabled = rs.mode === "single" || rs.mode === "multi";
  const showSelectColumn = selectionEnabled && rs.checkboxes;
  const enableClickSelection = selectionEnabled && rs.enableClickSelection;
  const isControlled = rs.selectedIds !== undefined;

  const [internalSelected, setInternalSelected] = useState(() =>
    toIdSet(mergeRowSelection(rowSelectionProp).defaultSelectedIds),
  );

  const {
    left: leftColumns,
    center: centerColumns,
    right: rightColumns,
  } = useMemo(
    () => getColumnSections(columns, pinnedOverrides),
    [columns, pinnedOverrides],
  );

  const hasSplit = leftColumns.length > 0 || rightColumns.length > 0;

  const selectedSet = useMemo(() => {
    if (!selectionEnabled) {
      return new Set();
    }
    if (isControlled) {
      return toIdSet(rs.selectedIds);
    }
    return internalSelected;
  }, [selectionEnabled, isControlled, rs.selectedIds, internalSelected]);

  const selectionPane = useMemo(() => {
    if (!showSelectColumn) {
      return null;
    }
    if (leftColumns.length > 0) {
      return "left";
    }
    if (centerColumns.length > 0) {
      return "center";
    }
    if (rightColumns.length > 0) {
      return "right";
    }
    return null;
  }, [
    showSelectColumn,
    leftColumns.length,
    centerColumns.length,
    rightColumns.length,
  ]);

  const pageIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allSelectedOnPage =
    pageIds.length > 0 && pageIds.every((id) => selectedSet.has(id));
  const someSelectedOnPage =
    pageIds.some((id) => selectedSet.has(id)) && !allSelectedOnPage;

  const applySelection = useCallback(
    (nextSet) => {
      if (!selectionEnabled) {
        return;
      }
      const ids = [...nextSet];
      const selectedRows = rows.filter((r) => nextSet.has(r.id));
      if (!isControlled) {
        setInternalSelected(new Set(nextSet));
      }
      onSelectionChange?.({ selectedIds: ids, selectedRows });
    },
    [selectionEnabled, rows, isControlled, onSelectionChange],
  );

  const toggleRowSelection = useCallback(
    (rowId) => {
      if (!selectionEnabled) {
        return;
      }
      const next = new Set(selectedSet);
      if (rs.mode === "single") {
        if (next.has(rowId)) {
          next.clear();
        } else {
          next.clear();
          next.add(rowId);
        }
      } else if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      applySelection(next);
    },
    [selectionEnabled, rs.mode, selectedSet, applySelection],
  );

  const toggleSelectAllPage = useCallback(() => {
    if (rs.mode !== "multi" || !rs.checkboxes) {
      return;
    }
    const next = new Set(selectedSet);
    if (allSelectedOnPage) {
      pageIds.forEach((id) => next.delete(id));
    } else {
      pageIds.forEach((id) => next.add(id));
    }
    applySelection(next);
  }, [
    rs.mode,
    rs.checkboxes,
    pageIds,
    allSelectedOnPage,
    selectedSet,
    applySelection,
  ]);

  const applySelectionForRowClick = useCallback(
    (event, rowId) => {
      if (!enableClickSelection) {
        return;
      }

      const multiClickWithoutCheckbox =
        rs.mode === "multi" && !rs.checkboxes && enableClickSelection;

      if (multiClickWithoutCheckbox) {
        const additive = event.ctrlKey || event.metaKey;
        if (additive) {
          toggleRowSelection(rowId);
        } else {
          const next = new Set(selectedSet);
          if (next.size === 1 && next.has(rowId)) {
            next.clear();
          } else {
            next.clear();
            next.add(rowId);
          }
          applySelection(next);
        }
        return;
      }

      toggleRowSelection(rowId);
    },
    [
      enableClickSelection,
      rs.mode,
      rs.checkboxes,
      selectedSet,
      applySelection,
      toggleRowSelection,
    ],
  );

  const handleRowBackgroundClick = useCallback(
    (event, rowId) => {
      if (!enableClickSelection) {
        return;
      }
      if (event.target.closest("[data-no-row-select]")) {
        return;
      }
      if (event.target.closest("[data-edit-host]")) {
        return;
      }
      if (event.target.closest("[data-editable-cell]")) {
        return;
      }
      const btn = event.target.closest("button");
      if (btn && !btn.disabled) {
        return;
      }
      if (event.target.closest("input, select, textarea, a, label")) {
        return;
      }

      applySelectionForRowClick(event, rowId);
    },
    [enableClickSelection, applySelectionForRowClick],
  );

  const setPinForField = (field, pin) => {
    setPinnedOverrides((previous) => ({
      ...previous,
      [field]: pin,
    }));
  };

  useEffect(() => {
    if (!enableFiltering) {
      setFilterDraft({});
      clearFilters();
    }
  }, [enableFiltering, clearFilters]);

  useEffect(() => {
    if (!enableFiltering) {
      return;
    }
    const debounceId = setTimeout(() => {
      Object.entries(filterDraft).forEach(([field, filter]) => {
        setFilter(field, filter.value, filter.operator);
      });
    }, 300);

    return () => {
      clearTimeout(debounceId);
    };
  }, [enableFiltering, filterDraft, setFilter]);

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
      const stopEditHostBubble = (event) => {
        event.stopPropagation();
      };
      return (
        <div
          className="edit-cell"
          data-no-row-select
          data-edit-host
          onPointerDown={stopEditHostBubble}
          onPointerUp={stopEditHostBubble}
          onClick={stopEditHostBubble}
        >
          <input
            value={draftValue}
            disabled={isSaving}
            onChange={(event) => {
              setDraftValue(event.target.value);
            }}
            onClick={stopEditHostBubble}
            onPointerDown={stopEditHostBubble}
          />
          <div className="edit-actions">
            <button
              type="button"
              disabled={isSaving}
              onClick={(e) => {
                e.stopPropagation();
                saveEdit({ rowId: row.id, field: column.field, column });
              }}
            >
              Save
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={(e) => {
                e.stopPropagation();
                cancelEdit();
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    if (!column.editable) {
      return <span className="cell-display">{String(row[column.field])}</span>;
    }

    const editableCellKey = `${row.id}:${column.field}`;

    return (
      <span
        role="button"
        tabIndex={isSaving ? -1 : 0}
        className="cell-button cell-button--editable"
        data-editable-cell={editableCellKey}
        aria-disabled={isSaving}
        onClick={(e) => {
          e.stopPropagation();
          if (!enableClickSelection || isSaving) {
            return;
          }
          if (e.detail >= 2) {
            return;
          }
          applySelectionForRowClick(
            { ctrlKey: e.ctrlKey, metaKey: e.metaKey },
            row.id,
          );
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (isSaving) {
            return;
          }
          startEdit(row.id, column.field, row[column.field]);
        }}
        onKeyDown={(e) => {
          if (isSaving) {
            return;
          }
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            startEdit(row.id, column.field, row[column.field]);
          }
        }}
      >
        {String(row[column.field])}
      </span>
    );
  };

  const columnStyle = (column) => ({
    minWidth: getColumnMinWidth(column),
  });

  const renderSectionTable = (sectionColumns, pane) => {
    if (sectionColumns.length === 0) {
      return null;
    }

    const showLeadingSelect = showSelectColumn && selectionPane === pane;

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
                {showLeadingSelect ? (
                  <th
                    className="grid-select-header"
                    style={{ width: 44, minWidth: 44 }}
                    data-field="__select__"
                  >
                    {enableFiltering ? (
                      <div className="header-stack">
                        <div className="header-cell header-cell--select">
                          {rs.mode === "multi" ? (
                            <input
                              type="checkbox"
                              aria-label="Select all rows on this page"
                              checked={allSelectedOnPage}
                              ref={(el) => {
                                if (el) {
                                  el.indeterminate = someSelectedOnPage;
                                }
                              }}
                              onChange={toggleSelectAllPage}
                            />
                          ) : null}
                        </div>
                        <div className="header-filter">
                          <span className="header-filter-spacer" aria-hidden />
                        </div>
                      </div>
                    ) : (
                      <div className="header-cell header-cell--select">
                        {rs.mode === "multi" ? (
                          <input
                            type="checkbox"
                            aria-label="Select all rows on this page"
                            checked={allSelectedOnPage}
                            ref={(el) => {
                              if (el) {
                                el.indeterminate = someSelectedOnPage;
                              }
                            }}
                            onChange={toggleSelectAllPage}
                          />
                        ) : null}
                      </div>
                    )}
                  </th>
                ) : null}
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
                      {enableFiltering ? (
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
                              {direction === "asc" && " \u2191"}
                              {direction === "desc" && " \u2193"}
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
                      ) : (
                        <div className="header-cell">
                          <button
                            type="button"
                            className="header-button"
                            onClick={() => {
                              handleSort(column.field);
                            }}
                          >
                            {column.label}
                            {direction === "asc" && " \u2191"}
                            {direction === "desc" && " \u2193"}
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
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rowSelected = selectedSet.has(row.id);
                return (
                  <tr
                    key={row.id}
                    role="row"
                    className={
                      [
                        rowSelected ? "data-grid-row--selected" : "",
                        enableClickSelection ? "data-grid-row--clickable" : "",
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                    aria-selected={selectionEnabled ? rowSelected : undefined}
                    onClick={(event) => handleRowBackgroundClick(event, row.id)}
                  >
                    {showLeadingSelect ? (
                      <td
                        className="grid-select-cell"
                        data-field="__select__"
                        data-no-row-select
                      >
                        <input
                          type="checkbox"
                          checked={rowSelected}
                          onChange={() => toggleRowSelection(row.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select row ${row.id}`}
                        />
                      </td>
                    ) : null}
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
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="grid-container">
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
