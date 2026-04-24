export const GridEmptyState = ({ EmptyComponent }) =>
  EmptyComponent ? <EmptyComponent /> : <p className="status grid-empty-default-message">No Rows To Show</p>;
