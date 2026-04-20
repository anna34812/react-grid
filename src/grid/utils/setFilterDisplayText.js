/**
 * Build a single-line label for a set ("in") filter: "(count) a, b, c" or with ", ..." when truncated.
 *
 * @param {number} count
 * @param {string[]} values - sorted display strings (non-empty)
 * @param {number} maxWidthPx - available content width (excluding padding)
 * @param {(text: string) => number} measureText
 * @returns {string}
 */
export function fitSetFilterDisplayText(count, values, maxWidthPx, measureText) {
  const prefix = `(${count}) `;
  if (!values?.length) return prefix.trim();
  if (maxWidthPx <= 0) return prefix.trim();

  const full = prefix + values.join(', ');
  if (measureText(full) <= maxWidthPx) return full;

  const n = values.length;

  const candidateForK = (k) => {
    const part = values.slice(0, k).join(', ');
    if (k < n) return `${prefix}${part}, ...`;
    return `${prefix}${part}`;
  };

  let lo = 1;
  let hi = n;
  let bestK = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cand = candidateForK(mid);
    if (measureText(cand) <= maxWidthPx) {
      bestK = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (bestK > 0) return candidateForK(bestK);

  const withEllipsis = n > 1 ? `${prefix}${values[0]}, ...` : `${prefix}${values[0]}`;
  if (measureText(withEllipsis) <= maxWidthPx) return withEllipsis;

  return truncateToWidth(withEllipsis, maxWidthPx, measureText);
}

/**
 * @param {string} text
 * @param {number} maxWidthPx
 * @param {(text: string) => number} measureText
 */
function truncateToWidth(text, maxWidthPx, measureText) {
  const ell = '...';
  if (measureText(ell) > maxWidthPx) return ell;

  let lo = 0;
  let hi = text.length;
  let best = ell;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cand = text.slice(0, mid) + ell;
    if (measureText(cand) <= maxWidthPx) {
      best = cand;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}
