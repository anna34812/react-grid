import { useCallback, useMemo, useState } from "react";
import { DataGrid, DEFAULT_ROW_SELECTION } from "./grid/components/DataGrid";
import { formatBytes } from "./grid/utils/treeData";
import "./App.css";

function App() {
  const [enableFiltering, setEnableFiltering] = useState(true);
  const [selection, setSelection] = useState({ selectedIds: [], selectedRows: [] });
  const [editedState, setEditedState] = useState({ currentEditedRow: null, editedRows: [] });

  const onSelectionChange = useCallback((detail) => setSelection({ selectedIds: detail.selectedIds, selectedRows: detail.selectedRows }), []);

  const onEditedRowsChange = useCallback(({ currentEditedRow, editedRows }) => {
    console.log("onEditedRowsChange", currentEditedRow, editedRows);

    setEditedState({ currentEditedRow: currentEditedRow, editedRows: editedRows });
  }, []);

  const columns = useMemo(
    () => [
      { field: "id", label: "ID", editable: false, filterable: false, pinned: "left", minWidth: 72 },
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
      enabled: true,
      parentField: "parentId",
      rowIdField: "id",
      expandColumnField: "name",
      aggregateValueField: "sizeBytes",
      pageSize: 50,
      indentPerLevel: 14,
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
      </p>

      <DataGrid columns={columns} enableColumnReorder enableRowDrag rowSelection={{ ...DEFAULT_ROW_SELECTION, mode: "multi", checkboxes: true, enableClickSelection: false }} onSelectionChange={onSelectionChange} onEditedRowsChange={onEditedRowsChange} enableFiltering={enableFiltering} />

      <h2 style={{ marginTop: "2rem" }}>Tree data (file explorer)</h2>
      <p>
        Flat rows with <code>parentId</code>; <code>treeData</code> enables expand/collapse, depth indent, and optional <code>aggregateValueField</code> for folder totals (passed as <code>treeAggregate</code> to <code>renderCell</code>).
      </p>
      <DataGrid columns={treeColumns} treeData={treeDataConfig} enableColumnReorder rowSelection={{ ...DEFAULT_ROW_SELECTION, mode: "multi", checkboxes: true, enableClickSelection: false }} onSelectionChange={onSelectionChange} enableFiltering={enableFiltering} />

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
