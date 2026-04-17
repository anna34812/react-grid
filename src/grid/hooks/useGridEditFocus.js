import { useLayoutEffect } from "react";

/** Focus first focusable control inside the active inline-edit host. */
export function useGridEditFocus(editingCell) {
  useLayoutEffect(() => {
    if (!editingCell) return;

    const host = document.querySelector("[data-edit-host]");
    if (!host) return;

    const focusable = host.querySelector(
      "input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [contenteditable='true'], [tabindex]:not([tabindex='-1'])",
    );
    if (focusable instanceof HTMLElement) {
      focusable.focus({ preventScroll: true });
      if (focusable instanceof HTMLInputElement) focusable.select();
    }
  }, [editingCell]);
}
