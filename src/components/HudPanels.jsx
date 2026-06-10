import { levelName, sourceStatusText } from "../map/viewState.js";

const NUMBER_FORMAT = new Intl.NumberFormat("zh-CN");

function CompactStatus({ label, value, tone = "normal" }) {
  return (
    <div className={`compact-status is-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function HudPanels({
  trail,
  cameraMode,
  setCameraMode,
  panelNode,
  stats,
  poiSearchState,
  residentialLayerState,
  handleCopyApi,
  reset,
  goToTrail,
}) {
  const selectedName = panelNode?.fullName || panelNode?.name || "中华人民共和国";
  const selectedLevel = levelName(panelNode?.level || "country");
  const imageryState = `${sourceStatusText(stats.imagery.status)} / ${stats.imagery.label}`;
  const destinationState =
    poiSearchState.status === "failed"
      ? "全国搜索受限"
      : poiSearchState.query
        ? `${poiSearchState.query} / ${sourceStatusText(poiSearchState.status)}`
        : "等待输入目的地";
  const detailState =
    residentialLayerState.status === "failed"
      ? "精细地点层未启用"
      : residentialLayerState.resultCount > 0
        ? `${residentialLayerState.resultCount} 个精细地点`
        : sourceStatusText(residentialLayerState.status);
  const detailNote = residentialLayerState.error || residentialLayerState.note;

  return (
    <>
      <section className="hud hero-controls">
        <nav className="trail-dock" aria-label="行政路径">
          {trail.map((item, index) => (
            <button
              key={`${item.level}-${item.adcode}`}
              type="button"
              className={index === trail.length - 1 ? "is-current" : ""}
              onClick={() => goToTrail(index)}
              aria-current={index === trail.length - 1 ? "page" : undefined}
            >
              {item.name}
            </button>
          ))}
        </nav>

        <div className="mode-dock" aria-label="视角控制">
          <button type="button" className={cameraMode === "top" ? "is-active" : ""} onClick={() => setCameraMode("top")}>
            俯视
          </button>
          <button
            type="button"
            className={cameraMode === "tilt" ? "is-active" : ""}
            onClick={() => setCameraMode("tilt")}
          >
            轻倾斜
          </button>
          <button type="button" onClick={reset}>
            全国
          </button>
        </div>
      </section>

      <section className="hud info-dock" aria-label="当前地图状态">
        <div className="info-dock-header">
          <div>
            <p className="panel-title">当前落点</p>
            <h2>{selectedName}</h2>
          </div>
          <button type="button" className="ghost-button" onClick={handleCopyApi}>
            复制 API
          </button>
        </div>

        <div className="selected-meta">
          <span>{selectedLevel}</span>
          <span>{panelNode?.adcode || "100000"}</span>
        </div>

        <div className="compact-grid">
          <CompactStatus label="最高海拔" value={`${NUMBER_FORMAT.format(stats.maxElevation)} m`} />
          <CompactStatus label="地形网格" value={NUMBER_FORMAT.format(stats.cells)} />
          <CompactStatus label="影像状态" value={imageryState} tone={stats.imagery.status} />
          <CompactStatus label="目的地搜索" value={destinationState} tone={poiSearchState.status} />
          <CompactStatus label="精细地点" value={detailState} tone={residentialLayerState.status} />
          <CompactStatus label="DEM" value={`z${stats.demZoom} / ${stats.tiles} tiles`} />
        </div>

        {detailNote && <p className="panel-note">{detailNote}</p>}
      </section>
    </>
  );
}
