import { describe, expect, it } from 'vitest';
import { collectSubtreeIds, computeTreeAggregates, flattenTreeRows, formatBytes, getChildrenMap, getIdsWithChildren } from './treeData.js';

describe('getChildrenMap / collectSubtreeIds', () => {
  const rows = [
    { id: 1, parentId: null },
    { id: 2, parentId: 1 },
    { id: 3, parentId: 1 },
    { id: 4, parentId: 2 },
  ];

  it('builds ordered children lists', () => {
    const m = getChildrenMap(rows, { idField: 'id', parentField: 'parentId' });
    expect(m.get(1)).toEqual([2, 3]);
    expect(m.get(2)).toEqual([4]);
  });

  it('collectSubtreeIds is pre-order', () => {
    const m = getChildrenMap(rows, { idField: 'id', parentField: 'parentId' });
    expect(collectSubtreeIds(1, m)).toEqual([1, 2, 4, 3]);
    expect(collectSubtreeIds(2, m)).toEqual([2, 4]);
  });
});

describe('getIdsWithChildren', () => {
  it('collects parent ids', () => {
    const rows = [
      { id: 'a', parentId: null },
      { id: 'b', parentId: 'a' },
    ];
    expect(getIdsWithChildren(rows, { idField: 'id', parentField: 'parentId' })).toEqual(new Set(['a']));
  });
});

describe('flattenTreeRows', () => {
  const rows = [
    { id: 1, parentId: null, name: 'root' },
    { id: 2, parentId: 1, name: 'c1' },
    { id: 3, parentId: 1, name: 'c2' },
    { id: 4, parentId: 2, name: 'leaf' },
  ];

  it('shows only roots when children collapsed', () => {
    const flat = flattenTreeRows(rows, new Set(), { idField: 'id', parentField: 'parentId' });
    expect(flat.map((r) => r.id)).toEqual([1]);
    expect(flat[0].__treeDepth).toBe(0);
    expect(flat[0].__treeHasChildren).toBe(true);
    expect(flat[0].__treeExpanded).toBe(false);
  });

  it('expands one level', () => {
    const flat = flattenTreeRows(rows, new Set([1]), { idField: 'id', parentField: 'parentId' });
    expect(flat.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(flat[1].__treeDepth).toBe(1);
  });

  it('expands nested', () => {
    const flat = flattenTreeRows(rows, new Set([1, 2]), { idField: 'id', parentField: 'parentId' });
    expect(flat.map((r) => r.id)).toEqual([1, 2, 4, 3]);
  });
});

describe('computeTreeAggregates', () => {
  it('sums subtree sizes', () => {
    const rows = [
      { id: 1, parentId: null, sizeBytes: null },
      { id: 2, parentId: 1, sizeBytes: null },
      { id: 3, parentId: 2, sizeBytes: 500 * 1024 },
      { id: 4, parentId: 2, sizeBytes: 1024 * 1024 },
    ];
    const m = computeTreeAggregates(rows, { valueField: 'sizeBytes' });
    expect(m.get(3)).toBe(500 * 1024);
    expect(m.get(4)).toBe(1024 * 1024);
    expect(m.get(2)).toBe(500 * 1024 + 1024 * 1024);
    expect(m.get(1)).toBe(500 * 1024 + 1024 * 1024);
  });
});

describe('formatBytes', () => {
  it('formats kb', () => {
    expect(formatBytes(500 * 1024)).toMatch(/500/);
  });
});
