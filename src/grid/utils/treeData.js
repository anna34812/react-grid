/**
 * @param {Record<string, unknown>[]} rows
 * @param {{ idField?: string; parentField?: string }} [options]
 * @returns {Set<unknown>} ids that have at least one child
 */
export function getIdsWithChildren(rows, options = {}) {
  const idField = options.idField ?? "id";
  const parentField = options.parentField ?? "parentId";
  const withChildren = new Set();
  for (const row of rows) {
    const p = row[parentField];
    if (p !== undefined && p !== null) withChildren.add(p);
  }
  return withChildren;
}

/**
 * DFS pre-order flatten; only includes children when parent id is in expandedIds.
 *
 * @param {Record<string, unknown>[]} rows
 * @param {Set<unknown>} expandedIds
 * @param {{ idField?: string; parentField?: string }} [options]
 * @returns {Record<string, unknown>[]}
 */
export function flattenTreeRows(rows, expandedIds, options = {}) {
  const idField = options.idField ?? "id";
  const parentField = options.parentField ?? "parentId";

  const byId = new Map(rows.map((r) => [r[idField], r]));
  const children = new Map();
  const roots = [];

  for (const r of rows) {
    const id = r[idField];
    const p = r[parentField];
    if (p === undefined || p === null) {
      roots.push(id);
    } else {
      if (!children.has(p)) children.set(p, []);
      children.get(p).push(id);
    }
  }

  const orderIndex = new Map(rows.map((r, i) => [r[idField], i]));
  const sortSiblingIds = (ids) => [...ids].sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0));
  sortSiblingIds(roots);

  for (const [pid, ids] of children) {
    children.set(pid, sortSiblingIds(ids));
  }

  const out = [];

  const visit = (id, depth) => {
    const row = byId.get(id);
    if (!row) return;
    const childIds = children.get(id) ?? [];
    const hasChildren = childIds.length > 0;
    const expanded = hasChildren && expandedIds.has(id);
    out.push({
      ...row,
      __treeDepth: depth,
      __treeHasChildren: hasChildren,
      __treeExpanded: expanded,
    });
    if (!hasChildren || !expanded) return;
    for (const cid of childIds) visit(cid, depth + 1);
  };

  for (const rid of roots) visit(rid, 0);

  return out;
}

/**
 * Bottom-up sum of leaf numeric field (e.g. size in bytes). Folders get sum of descendants; leaves use their own value.
 *
 * @param {Record<string, unknown>[]} rows
 * @param {{ idField?: string; parentField?: string; valueField: string }} options
 * @returns {Map<unknown, number>}
 */
export function computeTreeAggregates(rows, options) {
  const idField = options.idField ?? "id";
  const parentField = options.parentField ?? "parentId";
  const valueField = options.valueField;

  const children = new Map();
  for (const r of rows) {
    const p = r[parentField];
    if (p === undefined || p === null) continue;
    if (!children.has(p)) children.set(p, []);
    children.get(p).push(r[idField]);
  }

  const memo = new Map();

  const dfs = (id) => {
    if (memo.has(id)) return memo.get(id);
    const row = rows.find((r) => r[idField] === id);
    if (!row) {
      memo.set(id, 0);
      return 0;
    }
    const kids = children.get(id);
    if (!kids || kids.length === 0) {
      const v = Number(row[valueField]);
      const n = Number.isFinite(v) ? v : 0;
      memo.set(id, n);
      return n;
    }
    let sum = 0;
    for (const cid of kids) sum += dfs(cid);
    memo.set(id, sum);
    return sum;
  }

  for (const r of rows) dfs(r[idField]);

  return memo;
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {{ idField?: string; parentField?: string }} [options]
 * @returns {Map<unknown, unknown[]>}
 */
export function getChildrenMap(rows, options = {}) {
  const idField = options.idField ?? "id";
  const parentField = options.parentField ?? "parentId";
  /** @type {Map<unknown, unknown[]>} */
  const children = new Map();
  const orderIndex = new Map(rows.map((r, i) => [r[idField], i]));
  for (const r of rows) {
    const p = r[parentField];
    if (p === undefined || p === null) continue;
    if (!children.has(p)) children.set(p, []);
    children.get(p).push(r[idField]);
  }
  for (const [pid, ids] of children) {
    children.set(
      pid,
      [...ids].sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0)),
    );
  }
  return children;
}

/**
 * Pre-order: root + all descendants (for descendant selection toggles).
 * @param {unknown} rootId
 * @param {Map<unknown, unknown[]>} childrenMap
 * @returns {unknown[]}
 */
export function collectSubtreeIds(rootId, childrenMap) {
  /** @type {unknown[]} */
  const out = [];
  const walk = (id) => {
    out.push(id);
    const kids = childrenMap.get(id) ?? [];
    for (const kid of kids) walk(kid);
  };
  walk(rootId);
  return out;
}

/** @param {number} bytes */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  const digits = u === 0 ? 0 : v < 10 ? 2 : v < 100 ? 1 : 0;
  return `${v.toFixed(digits)} ${units[u]}`;
}
