import { mockRows } from "./data";

let dataStore = [...mockRows];

export const resetDataStore = () => (dataStore = [...mockRows]);

const applyFilters = (rows, filters) => {
  return rows.filter((row) => {
    return Object.entries(filters).every(([field, filter]) => {
      if (!filter || filter.value === undefined || filter.value === "") return true;
      if (Array.isArray(filter.value) && filter.value.length === 0) return false;

      const rawValue = row[field];
      if (filter.operator === "in" && Array.isArray(filter.value)) return filter.value.some((v) => v == rawValue || String(v) === String(rawValue));

      const rowValue = rawValue == null ? "" : String(rawValue).toLowerCase();
      const filterValue = String(filter.value).toLowerCase();
      if (filter.operator === "eq") return rowValue === filterValue;
      if (filter.operator === "gte") return Number(rawValue) >= Number(filter.value);
      if (filter.operator === "lte") return Number(rawValue) <= Number(filter.value);
      return rowValue.includes(filterValue);
    });
  });
};

const applySort = (rows, sortField, sortDirection) => {
  if (!sortField || !sortDirection) return rows;

  const sortedRows = [...rows].sort((left, right) => {
    const leftValue = left[sortField];
    const rightValue = right[sortField];
    if (leftValue === rightValue) return 0;
    if (leftValue > rightValue) return 1;
    return -1;
  });

  return sortDirection === "desc" ? sortedRows.reverse() : sortedRows;
};

export async function fetchRows(queryState) {
  const { page, pageSize, sortField, sortDirection, filters = {} } = queryState;

  const filteredRows = applyFilters(dataStore, filters);
  const sortedRows = applySort(filteredRows, sortField, sortDirection);
  const startIndex = (page - 1) * pageSize;
  const pagedRows = sortedRows.slice(startIndex, startIndex + pageSize);

  await new Promise((resolve) => setTimeout(resolve, 200));

  return { rows: pagedRows, totalCount: sortedRows.length };
}

/** Unique string values for a column (full dataset, for filter UI). */
export function getDistinctColumnValues(field) {
  const seen = new Set();
  for (const row of dataStore) {
    const v = row[field];
    if (v !== undefined && v !== null) seen.add(String(v));
  }
  return [...seen].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export async function fetchDistinctColumnValues(field) {
  await new Promise((r) => setTimeout(r, 0));
  return getDistinctColumnValues(field);
}

export async function updateRow(id, updates) {
  const rowIndex = dataStore.findIndex((row) => row.id === id);
  if (rowIndex < 0) throw new Error("Row not found");

  const updatedRow = { ...dataStore[rowIndex], ...updates };
  dataStore[rowIndex] = updatedRow;

  await new Promise((resolve) => setTimeout(resolve, 150));

  return { row: updatedRow };
}
