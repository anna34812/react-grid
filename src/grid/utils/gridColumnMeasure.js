/**
 * Max width for double-click auto-fit (avoid pathological layout).
 * User can still widen manually after.
 */
export const GRID_COLUMN_AUTOFIT_MAX = 4000;

/** @param {Element} el */
function snapshotWidthStyles(el) {
  return {
    width: el.style.width,
    minWidth: el.style.minWidth,
    maxWidth: el.style.maxWidth,
    overflow: el.style.overflow,
  };
}

/** @param {Element} el */
function applyUnconstrainedWidth(el) {
  el.style.width = 'max-content';
  el.style.minWidth = 'max-content';
  el.style.maxWidth = 'none';
  el.style.overflow = 'visible';
}

/** @param {Element} el @param {ReturnType<typeof snapshotWidthStyles>} prev */
function restoreWidthStyles(el, prev) {
  if (prev.width) el.style.width = prev.width;
  else el.style.removeProperty('width');
  if (prev.minWidth) el.style.minWidth = prev.minWidth;
  else el.style.removeProperty('min-width');
  if (prev.maxWidth) el.style.maxWidth = prev.maxWidth;
  else el.style.removeProperty('max-width');
  if (prev.overflow) el.style.overflow = prev.overflow;
  else el.style.removeProperty('overflow');
}

function forceReflow(el) {
  if (el && el instanceof Element) void el.offsetHeight;
}

/**
 * Temporarily un-constrain width so flex/grid `min-width:0` cells report intrinsic size.
 * @param {Element} el
 * @returns {number}
 */
export function measureIntrinsicWidth(el) {
  if (!el || !(el instanceof Element)) return 0;
  const prev = {
    width: el.style.width,
    minWidth: el.style.minWidth,
    maxWidth: el.style.maxWidth,
    overflow: el.style.overflow,
  };
  el.style.width = 'max-content';
  el.style.minWidth = 'max-content';
  el.style.maxWidth = 'none';
  el.style.overflow = 'visible';
  const w = Math.max(el.scrollWidth, el.offsetWidth, el.getBoundingClientRect().width);
  if (prev.width) el.style.width = prev.width;
  else el.style.removeProperty('width');
  if (prev.minWidth) el.style.minWidth = prev.minWidth;
  else el.style.removeProperty('min-width');
  if (prev.maxWidth) el.style.maxWidth = prev.maxWidth;
  else el.style.removeProperty('max-width');
  if (prev.overflow) el.style.overflow = prev.overflow;
  else el.style.removeProperty('overflow');
  return w;
}

const INPUT_MEASURE_PROPS = ['width', 'minWidth', 'maxWidth', 'flex'];

/**
 * Loosen filter input so width is not `100%` of column; call `restore()` after measuring the header.
 * @param {HTMLInputElement} input
 * @returns {() => void}
 */
function applyInputMeasureForWidth(input) {
  if (!input || input.tagName !== 'INPUT') return () => {};
  const prev = {};
  for (const p of INPUT_MEASURE_PROPS) prev[p] = input.style[p];
  input.style.width = 'auto';
  input.style.minWidth = '0';
  input.style.maxWidth = 'none';
  input.style.flex = '0 0 auto';
  return () => {
    for (const p of INPUT_MEASURE_PROPS) {
      if (prev[p]) input.style[p] = prev[p];
      else input.style.removeProperty(p.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`));
    }
  };
}

/**
 * `width: 100%` filter inputs grow with the column — measuring the row includes that feedback loop.
 * Shrink input to intrinsic text width for one stable reading.
 * @param {HTMLInputElement} input
 */
export function measureInputIntrinsicWidth(input) {
  if (!input || input.tagName !== 'INPUT') return 0;
  const restore = applyInputMeasureForWidth(input);
  try {
    return Math.max(input.scrollWidth, input.offsetWidth);
  } finally {
    restore();
  }
}

function isColumnHeaderCell(el) {
  if (el.getAttribute('role') === 'columnheader') return true;
  return el.classList.contains('data-grid-header-cell') || el.classList.contains('tree-grid-header-cell');
}

const TITLE_BTN_PROPS = ['flex', 'minWidth', 'width', 'maxWidth', 'overflow', 'textOverflow'];

/**
 * Relax title row + label button for measurement. **Must** call returned `restore()` after
 * reading the column header outer width (otherwise header width collapses again).
 * @param {Element} titleRow `.header-cell.header-cell--title-row`
 * @returns {() => void}
 */
export function applyHeaderTitleRowMeasure(titleRow) {
  if (!titleRow || !(titleRow instanceof Element)) return () => {};
  const button = titleRow.querySelector('.header-button');
  const prevBtn = {};
  if (button) {
    for (const p of TITLE_BTN_PROPS) {
      prevBtn[p] = button.style[p];
    }
    button.style.flex = 'none';
    button.style.minWidth = 'auto';
    button.style.width = 'max-content';
    button.style.maxWidth = 'none';
    button.style.overflow = 'visible';
    button.style.textOverflow = 'clip';
  }

  const prevRow = snapshotWidthStyles(titleRow);
  applyUnconstrainedWidth(titleRow);

  return () => {
    restoreWidthStyles(titleRow, prevRow);
    if (button) {
      for (const p of TITLE_BTN_PROPS) {
        if (prevBtn[p]) button.style[p] = prevBtn[p];
        else button.style.removeProperty(p.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`));
      }
    }
  };
}

/**
 * Title row width (standalone). Prefer {@link measureHeaderColumnWidth} for headers with `.header-stack`.
 * @param {Element} titleRow
 */
export function measureHeaderTitleRowWidth(titleRow) {
  const restore = applyHeaderTitleRowMeasure(titleRow);
  try {
    forceReflow(titleRow);
    return Math.max(titleRow.scrollWidth, titleRow.offsetWidth, titleRow.getBoundingClientRect().width);
  } finally {
    restore();
  }
}

/**
 * Header: un-constrain `.header-stack` + columnheader, relax title row + filter input, then read
 * **`headerEl.offsetWidth`** once — after all relaxations, before any restore (critical).
 */
function measureHeaderColumnWidth(headerEl) {
  const stack = headerEl.querySelector('.header-stack');
  const prevStack = stack ? snapshotWidthStyles(stack) : null;
  const prevHead = snapshotWidthStyles(headerEl);

  if (stack) applyUnconstrainedWidth(stack);
  applyUnconstrainedWidth(headerEl);
  forceReflow(headerEl);

  const titleRow = headerEl.querySelector('.header-cell.header-cell--title-row');
  const restoreTitle = titleRow ? applyHeaderTitleRowMeasure(titleRow) : () => {};

  const inline = headerEl.querySelector('.header-filter-inline');
  const prevIn = inline ? snapshotWidthStyles(inline) : null;
  if (inline) applyUnconstrainedWidth(inline);

  const input = inline?.querySelector('input.header-filter-input');
  const restoreInput = input ? applyInputMeasureForWidth(input) : () => {};

  forceReflow(headerEl);

  /** Full border-box width of the header cell while everything is relaxed */
  const outer = Math.ceil(Math.max(headerEl.offsetWidth, headerEl.scrollWidth, headerEl.getBoundingClientRect().width));

  restoreInput();
  if (inline && prevIn) restoreWidthStyles(inline, prevIn);
  restoreTitle();
  restoreWidthStyles(headerEl, prevHead);
  if (stack && prevStack) restoreWidthStyles(stack, prevStack);
  forceReflow(headerEl);

  return outer;
}

/**
 * Widest width needed for the column header only (title, filter row, pin actions, resize grip).
 * Use for initial "fit to data" sizing so tracks are not driven only by `minWidth` from column defs.
 * @param {Element} rootEl container that includes header cells (e.g. `.grid-container`)
 * @param {string} field column `field`
 * @param {number} minW minimum width (px)
 */
export function measureColumnHeaderContentWidth(rootEl, field, minW) {
  if (!rootEl || typeof field !== 'string') return minW;
  let max = minW;
  const nodes = rootEl.querySelectorAll(`[data-field="${CSS.escape(field)}"]`);
  for (const el of nodes) {
    if (isColumnHeaderCell(el)) {
      max = Math.max(max, measureHeaderColumnWidth(el));
    }
  }
  return Math.min(GRID_COLUMN_AUTOFIT_MAX, Math.max(minW, Math.round(max)));
}

/**
 * Measure the widest `data-field` cell in the grid root for auto column sizing.
 * @param {Element} rootEl `.data-grid` or `.tree-data-grid`
 * @param {string} field column field id
 * @param {number} minW minimum width (px)
 * @returns {number} clamped pixel width
 */
export function measureColumnContentWidth(rootEl, field, minW) {
  if (!rootEl || typeof field !== 'string') return minW;
  let max = minW;
  const nodes = rootEl.querySelectorAll(`[data-field="${CSS.escape(field)}"]`);

  nodes.forEach((el) => {
    if (isColumnHeaderCell(el)) {
      max = Math.max(max, measureHeaderColumnWidth(el));
    } else {
      max = Math.max(max, measureIntrinsicWidth(el));
    }
  });

  return Math.min(GRID_COLUMN_AUTOFIT_MAX, Math.max(minW, Math.round(max)));
}
