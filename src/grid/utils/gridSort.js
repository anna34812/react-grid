export const nextSortDirection = (currentField, currentDirection, field) => {
  if (currentField !== field) return "asc";
  if (currentDirection === "asc") return "desc";
  if (currentDirection === "desc") return null;
  return "asc";
};
