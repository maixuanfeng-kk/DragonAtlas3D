import { sourceStatusText } from "../map/viewState.js";
import { heroHeadline, heroSubline } from "./heroCopy.js";

function destinationStatusCopy(poiSearchState) {
  if (poiSearchState.status === "failed") {
    return "全国目的地搜索受限";
  }

  if (poiSearchState.query && poiSearchState.status === "pending") {
    return `正在锁定 ${poiSearchState.query}`;
  }

  if (poiSearchState.query && poiSearchState.status === "ready") {
    return `${poiSearchState.query} 已锁定`;
  }

  return "城市 / 省份入口已就位";
}

export function HeroOverlay({
  currentNode,
  stats,
  poiSearchState,
  residentialLayerState,
  search,
  setSearch,
  handleSubmitSearch,
  locationReveal,
}) {
  const isCountryView = currentNode?.level === "country";
  const imageryStatus = `${sourceStatusText(stats.imagery.status)} / ${stats.imagery.label}`;
  const searchStatus = destinationStatusCopy(poiSearchState);
  const finePoiStatus =
    residentialLayerState.resultCount > 0
      ? `${residentialLayerState.resultCount} 个精细地点`
      : sourceStatusText(residentialLayerState.status);
  const supportNote = residentialLayerState.error || residentialLayerState.note || poiSearchState.error || poiSearchState.note;

  return (
    <>
      <section className={`hero-overlay ${isCountryView ? "" : "is-condensed"}`}>
        <div className="hero-shell">
          <p className="hero-kicker">DRAGON ATLAS 3D / CHINA TERRAIN</p>
          <h1>{heroHeadline(currentNode)}</h1>
          <p className="hero-subline">{heroSubline(currentNode)}</p>

          <form className="hero-search" onSubmit={handleSubmitSearch}>
            <label className="sr-only" htmlFor="hero-destination-search">
              输入城市或省份
            </label>
            <input
              id="hero-destination-search"
              name="destination"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="输入城市或省份，例如：成都、云南、新疆"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit">地点探索</button>
          </form>

          <div className="hero-status-row" aria-label="地图状态">
            <span>默认视角：中国全景</span>
            <span>地形底座：真实高程</span>
            <span>影像：{imageryStatus}</span>
            <span>搜索：{searchStatus}</span>
            <span>精细地点：{finePoiStatus}</span>
          </div>

          {supportNote && <p className="hero-note">{supportNote}</p>}
        </div>
      </section>

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
