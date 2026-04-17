import { fetchRows, updateRow } from '../mock/server'
import { buildQueryParams } from '../utils/query'

export async function getRows(queryState) {
  const queryParams = buildQueryParams(queryState)
  void queryParams
  return fetchRows(queryState)
}

export async function patchRow(id, updates) {
  return updateRow(id, updates)
}
