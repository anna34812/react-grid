import { fetchDistinctColumnValues as fetchDistinctFromServer, fetchRows, updateRow } from '../mock/server';
import { buildQueryParams } from '../utils/query';

export async function getRows(queryState) {
  const queryParams = buildQueryParams(queryState);
  void queryParams;
  return fetchRows(queryState);
}

export async function patchRow(id, updates, options) {
  return updateRow(id, updates, options);
}

export async function fetchDistinctColumnValues(field, options) {
  return fetchDistinctFromServer(field, options);
}
