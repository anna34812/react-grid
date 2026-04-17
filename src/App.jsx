import { DataGrid } from './grid/components/DataGrid'
import './App.css'

function App() {
  const columns = [
    {
      field: 'id',
      label: 'ID',
      editable: false,
      filterable: false,
      pinned: 'left',
      minWidth: 72,
    },
    {
      field: 'name',
      label: 'Name',
      editable: true,
      required: true,
      filterable: true,
      filterOperator: 'contains',
      minWidth: 160,
    },
    {
      field: 'email',
      label: 'Email',
      editable: true,
      required: true,
      filterable: true,
      filterOperator: 'contains',
      minWidth: 220,
    },
    {
      field: 'status',
      label: 'Status',
      editable: true,
      required: true,
      filterable: true,
      filterOperator: 'eq',
      minWidth: 120,
    },
    {
      field: 'score',
      label: 'Score',
      type: 'number',
      editable: true,
      filterable: true,
      filterOperator: 'gte',
      pinned: 'right',
      minWidth: 96,
    },
  ]

  return (
    <main className="app">
      <h1>React Data Grid MVP</h1>
      <p>
        Server-side pagination + sorting + inline edit + filtering (inside column headers) + column pinning:
        when any column is pinned, each pane keeps a horizontal scrollbar; with no pins, horizontal scroll appears
        only if content overflows. Shared vertical scroll (L / R in headers).
      </p>
      <DataGrid columns={columns} />
    </main>
  )
}

export default App
