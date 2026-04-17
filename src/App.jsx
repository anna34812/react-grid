import { useCallback, useMemo, useState } from "react";
import { DataGrid, DEFAULT_ROW_SELECTION, COLUMN_SIZE_MODE } from "./grid/components/DataGrid";
import { TreeDataGrid } from "./grid/components/TreeDataGrid";
import { formatBytes } from "./grid/utils/treeData";
import "./App.css";

function App() {
  const [enableFiltering, setEnableFiltering] = useState(true);
  const [columnSizeMode, setColumnSizeMode] = useState(COLUMN_SIZE_MODE.FIT_DATA);
  const [selection, setSelection] = useState({ selectedIds: [], selectedRows: [] });
  const [editedState, setEditedState] = useState({ currentEditedRow: null, editedRows: [] });

  const onSelectionChange = useCallback((detail) => setSelection({ selectedIds: detail.selectedIds, selectedRows: detail.selectedRows }), []);

  const onEditedRowsChange = useCallback(({ currentEditedRow, editedRows }) => {
    console.log("onEditedRowsChange", currentEditedRow, editedRows);

    setEditedState({ currentEditedRow: currentEditedRow, editedRows: editedRows });
  }, []);

  const columns = useMemo(
    () => [
      { field: "id", label: "ID", editable: false, filterable: false, pinned: "left", minWidth: 100 },
      { field: "name", label: "Name", editable: true, required: true, filterable: true, filterOperator: "contains", minWidth: 160, movable: true },
      {
        field: "email",
        label: "Email",
        editable: true,
        required: true,
        filterable: true,
        filterOperator: "contains",
        minWidth: 220,
        movable: true,
        resizable: false,
        renderEditCell: ({ value, setValue, save, cancel, isSaving }) => <input value={value} disabled={isSaving} onChange={(e) => setValue(e.target.value)} />,
      },
      {
        field: "status",
        label: "Status",
        editable: true,
        required: true,
        renderCell: ({ value, row, updateValue, isSaving }) => (
          <select value={value} disabled={isSaving} aria-label={`status-${row.id}`} onChange={(event) => void updateValue(event.target.value)}>
            <option value='active'>active</option>
            <option value='disabled'>disabled</option>
          </select>
        ),
      },
      { field: "score", label: "Score", type: "number", editable: true, filterable: true, filterOperator: "gte", minWidth: 96 },
      {
        field: "action",
        label: "Action",
        editable: false,
        filterable: false,
        renderCell: ({ row }) => (
          <button type='button' onClick={() => console.log(row)}>
            Action
          </button>
        ),
      },
    ],
    [],
  );

  const treeColumns = useMemo(
    () => [
      { field: "name", label: "File Explorer", editable: false, filterable: true, filterOperator: "contains", minWidth: 260, movable: true },
      { field: "created", label: "Created", editable: false, filterable: false, minWidth: 110 },
      { field: "modified", label: "Modified", editable: false, filterable: false, minWidth: 110 },
      {
        field: "sizeBytes",
        label: "sum(Size)",
        editable: false,
        filterable: false,
        minWidth: 120,
        renderCell: ({ row, treeAggregate }) => {
          if (row.kind === "folder") return <span className='cell-display'>{formatBytes(treeAggregate ?? 0)}</span>;
          return <span className='cell-display'>{formatBytes(row.sizeBytes ?? 0)}</span>;
        },
      },
    ],
    [],
  );

  const treeDataConfig = useMemo(
    () => ({
      parentField: "parentId",
      rowIdField: "id",
      expandColumnField: "name",
      aggregateValueField: "sizeBytes",
      indentPerLevel: 14,
      groupSelection: "descendants", // self, descendants
    }),
    [],
  );

  return (
    <main className='app'>
      <h1>React Data Grid MVP</h1>
      <p>
        Row selection: <code>rowSelection</code> (<code>DEFAULT_ROW_SELECTION</code> + overrides) and a separate <code>onSelectionChange</code> prop. Column filters: <code>enableFiltering</code>. Column reorder: <code>movable: true</code> — drag the title row (sort label); otherwise use the ⠿ handle (
        <code>enableColumnReorder</code>).
      </p>
      <p className='app-options'>
        <label>
          <input type='checkbox' checked={enableFiltering} onChange={(e) => setEnableFiltering(e.target.checked)} /> Show column filters
        </label>
        <label>
          Column size mode:{" "}
          <select value={columnSizeMode} onChange={(e) => setColumnSizeMode(e.target.value)} aria-label='Column size mode'>
            <option value={COLUMN_SIZE_MODE.FIT_DATA}>Fit to data</option>
            <option value={COLUMN_SIZE_MODE.FIT_DATA_STRETCH_LAST}>Fit to data, stretch last column</option>
            <option value={COLUMN_SIZE_MODE.FIT_WIDTH}>Fit to width</option>
          </select>
        </label>
      </p>

      <DataGrid
        columnSizeMode={columnSizeMode}
        // paginationMode='none' // default: server, client, none
        columns={columns}
        enableColumnReorder
        enableRowDrag
        rowSelection={{ ...DEFAULT_ROW_SELECTION, mode: "multi", checkboxes: true, enableClickSelection: false }}
        onSelectionChange={onSelectionChange}
        onEditedRowsChange={onEditedRowsChange}
        enableFiltering={enableFiltering}
      />

      <h2 style={{ marginTop: "2rem" }}>Tree data (file explorer)</h2>
      <p>
        <code>TreeDataGrid</code> uses a div-based <code>role=&quot;grid&quot;</code> body for tree rows. Flat data with <code>parentId</code>; <code>treeData</code> sets expand/collapse, indent, and optional <code>aggregateValueField</code> (as <code>treeAggregate</code> in <code>renderCell</code>).
      </p>
      <TreeDataGrid columns={treeColumns} treeData={treeDataConfig} enableColumnReorder rowSelection={{ ...DEFAULT_ROW_SELECTION, mode: "multi", checkboxes: true, enableClickSelection: false }} onSelectionChange={onSelectionChange} enableFiltering={enableFiltering} />

      <p className='selection-summary'>
        Selected: {selection.selectedIds.length > 0 ? selection.selectedIds.join(", ") : "none"}
        {selection.selectedRows.length > 0 && <span> ({selection.selectedRows.map((r) => r.name).join(", ")})</span>}
      </p>
      <p className='selection-summary'>
        Last edited row: {editedState.currentEditedRow ? editedState.currentEditedRow.id : "none"} / Edited rows total: {editedState.editedRows.length}
      </p>
    </main>
  );
}

export default App;
