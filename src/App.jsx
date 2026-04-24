import { useCallback, useMemo, useState } from 'react';
import { DEFAULT_ROW_SELECTION, COLUMN_SIZE_MODE } from './grid/components/DataGrid';
import { formatBytes } from './grid/utils/treeData';
import IXGrid from './grid/components/IXGrid';
import { mockRows } from './grid/mock/data';
import { treeFlatRows } from './grid/mock/treeData';

import './App.css';

function App() {
  const [enableFiltering, setEnableFiltering] = useState(true);
  const [columnSizeMode, setColumnSizeMode] = useState(COLUMN_SIZE_MODE.FIT_DATA);
  const [paginationMode, setPaginationMode] = useState('server');
  const [resetPaginationTrigger, setResetPaginationTrigger] = useState(0);
  const [loadingComponent, setLoadingComponent] = useState('Default');
  const [emptyComponent, setEmptyComponent] = useState('Default');

  const onSelectionChange = useCallback(({ selectedIds, selectedRows }) => console.log({ selectedIds: selectedIds, selectedRows: selectedRows }), []);
  const onEditedRowsChange = useCallback(({ currentEditedRow, editedRows }) => console.log({ currentEditedRow: currentEditedRow, editedRows: editedRows }), []);
  const fetchData = useCallback(async ({ page, pageSize }) => {
    const startRow = Math.max(0, (page - 1) * pageSize);
    const rows = mockRows.slice(startRow, startRow + pageSize);
    // return { rows, total: mockRows.length };

    const res = await fetch(`https://dummyjson.com/products?limit=${pageSize}&skip=${startRow}`);
    const json = await res.json();

    const data = startRow === 1 ? json.products.map((m) => ({ ...m, description: 'test' })) : json.products;
    return { rows: [], total: 0 };
    return { rows: data, total: json.total };
  }, []);

  // --* data grid
  const columns = useMemo(
    () => [
      { field: 'id', label: 'ID', editable: false, filterable: false, pinned: 'left', minWidth: 100 },
      { field: 'name', label: 'Name', editable: true, required: true, filterable: true, filterOperator: 'contains', minWidth: 160, movable: true },
      {
        field: 'email',
        label: 'Email',
        editable: true,
        required: true,
        filterable: true,
        filterOperator: 'contains',
        minWidth: 220,
        movable: true,
        resizable: false,
        renderEditCell: ({ value, setValue, save, cancel, isSaving }) => <input value={value} disabled={isSaving} onChange={(e) => setValue(e.target.value)} />,
      },
      {
        field: 'status',
        label: 'Status',
        editable: true,
        required: true,
        renderCell: ({ value, row, updateValue, isSaving }) => (
          <select value={value} disabled={isSaving} aria-label={`status-${row.id}`} onChange={(event) => void updateValue(event.target.value)}>
            <option value="active">active</option>
            <option value="disabled">disabled</option>
          </select>
        ),
      },
      { field: 'score', label: 'Score', type: 'number', editable: true, filterable: true, filterOperator: 'gte', minWidth: 96 },
      {
        field: 'action',
        label: 'Action',
        editable: false,
        filterable: false,
        renderCell: ({ row }) => (
          <button type="button" onClick={() => console.log(row)}>
            Action
          </button>
        ),
      },
    ],
    [],
  );

  // --* tree data
  const treeColumns = useMemo(
    () => [
      { field: 'name', label: 'File Explorer', editable: false, filterable: true, filterOperator: 'contains', minWidth: 260, movable: true },
      { field: 'created', label: 'Created', editable: false, filterable: false, minWidth: 110 },
      { field: 'modified', label: 'Modified', editable: false, filterable: false, minWidth: 110 },
      {
        field: 'sizeBytes',
        label: 'sum(Size)',
        editable: false,
        filterable: false,
        minWidth: 120,
        renderCell: ({ row, treeAggregate }) => {
          if (row.kind === 'folder') return <span className="cell-display">{formatBytes(treeAggregate ?? 0)}</span>;
          return <span className="cell-display">{formatBytes(row.sizeBytes ?? 0)}</span>;
        },
      },
    ],
    [],
  );

  const treeDataConfig = useMemo(
    () => ({
      parentField: 'parentId',
      rowIdField: 'id',
      expandColumnField: 'name',
      aggregateValueField: 'sizeBytes',
      indentPerLevel: 14,
      groupSelection: 'descendants', // self, descendants
    }),
    [],
  );

  const MyLoad = () => <div>CustomLoading...</div>;

  return (
    <main className="app">
      <h1>Data Grid</h1>
      <p className="app-options">
        <label>
          <input type="checkbox" checked={enableFiltering} onChange={(e) => setEnableFiltering(e.target.checked)} /> Show column filters
        </label>
        <label>
          Column size mode
          <select value={columnSizeMode} onChange={(e) => setColumnSizeMode(e.target.value)} aria-label="Column size mode">
            <option value={COLUMN_SIZE_MODE.FIT_DATA}>Fit to data</option>
            <option value={COLUMN_SIZE_MODE.FIT_DATA_STRETCH_LAST}>Fit to data, stretch last column</option>
            <option value={COLUMN_SIZE_MODE.FIT_WIDTH}>Fit to width</option>
          </select>
        </label>
        <label>
          Pagination
          <select value={paginationMode} onChange={(e) => setPaginationMode(e.target.value)} aria-label="Pagination mode">
            <option value="server">Server (pages)</option>
            <option value="infinite">Server (infinite scroll)</option>
            <option value="client">Client</option>
            <option value="none">None</option>
          </select>
        </label>
        <label>
          Loading Component
          <select value={loadingComponent} onChange={(e) => setLoadingComponent(e.target.value)} aria-label="Loading component">
            <option value="MyLoad">MyLoad</option>
            <option value="Default">Default</option>
          </select>
        </label>
        <label>
          Empty Component
          <select value={emptyComponent} onChange={(e) => setEmptyComponent(e.target.value)} aria-label="Empty component">
            <option value="MyEmpty">MyEmpty</option>
            <option value="Default">Default</option>
          </select>
        </label>
        <button type="button" onClick={() => setResetPaginationTrigger((v) => v + 1)}>
          Reset pagination
        </button>
      </p>

      <IXGrid
        columns={columns}
        dataSource={paginationMode === 'client' || paginationMode === 'none' ? mockRows : undefined} // client or none
        fetchData={paginationMode === 'server' || paginationMode === 'infinite' ? fetchData : undefined} // server or infinite
        paginationMode={paginationMode}
        // resetPaginationOptions={{ page: 1 }}
        resetPaginationTrigger={resetPaginationTrigger}
        // selection
        rowSelection={{ ...DEFAULT_ROW_SELECTION, mode: 'multi', checkboxes: true, enableClickSelection: false }}
        onSelectionChange={onSelectionChange}
        //
        columnSizeMode={columnSizeMode}
        enableColumnReorder
        enableRowDrag
        onEditedRowsChange={onEditedRowsChange}
        enableFiltering={enableFiltering}
        LoadingComponent={loadingComponent === 'MyLoad' ? MyLoad : undefined}
      />

      <h2 style={{ marginTop: '2rem' }}>Tree Data</h2>
      <IXGrid treeData={{ config: treeDataConfig }} dataSource={treeFlatRows} columnSizeMode={columnSizeMode} paginationMode={paginationMode} columns={treeColumns} enableColumnReorder enableRowDrag rowSelection={{ ...DEFAULT_ROW_SELECTION, mode: 'multi', checkboxes: true, enableClickSelection: false }} onSelectionChange={onSelectionChange} onEditedRowsChange={onEditedRowsChange} enableFiltering={enableFiltering} />
    </main>
  );
}

export default App;
