export function collectSceneLabelItems({
  labelItems = [],
  tributaryRiverLayer = { labels: [] },
  cityDetailLayer = { labels: [] },
  districtDetailLayer = { labels: [] },
  townshipDetailLayer = { labels: [] },
  residentialLayer = { labels: [] },
  travelNodeLayer = { labels: [] },
  poiLayer = { labels: [] },
}) {
  return [
    ...labelItems,
    ...tributaryRiverLayer.labels,
    ...cityDetailLayer.labels,
    ...districtDetailLayer.labels,
    ...townshipDetailLayer.labels,
    ...residentialLayer.labels,
    ...travelNodeLayer.labels,
    ...poiLayer.labels,
  ];
}
