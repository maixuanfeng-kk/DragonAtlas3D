export function HeroOverlay({
  search,
  setSearch,
  handleSubmitSearch,
  locationReveal,
}) {
  return (
    <>
      <header className="hero-overlay">
        <form className="hero-bar" onSubmit={handleSubmitSearch}>
          <span className="hero-brand">DragonAtlas3D · 中国旅行助手</span>
          <span className="hero-hint">搜索城市或放大至市级区域，进入高德细节规划</span>
          <div className="hero-search">
            <label className="sr-only" htmlFor="hero-destination-search">
              输入城市或省份
            </label>
            <input
              id="hero-destination-search"
              name="destination"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="输入城市，如：成都、云南…"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit">探索</button>
          </div>
        </form>
      </header>

      {locationReveal && (
        <aside className="location-reveal-card" role="status" aria-live="polite">
          <p className="reveal-eyebrow">{locationReveal.eyebrow}</p>
          <h2>{locationReveal.title}</h2>
          <div className="reveal-meta">
            {locationReveal.meta.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
          <p className="reveal-caption">{locationReveal.caption}</p>
        </aside>
      )}
    </>
  );
}
