import { buildQueryParams, parseFilters, serializeFilters } from './query'
import { describe, expect, it } from 'vitest'

describe('query utils', () => {
  it('builds search params with pagination, sort and filters', () => {
    const params = buildQueryParams({
      page: 2,
      pageSize: 50,
      sortField: 'name',
      sortDirection: 'asc',
      filters: {
        status: { value: 'active', operator: 'eq' },
      },
    })

    expect(params.get('page')).toBe('2')
    expect(params.get('pageSize')).toBe('50')
    expect(params.get('sortField')).toBe('name')
    expect(params.get('sortDirection')).toBe('asc')
    expect(parseFilters(params.get('filters'))).toEqual({
      status: { value: 'active', operator: 'eq' },
    })
  })

  it('returns empty object when filters are invalid JSON', () => {
    expect(parseFilters('bad-json')).toEqual({})
  })

  it('serializes empty filters', () => {
    expect(serializeFilters({})).toBe('{}')
  })
})
