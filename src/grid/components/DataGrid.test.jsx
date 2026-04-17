import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DataGrid } from './DataGrid'
import { resetDataStore } from '../mock/server'

const columns = [
  { field: 'id', label: 'ID', editable: false, filterable: false },
  {
    field: 'name',
    label: 'Name',
    editable: true,
    required: true,
    filterable: true,
    filterOperator: 'contains',
  },
  {
    field: 'status',
    label: 'Status',
    editable: true,
    required: true,
    filterable: true,
    filterOperator: 'eq',
  },
]

describe('DataGrid', () => {
  beforeEach(() => {
    resetDataStore()
  })

  it('loads rows and supports pagination', async () => {
    render(<DataGrid columns={columns} />)
    expect(await screen.findByText('User 1')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('User 21')).toBeInTheDocument()
  })

  it('sorts by name column', async () => {
    const { container } = render(<DataGrid columns={columns} />)
    await screen.findByText('User 1')

    const nameSortButton = container.querySelector('th[data-field="name"] .header-button')
    await userEvent.click(nameSortButton)
    await userEvent.click(nameSortButton)

    expect(await screen.findByText('User 999')).toBeInTheDocument()
  })

  it('edits a cell value inline', async () => {
    render(<DataGrid columns={columns} />)
    const originalCell = await screen.findByRole('button', { name: 'User 1' })
    await userEvent.dblClick(originalCell)

    const input = screen.getByDisplayValue('User 1')
    await userEvent.clear(input)
    await userEvent.type(input, 'Updated User')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('button', { name: 'Updated User' })).toBeInTheDocument()
  })

  it('filters by exact status', async () => {
    render(<DataGrid columns={columns} />)
    await screen.findByText('User 1')

    const statusFilter = screen.getByPlaceholderText('Filter Status')
    await userEvent.type(statusFilter, 'disabled')

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'active' })).not.toBeInTheDocument()
    })
  })

  it('hides filter inputs when enableFiltering is false', async () => {
    render(<DataGrid columns={columns} enableFiltering={false} />)
    await screen.findByText('User 1')
    expect(screen.queryByPlaceholderText('Filter Status')).not.toBeInTheDocument()
  })

  it('moves left-pinned columns ahead of earlier unpinned columns', async () => {
    const pinnedColumns = [
      {
        field: 'name',
        label: 'Name',
        editable: true,
        required: true,
        filterable: true,
        filterOperator: 'contains',
      },
      {
        field: 'id',
        label: 'ID',
        editable: false,
        filterable: false,
        pinned: 'left',
      },
      {
        field: 'status',
        label: 'Status',
        editable: true,
        required: true,
        filterable: true,
        filterOperator: 'eq',
      },
    ]

    const { container } = render(<DataGrid columns={pinnedColumns} />)
    await screen.findByText('User 1')

    const headerFields = [...container.querySelectorAll('thead tr:first-child th')].map((cell) =>
      cell.getAttribute('data-field'),
    )

    expect(headerFields[0]).toBe('id')
    expect(headerFields[1]).toBe('name')
  })

  it('pins a column to the right from the header control', async () => {
    const { container } = render(<DataGrid columns={columns} />)
    await screen.findByText('User 1')

    await userEvent.click(screen.getByRole('button', { name: 'Pin ID right' }))

    const headerFields = [...container.querySelectorAll('thead tr:first-child th')].map((cell) =>
      cell.getAttribute('data-field'),
    )

    expect(headerFields.at(-1)).toBe('id')
  })

  it('supports multi selection and reports selected rows', async () => {
    const onSelectionChange = vi.fn()
    render(
      <DataGrid
        columns={columns}
        rowSelection={{
          mode: 'multi',
          checkboxes: true,
          enableClickSelection: false,
        }}
        onSelectionChange={onSelectionChange}
      />,
    )
    await screen.findByText('User 1')

    const rowChecks = screen.getAllByRole('checkbox', { name: /^Select row / })
    expect(rowChecks.length).toBeGreaterThan(1)
    await userEvent.click(rowChecks[0])
    await userEvent.click(rowChecks[1])

    const last = onSelectionChange.mock.calls.at(-1)[0]
    expect(last.selectedIds).toEqual([1, 2])
    expect(last.selectedRows.map((r) => r.id)).toEqual([1, 2])
  })

  it('single selection keeps one row at a time', async () => {
    const onSelectionChange = vi.fn()
    render(
      <DataGrid
        columns={columns}
        rowSelection={{
          mode: 'single',
          checkboxes: true,
        }}
        onSelectionChange={onSelectionChange}
      />,
    )
    await screen.findByText('User 1')

    const rowChecks = screen.getAllByRole('checkbox', { name: /^Select row / })
    await userEvent.click(rowChecks[0])
    await userEvent.click(rowChecks[1])

    const last = onSelectionChange.mock.calls.at(-1)[0]
    expect(last.selectedIds).toEqual([2])
  })

  it('hides the select column when checkboxes is false; plain click replaces selection, Ctrl+click adds', async () => {
    const onSelectionChange = vi.fn()
    const { container } = render(
      <DataGrid
        columns={columns}
        rowSelection={{
          mode: 'multi',
          checkboxes: false,
          enableClickSelection: true,
        }}
        onSelectionChange={onSelectionChange}
      />,
    )
    await screen.findByText('User 1')
    expect(container.querySelector('[data-field="__select__"]')).toBeNull()

    const row1Id = container.querySelector(
      'tbody tr td[data-field="id"] .cell-display',
    )
    const row2Id = container.querySelector(
      'tbody tr:nth-child(2) td[data-field="id"] .cell-display',
    )

    await userEvent.click(row1Id)
    expect(onSelectionChange.mock.calls.at(-1)[0].selectedIds).toEqual([1])

    await userEvent.click(row2Id)
    expect(onSelectionChange.mock.calls.at(-1)[0].selectedIds).toEqual([2])

    await userEvent.click(row1Id)
    fireEvent.click(row2Id, { ctrlKey: true, bubbles: true })
    expect(onSelectionChange.mock.calls.at(-1)[0].selectedIds).toEqual([1, 2])
  })
})
