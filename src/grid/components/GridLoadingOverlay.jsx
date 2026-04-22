const DefaultLoadingContent = () => (
  <div className="grid-loading-chip">
    <span className="grid-loading-spinner" aria-hidden />
    <span>Loading...</span>
  </div>
);

export const GridLoadingOverlay = ({ LoadingComponent }) => (
  <div className="grid-loading-overlay" role="status" aria-live="polite">
    {LoadingComponent ? <LoadingComponent /> : <DefaultLoadingContent />}
  </div>
);
