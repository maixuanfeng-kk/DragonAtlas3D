export function DetailMapPrompt({ currentNode, onEnter, onDismiss }) {
  const title =
    currentNode?.level === "country"
      ? "当前街区"
      : currentNode?.fullName || currentNode?.name || "当前地区";

  return (
    <aside className="detail-map-prompt" role="dialog" aria-live="polite" aria-label="进入高德细节图">
      <p className="detail-map-prompt-kicker">STREET DETAIL READY</p>
      <h2>{title} 已进入街区尺度</h2>
      <p>
        当前 3D 地形已经足够聚焦。点击进入全屏高德细节图，直接查看道路、地铁、学校、医院、商圈与周边地点。
      </p>
      <div className="detail-map-prompt-actions">
        <button type="button" className="detail-map-prompt-primary" onClick={onEnter}>
          进入高德细节图
        </button>
        <button type="button" className="detail-map-prompt-secondary" onClick={onDismiss}>
          先留在地形
        </button>
      </div>
    </aside>
  );
}
