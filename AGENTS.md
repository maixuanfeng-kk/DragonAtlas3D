# DragonAtlas3D Agent Instructions

## Product North Star

DragonAtlas3D is not merely a 3D China map. The long-term product goal is a China travel agent: an intelligent travel-planning experience that helps users explore places, understand destinations, compare options, and plan trips across China.

The current 3D China terrain page is a frontend geography foundation for that travel agent. It should support future travel-agent capabilities such as city exploration, scenic spots, routes, weather, transport, lodging context, local recommendations, POI search, and precise place lookup.

Always judge map, UI, data, and architecture changes by whether they help the larger China travel-agent product. A visually impressive map is not enough if it does not support accurate travel exploration and decision-making.

## Non-Negotiable Rules

- Do not add silent or automatic fallback strategies. If a data source fails, surface the failure in the UI or final report; do not switch to another provider without explicit user approval.
- Do not hide uncertainty. If data is partial, stale, approximate, simulated, unavailable, rate-limited, or failed, make that status visible.
- Do not introduce paid, account-gated, token-gated, or key-required services unless the user explicitly approves that provider and supplies the required key.
- Do not use Bing Maps, Azure Maps, Mapbox, Google Maps, or similar key-required providers by default.
- Never fake "real elevation", "real imagery", "real-time data", POI data, address data, traffic data, weather data, or travel recommendations with procedural placeholders unless the UI labels it as simulated and the user has approved that mode.
- Do not let a single source file exceed 400 lines. If a change would push a file beyond 400 lines, split the code into clear modules before or as part of that change.

## Data Source Standards

Data quality is a core product requirement. Prefer data sources that are:

- useful in actual travel workflows;
- free or no-cost for the current prototype;
- accurate enough for user-facing travel decisions;
- as real-time or frequently updated as the use case requires;
- transparent about provenance, coverage, update frequency, terms, attribution, limits, and failure modes.

Before adding or replacing any map, DEM, imagery, administrative boundary, river, weather, transport, POI, address, geocoding, hotel, scenic-spot, routing, traffic, event, or travel-content source:

- explain what the source provides;
- state whether it is free, no-key, account-gated, rate-limited, attribution-required, or commercially restricted;
- state expected accuracy, coverage, freshness, and known gaps;
- state exactly how failures will be shown;
- get explicit user approval if the source requires a key, account, payment, commercial terms, or a major product-direction tradeoff.

## Current Data Contracts

- DataV `areas_v3` is for administrative GeoJSON boundaries and selector-style hierarchy only.
- DataV website pages are references for interaction style, not imagery or terrain sources.
- Terrarium DEM tiles are for elevation.
- ArcGIS World Imagery is the current no-key imagery layer.
- ArcGIS World Hillshade is the current no-key hillshade layer.
- Each network-backed layer must expose an explicit status such as `pending`, `ready`, `partial`, or `failed`.

## UX Direction

- The map page must serve the China travel-agent product, not become an isolated map demo.
- Preserve top-down default China cover, zoom/pan-first exploration, restrained tilt toggle, and no uncontrolled free rotation unless the user explicitly changes this direction.
- Do not reintroduce automatic drill-in behavior or unexpected camera jumps. Zoom-level detail loading is allowed; forced navigation is not.
- Province, city, district, township, river, imagery, terrain, POI, and travel layers should appear progressively by zoom/context while keeping the map readable.
- Data-source status, selected region, API/source information, and user-relevant travel context should be visible and understandable.

## Code Organization

- Keep code clear, simple, and modular. Prefer small focused files over large mixed-responsibility files.
- No source file may exceed 400 lines.
- If a file approaches 400 lines, extract cohesive modules rather than appending more logic.
- Prefer existing project patterns before introducing new abstractions.
- Keep source metadata and loaders close to `src/map/dataSources.js` or a dedicated domain data-source module.
- Keep terrain/mesh generation in terrain-focused modules.
- Keep UI components, panels, and interaction handlers separated when they become non-trivial.
- Do not add large GIS frameworks or heavy dependencies unless the user approves the tradeoff.

## Validation

- Run `npm run build` after code changes.
- For frontend/map changes, verify `http://127.0.0.1:5174/` in the browser when the dev server is available.
- Before finishing, report active data sources and whether any source failed, partially loaded, was stale, or was simulated.
- For data-source changes, verify the provider URL or documented API behavior when practical, and cite or record the source details in code/UI/docs.
