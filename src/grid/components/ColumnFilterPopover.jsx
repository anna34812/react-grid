import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const FilterFunnelIcon = () => (
  <svg className="filter-funnel-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M4 5h16l-6.5 8.2v4.8L10.5 19v-5.8L4 5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

/**
 * Floating multi-select filter; search input filters the option list only.
 */
export function ColumnFilterPopover({ isOpen, onClose, anchorEl, label, distinctValues, selectedValues, onChange }) {
  const popoverRef = useRef(null);
  const selectAllRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [listSearch, setListSearch] = useState('');

  useEffect(() => {
    if (!isOpen) setListSearch('');
  }, [isOpen]);

  const filteredList = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    if (!q) return distinctValues;
    return distinctValues.filter((v) => v.toLowerCase().includes(q));
  }, [distinctValues, listSearch]);

  const allFilteredSelected = filteredList.length > 0 && filteredList.every((v) => selectedValues.includes(v));
  const someFilteredSelected = filteredList.some((v) => selectedValues.includes(v));

  useEffect(() => {
    const el = selectAllRef.current;
    if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected;
  }, [someFilteredSelected, allFilteredSelected]);

  const toggleAllFiltered = useCallback(() => {
    if (allFilteredSelected) {
      onChange(selectedValues.filter((v) => !filteredList.includes(v)));
    } else {
      onChange([...new Set([...selectedValues, ...filteredList])]);
    }
  }, [allFilteredSelected, filteredList, onChange, selectedValues]);

  const toggleOne = useCallback(
    (value) => {
      if (selectedValues.includes(value)) onChange(selectedValues.filter((v) => v !== value));
      else onChange([...selectedValues, value]);
    },
    [onChange, selectedValues],
  );

  useLayoutEffect(() => {
    if (!isOpen || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, left: rect.left });
  }, [isOpen, anchorEl]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutside = (e) => {
      if (popoverRef.current?.contains(e.target) || anchorEl?.contains(e.target)) return;
      onClose();
    };
    const onKey = (e) => e.key === 'Escape' && onClose();

    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose, anchorEl]);

  if (!isOpen || typeof document === 'undefined') return null;

  const popover = (
    <div ref={popoverRef} role="dialog" aria-label={`Filter ${label}`} className="column-filter-popover" style={{ position: 'fixed', top: position.top, left: position.left, zIndex: 10000 }}>
      <div className="column-filter-popover-search">
        <span className="column-filter-popover-search-icon" aria-hidden>
          🔍
        </span>
        <input type="search" className="column-filter-popover-search-input" placeholder="Search..." value={listSearch} onChange={(e) => setListSearch(e.target.value)} autoFocus />
      </div>
      <div className="column-filter-popover-list" role="listbox">
        <label className="column-filter-popover-row column-filter-popover-row--all">
          <input ref={selectAllRef} type="checkbox" checked={allFilteredSelected} onChange={toggleAllFiltered} />
          <span>(Select All)</span>
        </label>
        {filteredList.map((value) => (
          <label key={value} className="column-filter-popover-row">
            <input type="checkbox" checked={selectedValues.includes(value)} onChange={() => toggleOne(value)} />
            <span>{value}</span>
          </label>
        ))}
      </div>
    </div>
  );

  return createPortal(popover, document.body);
}

export { FilterFunnelIcon };
