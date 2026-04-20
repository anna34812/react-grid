import { describe, expect, it } from 'vitest';
import { reorderRowsById } from './rowOrder';

describe('reorderRowsById', () => {
  it('moves a row to another position', () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(reorderRowsById(rows, 3, 1)).toEqual([{ id: 3 }, { id: 1 }, { id: 2 }]);
  });

  it('returns the same reference when source equals target', () => {
    const rows = [{ id: 1 }, { id: 2 }];
    expect(reorderRowsById(rows, 1, 1)).toBe(rows);
  });
});
