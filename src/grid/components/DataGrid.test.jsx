import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataGrid } from "./DataGrid";
import { resetDataStore } from "../mock/server";

const columns = [
  { field: "id", label: "ID", editable: false, filterable: false },
  {
    field: "name",
    label: "Name",
    editable: true,
    required: true,
    filterable: true,
    filterOperator: "contains",
  },
  {
    field: "status",
    label: "Status",
    editable: true,
    required: true,
    filterable: true,
    filterOperator: "eq",
  },
];

describe("DataGrid", () => {
  beforeEach(() => {
    resetDataStore();
  });

  it("loads rows and supports pagination", async () => {
    render(<DataGrid columns={columns} />);
    expect(await screen.findByText("User 1")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("User 21")).toBeInTheDocument();
  });

  it("sorts by name column", async () => {
    const { container } = render(<DataGrid columns={columns} />);
    await screen.findByText("User 1");

    const nameSortButton = container.querySelector(
      'th[data-field="name"] .header-button',
    );
    await userEvent.click(nameSortButton);
    await userEvent.click(nameSortButton);

    expect(await screen.findByText("User 999")).toBeInTheDocument();
  });

  it("edits a cell value inline", async () => {
    render(<DataGrid columns={columns} />);
    const originalCell = await screen.findByRole("button", { name: "User 1" });
    await userEvent.dblClick(originalCell);

    const input = screen.getByDisplayValue("User 1");
    await userEvent.clear(input);
    await userEvent.type(input, "Updated User");
    await userEvent.keyboard("{Enter}");

    expect(
      await screen.findByRole("button", { name: "Updated User" }),
    ).toBeInTheDocument();
  });

  it("focuses edit input immediately on double click", async () => {
    render(<DataGrid columns={columns} />);
    const editableCell = await screen.findByRole("button", { name: "User 1" });
    await userEvent.dblClick(editableCell);
    const input = screen.getByDisplayValue("User 1");
    expect(input).toHaveFocus();
  });

  it("does not select row on editable-cell double click", async () => {
    const onSelectionChange = vi.fn();
    render(
      <DataGrid
        columns={columns}
        rowSelection={{
          mode: "multi",
          checkboxes: false,
          enableClickSelection: true,
        }}
        onSelectionChange={onSelectionChange}
      />,
    );

    const editableCell = await screen.findByRole("button", { name: "User 1" });
    await userEvent.dblClick(editableCell);

    await waitFor(() => {
      const last = onSelectionChange.mock.calls.at(-1)?.[0];
      expect(last?.selectedIds ?? []).toEqual([]);
    });
  });

  it("reports current edited row and cumulative edited rows", async () => {
    const onEditedRowsChange = vi.fn();
    render(
      <DataGrid columns={columns} onEditedRowsChange={onEditedRowsChange} />,
    );

    const firstRowName = await screen.findByRole("button", { name: "User 1" });
    await userEvent.dblClick(firstRowName);
    let input = screen.getByDisplayValue("User 1");
    await userEvent.clear(input);
    await userEvent.type(input, "Edited User 1");
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("button", { name: "Edited User 1" });

    const secondRowName = await screen.findByRole("button", { name: "User 2" });
    await userEvent.dblClick(secondRowName);
    input = screen.getByDisplayValue("User 2");
    await userEvent.clear(input);
    await userEvent.type(input, "Edited User 2");
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("button", { name: "Edited User 2" });

    const lastPayload = onEditedRowsChange.mock.calls.at(-1)[0];
    expect(lastPayload.currentEditedRow.id).toBe(2);
    expect(lastPayload.editedRows.map((row) => row.id)).toEqual([1, 2]);
  });

  it("auto-saves edit on focus out by click, tab, or enter", async () => {
    render(<DataGrid columns={columns} />);

    const firstRowName = await screen.findByRole("button", { name: "User 1" });
    await userEvent.dblClick(firstRowName);
    let input = screen.getByDisplayValue("User 1");
    await userEvent.clear(input);
    await userEvent.type(input, "Blur Saved User");
    await userEvent.click(screen.getByRole("button", { name: "ID" }));
    await screen.findByRole("button", { name: "Blur Saved User" });

    const secondRowName = await screen.findByRole("button", { name: "User 2" });
    await userEvent.dblClick(secondRowName);
    input = screen.getByDisplayValue("User 2");
    await userEvent.clear(input);
    await userEvent.type(input, "Tab Saved User");
    await userEvent.tab();
    await screen.findByRole("button", { name: "Tab Saved User" });

    const thirdRowName = await screen.findByRole("button", { name: "User 3" });
    await userEvent.dblClick(thirdRowName);
    input = screen.getByDisplayValue("User 3");
    await userEvent.clear(input);
    await userEvent.type(input, "Enter Saved User");
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("button", { name: "Enter Saved User" });
  });

  it("reports updates from custom renderCell dropdown", async () => {
    const onEditedRowsChange = vi.fn();
    const customColumns = [
      { field: "id", label: "ID", editable: false, filterable: false },
      {
        field: "status",
        label: "Status",
        editable: true,
        filterable: false,
        renderCell: ({ value, row, updateValue }) => (
          <select
            value={value}
            aria-label={`status-${row.id}`}
            onChange={(event) => {
              void updateValue(event.target.value);
            }}
          >
            <option value="active">active</option>
            <option value="disabled">disabled</option>
          </select>
        ),
      },
    ];

    render(
      <DataGrid columns={customColumns} onEditedRowsChange={onEditedRowsChange} />,
    );
    const statusSelect = await screen.findByRole("combobox", { name: "status-1" });
    await userEvent.selectOptions(statusSelect, "disabled");

    await waitFor(() => {
      const last = onEditedRowsChange.mock.calls.at(-1)?.[0];
      expect(last.currentEditedRow.id).toBe(1);
      expect(last.currentEditedRow.status).toBe("disabled");
      expect(last.editedRows.map((row) => row.id)).toContain(1);
    });
  });

  it("filters by exact status", async () => {
    render(<DataGrid columns={columns} />);
    await screen.findByText("User 1");

    const statusFilter = screen.getByPlaceholderText("Filter Status");
    await userEvent.type(statusFilter, "disabled");

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "active" }),
      ).not.toBeInTheDocument();
    });
  });

  it("hides filter inputs when enableFiltering is false", async () => {
    render(<DataGrid columns={columns} enableFiltering={false} />);
    await screen.findByText("User 1");
    expect(
      screen.queryByPlaceholderText("Filter Status"),
    ).not.toBeInTheDocument();
  });

  it("moves left-pinned columns ahead of earlier unpinned columns", async () => {
    const pinnedColumns = [
      {
        field: "name",
        label: "Name",
        editable: true,
        required: true,
        filterable: true,
        filterOperator: "contains",
      },
      {
        field: "id",
        label: "ID",
        editable: false,
        filterable: false,
        pinned: "left",
      },
      {
        field: "status",
        label: "Status",
        editable: true,
        required: true,
        filterable: true,
        filterOperator: "eq",
      },
    ];

    const { container } = render(<DataGrid columns={pinnedColumns} />);
    await screen.findByText("User 1");

    const headerFields = [
      ...container.querySelectorAll("thead tr:first-child th"),
    ].map((cell) => cell.getAttribute("data-field"));

    expect(headerFields[0]).toBe("id");
    expect(headerFields[1]).toBe("name");
  });

  it("pins a column to the right from the header control", async () => {
    const { container } = render(<DataGrid columns={columns} />);
    await screen.findByText("User 1");

    await userEvent.click(screen.getByRole("button", { name: "Pin ID right" }));

    const headerFields = [
      ...container.querySelectorAll("thead tr:first-child th"),
    ].map((cell) => cell.getAttribute("data-field"));

    expect(headerFields.at(-1)).toBe("id");
  });

  it("supports multi selection and reports selected rows", async () => {
    const onSelectionChange = vi.fn();
    render(
      <DataGrid
        columns={columns}
        rowSelection={{
          mode: "multi",
          checkboxes: true,
          enableClickSelection: false,
        }}
        onSelectionChange={onSelectionChange}
      />,
    );
    await screen.findByText("User 1");

    const rowChecks = screen.getAllByRole("checkbox", { name: /^Select row / });
    expect(rowChecks.length).toBeGreaterThan(1);
    await userEvent.click(rowChecks[0]);
    await userEvent.click(rowChecks[1]);

    const last = onSelectionChange.mock.calls.at(-1)[0];
    expect(last.selectedIds).toEqual([1, 2]);
    expect(last.selectedRows.map((r) => r.id)).toEqual([1, 2]);
  });

  it("single selection keeps one row at a time", async () => {
    const onSelectionChange = vi.fn();
    render(
      <DataGrid
        columns={columns}
        rowSelection={{
          mode: "single",
          checkboxes: true,
        }}
        onSelectionChange={onSelectionChange}
      />,
    );
    await screen.findByText("User 1");

    const rowChecks = screen.getAllByRole("checkbox", { name: /^Select row / });
    await userEvent.click(rowChecks[0]);
    await userEvent.click(rowChecks[1]);

    const last = onSelectionChange.mock.calls.at(-1)[0];
    expect(last.selectedIds).toEqual([2]);
  });

  it("hides the select column when checkboxes is false; plain click replaces selection, Ctrl+click adds", async () => {
    const onSelectionChange = vi.fn();
    const { container } = render(
      <DataGrid
        columns={columns}
        rowSelection={{
          mode: "multi",
          checkboxes: false,
          enableClickSelection: true,
        }}
        onSelectionChange={onSelectionChange}
      />,
    );
    await screen.findByText("User 1");
    expect(container.querySelector('[data-field="__select__"]')).toBeNull();

    const row1Id = container.querySelector(
      'tbody tr td[data-field="id"] .cell-display',
    );
    const row2Id = container.querySelector(
      'tbody tr:nth-child(2) td[data-field="id"] .cell-display',
    );

    await userEvent.click(row1Id);
    expect(onSelectionChange.mock.calls.at(-1)[0].selectedIds).toEqual([1]);

    await userEvent.click(row2Id);
    expect(onSelectionChange.mock.calls.at(-1)[0].selectedIds).toEqual([2]);

    await userEvent.click(row1Id);
    fireEvent.click(row2Id, { ctrlKey: true, bubbles: true });
    expect(onSelectionChange.mock.calls.at(-1)[0].selectedIds).toEqual([1, 2]);
  });
});
