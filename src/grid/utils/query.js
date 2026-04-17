export const DEFAULT_QUERY_STATE = { page: 1, pageSize: 20, sortField: null, sortDirection: null, filters: {}, treeMode: false };

export const serializeFilters = (filters) => JSON.stringify(filters ?? {});

export const buildQueryParams = (queryState) => {
  const params = new URLSearchParams();
  params.set("page", String(queryState.page));
  params.set("pageSize", String(queryState.pageSize));

  if (queryState.sortField && queryState.sortDirection) {
    params.set("sortField", queryState.sortField);
    params.set("sortDirection", queryState.sortDirection);
  }

  if (queryState.filters && Object.keys(queryState.filters).length > 0) params.set("filters", serializeFilters(queryState.filters));

  return params;
};

export const parseFilters = (rawFilters) => {
  if (!rawFilters) return {};

  try {
    return JSON.parse(rawFilters);
  } catch {
    return {};
  }
};
