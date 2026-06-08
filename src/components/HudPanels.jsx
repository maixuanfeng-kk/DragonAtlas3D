import { datavBoundaryUrl } from "../map/dataSources.js";
import { childLevelName, levelName, sourceStatusText, sourceUrlForNode } from "../map/viewState.js";

export function HudPanels({
  trail,
  cameraMode,
  setCameraMode,
  currentFeatures,
  search,
  setSearch,
  handleSubmitSearch,
  panelNode,
  currentNode,
  stats,
  poiSearchState,
  residentialLayerState,
  handleCopyApi,
  reset,
  goToTrail,
}) {
  const panelApi = panelNode.level === currentNode.level ? sourceUrlForNode(currentNode, true) : sourceUrlForNode(panelNode, true);
  const boundarySourceLabel = currentNode.level === "district" ? "街道/乡镇边界：china_geo_data 公共 GeoJSON 目录" : "行政区边界：DataV areas_v3 GeoJSON API";
  const boundarySourceNote =
    currentNode.level === "district"
      ? "当前区级场景直接展示街道/乡镇边界；DataV 不提供该区的下一级完整集合接口，所以这里显示的是街道公共数据目录。"
      : "影像底图：";

  return (
    <>
      <section className="hud atlas-panel">
        <div className="brand-row">
          <div>
            <p className="eyebrow">DATAV GEOATLAS + AMAP RESIDENTIAL SEARCH</p>
            <h1>中国真实高程地图</h1>
          </div>
          <button type="button" className="icon-button" onClick={reset} title="返回全国">
            全国
          </button>
        </div>

        <nav className="crumbs" aria-label="行政区划层级">
          {trail.map((item, index) => (
            <button key={`${item.level}-${item.adcode}`} type="button" onClick={() => goToTrail(index)}>
              {item.name}
            </button>
          ))}
        </nav>

        <form className="search-row" onSubmit={handleSubmitSearch}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`先搜${childLevelName(currentFeatures.map((item) => item.feature))}，再 fallback 到高德小区`}
          />
          <button type="submit">定位</button>
        </form>

        <div className="mode-row">
          <button type="button" className={cameraMode === "top" ? "is-active" : ""} onClick={() => setCameraMode("top")}>
            俯视
          </button>
          <button type="button" className={cameraMode === "tilt" ? "is-active" : ""} onClick={() => setCameraMode("tilt")}>
            轻微倾斜
          </button>
        </div>
      </section>

      <section className="hud data-panel">
        <p className="panel-title">当前选择</p>
        <div className="selected-name">{panelNode.fullName || panelNode.name}</div>
        <dl>
          <div>
            <dt>adcode</dt>
            <dd>{panelNode.adcode}</dd>
          </div>
          <div>
            <dt>层级</dt>
            <dd>{levelName(panelNode.level)}</dd>
          </div>
          <div>
            <dt>数据粒度</dt>
            <dd>{childLevelName(currentFeatures.map((item) => item.feature))}</dd>
          </div>
          <div>
            <dt>最高海拔</dt>
            <dd>{stats.maxElevation.toLocaleString()} m</dd>
          </div>
          <div>
            <dt>DEM</dt>
            <dd>z{stats.demZoom} / {stats.tiles} tiles</dd>
          </div>
          <div>
            <dt>免费影像</dt>
            <dd>{sourceStatusText(stats.imagery.status)}</dd>
          </div>
          <div>
            <dt>影像来源</dt>
            <dd title={stats.imagery.label}>{stats.imagery.label}</dd>
          </div>
          <div>
            <dt>影像瓦片</dt>
            <dd>
              z{stats.rasterZoom} / {stats.imagery.loaded}/{stats.imagery.requested}
            </dd>
          </div>
        </dl>

        <div className={`source-note is-${stats.imagery.status}`}>
          <strong>{boundarySourceLabel}</strong>
          <span>{boundarySourceNote}{currentNode.level === "district" ? "" : `${stats.imagery.label}，无 key；不使用 Bing/Azure，也不做自动兜底。`}</span>
          {currentNode.level === "district" && <small>影像底图：{stats.imagery.label}，无 key；不使用 Bing/Azure，也不做自动兜底。</small>}
          <small>{stats.imagery.attribution}</small>
          {stats.imagery.error && <small>影像错误：{stats.imagery.error}</small>}
        </div>

        <div className={`source-note is-${poiSearchState.status}`}>
          <strong>小区搜索：{poiSearchState.label}</strong>
          <span>当前区域：{poiSearchState.regionLabel}。该能力需要高德 Web 服务 key，你已显式批准接入。</span>
          <small>{poiSearchState.note}</small>
          {poiSearchState.query && <small>最近查询：{poiSearchState.query}，结果 {poiSearchState.resultCount} 条</small>}
          {poiSearchState.error && <small>搜索状态：{poiSearchState.error}</small>}
        </div>

        <div className={`source-note is-${residentialLayerState.status}`}>
          <strong>自动小区层：{residentialLayerState.label}</strong>
          <span>当前区域：{residentialLayerState.regionLabel}。缩放到足够近后按当前视野自动加载，不需要先搜索。</span>
          <small>{residentialLayerState.note}</small>
          {residentialLayerState.resultCount > 0 && <small>当前视野结果：{residentialLayerState.resultCount} 条</small>}
          {residentialLayerState.error && <small>图层状态：{residentialLayerState.error}</small>}
        </div>

        <label className="api-box">
          GeoJSON API
          <textarea readOnly value={panelApi} />
        </label>
        <button type="button" className="copy-button" onClick={handleCopyApi}>
          复制 API
        </button>
      </section>

      <section className="hud stats-panel">
        <div>
          <span>地形网格</span>
          <strong>{stats.cells.toLocaleString()}</strong>
        </div>
        <div>
          <span>行政区</span>
          <strong>{stats.featureCount}</strong>
        </div>
      </section>
    </>
  );
}
