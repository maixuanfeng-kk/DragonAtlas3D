function stopMarkerHtml(item, isActive) {
  return `
    <div class="amap-itinerary-stop ${isActive ? "is-active" : ""}">
      <span class="amap-itinerary-stop-index">${item.indexLabel}</span>
      <span class="amap-itinerary-stop-copy">
        <strong>${item.name || ""}</strong>
        <small>${item.timeLabel || ""}</small>
      </span>
    </div>
  `;
}

function midpoint(path) {
  if (!path.length) {
    return null;
  }
  return path[Math.floor(path.length / 2)];
}

export function mountAmapItineraryOverlay({ AMap, map, overlayModel, activeStopId, activeLegId, onStopSelect, onLegSelect }) {
  const markers = overlayModel.markers.map((item) => {
    const marker = new AMap.Marker({
      position: item.center,
      content: stopMarkerHtml(item, item.stopId === activeStopId),
      anchor: "bottom-left",
      offset: new AMap.Pixel(-10, -12),
      zIndex: item.stopId === activeStopId ? 190 : 150,
    });
    marker.on("click", () => onStopSelect?.(item.stopId));
    marker.setMap(map);
    return marker;
  });

  const polylines = [];
  const labels = [];

  overlayModel.legs.forEach((item) => {
    if (item.polyline.length > 1) {
      const line = new AMap.Polyline({
        path: item.polyline,
        strokeColor: item.legId === activeLegId ? "#f2a93b" : item.status === "failed" ? "#b85c38" : "#236a57",
        strokeWeight: item.legId === activeLegId ? 8 : 6,
        strokeOpacity: 0.92,
        lineJoin: "round",
        lineCap: "round",
        zIndex: item.legId === activeLegId ? 160 : 120,
      });
      line.on("click", () => onLegSelect?.(item.legId));
      line.setMap(map);
      polylines.push(line);
    }

    const labelPoint = midpoint(item.polyline);
    if (labelPoint) {
      const label = new AMap.Marker({
        position: labelPoint,
        anchor: "center",
        zIndex: 140,
        content: `<button class="amap-itinerary-leg ${item.legId === activeLegId ? "is-active" : ""} ${item.status === "failed" ? "is-failed" : ""}">${item.label}</button>`,
      });
      label.on("click", () => onLegSelect?.(item.legId));
      label.setMap(map);
      labels.push(label);
    }
  });

  return () => {
    markers.forEach((marker) => marker.setMap(null));
    polylines.forEach((line) => line.setMap(null));
    labels.forEach((label) => label.setMap(null));
  };
}
