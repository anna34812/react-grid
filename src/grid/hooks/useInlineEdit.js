import { useState } from "react";
import { patchRow } from "../api/gridApi";

const validateValue = (column, value) => {
  if (!column.editable) return "This field is read only.";
  if (column.required && (value == null || value === "")) return "Value is required.";
  if (column.type === "number" && Number.isNaN(Number(value))) return "Number is required.";

  return "";
};

export const useInlineEdit = (setRows) => {
  const [editingCell, setEditingCell] = useState(null);
  const [draftValue, setDraftValue] = useState("");
  const [savingCell, setSavingCell] = useState(null);
  const [editError, setEditError] = useState("");

  const startEdit = (rowId, field, value) => {
    setEditError("");
    setEditingCell({ rowId, field });
    setDraftValue(value ?? "");
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setDraftValue("");
    setEditError("");
  };

  const saveEdit = async ({ rowId, field, column }) => {
    const error = validateValue(column, draftValue);
    if (error) {
      setEditError(error);
      return false;
    }

    const nextValue = column.type === "number" ? Number(draftValue) : draftValue;
    const previousRows = [];

    setSavingCell({ rowId, field });
    setEditError("");
    setRows((rows) => {
      previousRows.push(...rows);
      return rows.map((row) => (row.id === rowId ? { ...row, [field]: nextValue } : row));
    });

    try {
      await patchRow(rowId, { [field]: nextValue });
      setEditingCell(null);
      setDraftValue("");
      return true;
    } catch (errorResponse) {
      setRows(previousRows);
      setEditError(errorResponse.message || "Failed to save value");
      return false;
    } finally {
      setSavingCell(null);
    }
  };

  return {
    editingCell,
    draftValue,
    savingCell,
    editError,
    setDraftValue,
    startEdit,
    cancelEdit,
    saveEdit,
  };
};
