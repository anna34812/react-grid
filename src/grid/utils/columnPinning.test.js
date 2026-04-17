import { describe, expect, it } from 'vitest'
import {
  getColumnMinWidth,
  getColumnSections,
  getDisplayColumns,
  getEffectivePin,
  isColumnResizable,
} from './columnPinning'

describe('columnPinning', () => {
  it('orders left-pinned columns before others by original index', () => {
    const columns = [
      { field: 'b', label: 'B' },
      { field: 'a', label: 'A', pinned: 'left' },
      { field: 'c', label: 'C' },
    ]
    const { left, center, right } = getColumnSections(columns, {})
    expect(left.map((c) => c.field)).toEqual(['a'])
    expect(center.map((c) => c.field)).toEqual(['b', 'c'])
    expect(right).toEqual([])
  })

  it('places right-pinned columns in the right section', () => {
    const columns = [
      { field: 'z', label: 'Z', pinned: 'right' },
      { field: 'a', label: 'A' },
      { field: 'b', label: 'B', pinned: 'right' },
    ]
    const { left, center, right } = getColumnSections(columns, {})
    expect(left).toEqual([])
    expect(center.map((c) => c.field)).toEqual(['a'])
    expect(right.map((c) => c.field)).toEqual(['z', 'b'])
  })

  it('respects pinned overrides over column defaults', () => {
    const columns = [{ field: 'a', label: 'A', pinned: 'left' }]
    expect(getEffectivePin(columns[0], { a: null })).toBeNull()
    const { left, center } = getColumnSections(columns, { a: null })
    expect(left).toEqual([])
    expect(center.map((c) => c.field)).toEqual(['a'])
  })

  it('flattens display columns as left, center, right', () => {
    const columns = [
      { field: 'b', label: 'B' },
      { field: 'a', label: 'A', pinned: 'left' },
    ]
    expect(getDisplayColumns(columns, {}).map((c) => c.field)).toEqual(['a', 'b'])
  })

  it('uses width or minWidth when provided', () => {
    expect(getColumnMinWidth({ field: 'a', width: 99 })).toBe(99)
    expect(getColumnMinWidth({ field: 'a', minWidth: 88 })).toBe(88)
    expect(getColumnMinWidth({ field: 'a' })).toBe(140)
  })

  it('isColumnResizable defaults true unless resizable is false', () => {
    expect(isColumnResizable({ field: 'a' })).toBe(true)
    expect(isColumnResizable({ field: 'a', resizable: true })).toBe(true)
    expect(isColumnResizable({ field: 'a', resizable: false })).toBe(false)
  })
})
