import { useCallback, useState } from "react";
import { DataGrid, DEFAULT_ROW_SELECTION } from "./grid/components/DataGrid";
import "./App.css";

function App() {
  const [enableFiltering, setEnableFiltering] = useState(true);
  const [selection, setSelection] = useState({
    selectedIds: [],
    selectedRows: [],
  });

  const onSelectionChange = useCallback((detail) => {
    setSelection({
      selectedIds: detail.selectedIds,
      selectedRows: detail.selectedRows,
    });
  }, []);

  const columns = [
    {
      field: "id",
      label: "ID",
      editable: false,
      filterable: false,
      pinned: "left",
      minWidth: 72,
    },
    {
      field: "name",
      label: "Name",
      editable: true,
      required: true,
      filterable: true,
      filterOperator: "contains",
      minWidth: 160,
    },
    {
      field: "email",
      label: "Email",
      editable: true,
      required: true,
      filterable: true,
      filterOperator: "contains",
      minWidth: 220,
    },
    {
      field: "status",
      label: "Status",
      editable: true,
      required: true,
      filterable: true,
      filterOperator: "eq",
      minWidth: 120,
    },
    {
      field: "score",
      label: "Score",
      type: "number",
      editable: true,
      filterable: true,
      filterOperator: "gte",
      pinned: "right",
      minWidth: 96,
    },
  ];

  return (
    <main className="app">
      <h1>React Data Grid MVP</h1>
      <p>
        Row selection: <code>rowSelection</code> (
        <code>DEFAULT_ROW_SELECTION</code> + overrides) and a separate{" "}
        <code>onSelectionChange</code> prop. Column filters:{" "}
        <code>enableFiltering</code>.
      </p>
      <p className="app-options">
        <label>
          <input
            type="checkbox"
            checked={enableFiltering}
            onChange={(e) => setEnableFiltering(e.target.checked)}
          />{" "}
          Show column filters
        </label>
      </p>
      <DataGrid
        columns={columns}
        rowSelection={{
          ...DEFAULT_ROW_SELECTION,
          mode: "multi",
          checkboxes: true,
          enableClickSelection: true,
        }}
        onSelectionChange={onSelectionChange}
        enableFiltering={enableFiltering}
      />
      <p className="selection-summary">
        Selected:{" "}
        {selection.selectedIds.length > 0
          ? selection.selectedIds.join(", ")
          : "none"}
        {selection.selectedRows.length > 0 && (
          <span> ({selection.selectedRows.map((r) => r.name).join(", ")})</span>
        )}
      </p>
    </main>
  );
}

export default App;
