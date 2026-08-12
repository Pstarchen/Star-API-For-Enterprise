export default function Loading() {
  return (
    <div className="route-loading" role="status" aria-label="页面加载中" aria-busy="true">
      <div className="route-loading-status"><span className="skeleton-block" /><span className="skeleton-block" /></div>
      <header className="route-loading-nav container-shell">
        <div className="route-loading-island route-loading-brand"><span className="skeleton-block" /><span className="skeleton-block" /><span className="skeleton-block route-loading-menu-button" /></div>
        <nav className="route-loading-island" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <span key={index} className="skeleton-block" />)}</nav>
        <div className="route-loading-island route-loading-actions"><span className="skeleton-block" /><span className="skeleton-block" /></div>
      </header>

      <main>
        <section className="route-loading-hero">
          <div className="container-shell route-loading-hero-grid">
            <div className="route-loading-copy">
              <span className="skeleton-block" />
              <span className="skeleton-block" />
              <span className="skeleton-block" />
              <span className="skeleton-block" />
              <div><span className="skeleton-block" /><span className="skeleton-block" /></div>
            </div>
            <div className="route-loading-panel">
              <span className="skeleton-block" />
              <span className="skeleton-block" />
              <div>{Array.from({ length: 3 }, (_, index) => <span key={index} className="skeleton-block" />)}</div>
            </div>
          </div>
        </section>
        <section className="route-loading-metrics container-shell">
          {Array.from({ length: 4 }, (_, index) => <div key={index}><span className="skeleton-block" /><span className="skeleton-block" /></div>)}
        </section>
      </main>
      <span className="sr-only">正在加载平台内容</span>
    </div>
  );
}
