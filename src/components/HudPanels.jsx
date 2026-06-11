export function HudPanels({
  trail,
  cameraMode,
  setCameraMode,
  reset,
  goToTrail,
  detailEntryEnabled = false,
  onEnterDetailMap,
}) {
  return (
    <section className="hud hero-controls" aria-label="地图控制">
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
        <button type="button" className={cameraMode === "tilt" ? "is-active" : ""} onClick={() => setCameraMode("tilt")}>
          轻倾斜
        </button>
        {detailEntryEnabled && (
          <button type="button" onClick={onEnterDetailMap}>
            进入高德细节图
          </button>
        )}
        <button type="button" onClick={reset}>
          全国
        </button>
      </div>
    </section>
  );
}
