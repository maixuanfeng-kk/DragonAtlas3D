import { useEffect, useState } from "react";
import { fetchCityPoiRecommendations } from "../api/poiClient.js";
import { searchAmapPlace } from "../map/amapSearch.js";
import { TravelPlannerDayTabs } from "./TravelPlannerDayTabs.jsx";
import { TravelPlannerDayTimeline } from "./TravelPlannerDayTimeline.jsx";

const INTEREST_TAG_OPTIONS = [
  { id: "sightseeing", label: "景点" },
  { id: "food", label: "美食" },
  { id: "street", label: "街区" },
];

function toggleTag(tags, tag, setTags) {
  if (tags.includes(tag)) {
    const next = tags.filter((item) => item !== tag);
    setTags(next.length ? next : [tag]);
    return;
  }
  setTags([...tags, tag]);
}

function recommendationTitle(item) {
  const tags = Array.isArray(item.tags) && item.tags.length ? item.tags.join(" / ") : item.category || item.node_type || "推荐地点";
  return `${item.name} · ${tags}`;
}

export function DetailMapPlannerWorkspace({
  viewport,
  planner,
  onPreviewNode,
}) {
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState({ status: "idle", items: [], error: "" });
  const [recommendState, setRecommendState] = useState({ status: "pending", items: [], error: "" });

  const activeDayPlan = planner.planState.days.find((day) => day.day === planner.planState.activeDay) || planner.planState.days[0] || null;
  const sourceStatuses = planner.planState.sourceStatus.length ? planner.planState.sourceStatus : planner.clarifyState.sourceStatus;
  const uncertainty = planner.planState.uncertainty || planner.clarifyState.uncertainty;

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetchCityPoiRecommendations({ city: "wuhan", mappedOnly: true });
        const items = (response.items || []).map((item) => ({
          ...item,
          selectionNode: {
            id: item.id,
            name: item.name,
            node_type: item.node_type,
            center: item.center,
          },
        }));
        setRecommendState({ status: "ready", items, error: "" });
      } catch (error) {
        setRecommendState({
          status: "failed",
          items: [],
          error: error instanceof Error ? error.message : "加载推荐地点失败",
        });
      }
    })();
  }, []);

  useEffect(() => {
    if (planner.selectedNodes.length) {
      onPreviewNode?.(planner.selectedNodes[planner.selectedNodes.length - 1]);
    }
  }, [onPreviewNode, planner.selectedNodes]);

  const handleSearch = async (event) => {
    event.preventDefault();
    const keyword = query.trim();
    if (!keyword) {
      return;
    }

    setSearchState({ status: "pending", items: [], error: "" });
    try {
      const result = await searchAmapPlace(keyword, {
        adcode: viewport?.node?.adcode || "420100",
        label: viewport?.node?.fullName || viewport?.node?.name || "武汉",
      });
      const items = result.features.map((feature) => ({
        id: feature.properties?.amapId || feature.properties?.adcode || feature.properties?.name,
        title: feature.properties?.fullName || feature.properties?.name || keyword,
        subtitle: feature.properties?.address || feature.properties?.categoryLabel || feature.properties?.category || "高德地点",
        feature,
        selectionNode: {
          id: feature.properties?.amapId || feature.properties?.adcode || feature.properties?.name,
          name: feature.properties?.fullName || feature.properties?.name || keyword,
          node_type: feature.properties?.nodeType === "area" ? "area" : "poi",
          center: feature.properties?.center || null,
        },
      }));
      setSearchState({ status: "ready", items, error: items.length ? "" : "高德没有返回可用地点" });
    } catch (error) {
      setSearchState({
        status: "failed",
        items: [],
        error: error instanceof Error ? error.message : "高德地点搜索失败",
      });
    }
  };

  return (
    <aside className="planner-panel planner-panel-detail" aria-label="旅行规划工作台">
      <div className="planner-head planner-head-detail">
        <div>
          <p className="panel-title">Wuhan Travel Agent</p>
          <h2>高德细节规划</h2>
        </div>
      </div>

      <form className="planner-search-form" onSubmit={handleSearch}>
        <label className="sr-only" htmlFor="detail-place-search">
          输入景点、酒店、车站或商圈
        </label>
        <input
          id="detail-place-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="输入景点 / 酒店 / 车站 / 商圈"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" disabled={searchState.status === "pending"}>
          {searchState.status === "pending" ? "搜索中" : "搜索地点"}
        </button>
      </form>

      <div className="planner-block">
        <strong>已选行程点</strong>
        <div className="planner-chip-row">
          {planner.selectedNodes.length ? (
            planner.selectedNodes.map((node) => (
              <button key={node.id} type="button" className="planner-chip" onClick={() => planner.removeSelection(node.id)}>
                {node.name}
              </button>
            ))
          ) : (
            <span className="planner-empty">先在高德细节图里搜索或点击推荐地点，再生成路线。</span>
          )}
        </div>
      </div>

      {searchState.items.length > 0 && (
        <div className="planner-block">
          <strong>高德搜索结果</strong>
          <div className="planner-result-list">
            {searchState.items.map((item) => (
              <article key={item.id} className="planner-result-card">
                <button
                  type="button"
                  className="planner-result-copy"
                  onClick={() => onPreviewNode?.(item.selectionNode)}
                >
                  <strong>{item.title}</strong>
                  <span>{item.subtitle}</span>
                </button>
                <button type="button" className="planner-result-action" onClick={() => planner.addCurrentSelection(item.feature || item.selectionNode)}>
                  加入行程
                </button>
              </article>
            ))}
          </div>
          {searchState.error && <p className="planner-copy is-muted">{searchState.error}</p>}
        </div>
      )}

      <div className="planner-block">
        <strong>规划推荐</strong>
        <div className="planner-result-list">
          {recommendState.items.map((item) => (
            <article key={item.id} className="planner-result-card">
              <button type="button" className="planner-result-copy" onClick={() => onPreviewNode?.(item.selectionNode)}>
                <strong>{item.name}</strong>
                <span>{recommendationTitle(item)}</span>
              </button>
              <button type="button" className="planner-result-action" onClick={() => planner.addCurrentSelection(item.selectionNode)}>
                加入行程
              </button>
            </article>
          ))}
        </div>
        {recommendState.status === "failed" && <p className="planner-copy is-muted">{recommendState.error}</p>}
      </div>

      <div className="planner-grid">
        <label>
          天数
          <select value={planner.tripDays} onChange={(event) => planner.setTripDays(Number(event.target.value))}>
            <option value={1}>1 天</option>
            <option value={2}>2 天</option>
            <option value={3}>3 天</option>
          </select>
        </label>

        <label>
          节奏
          <select value={planner.dayOrNightPreference} onChange={(event) => planner.setDayOrNightPreference(event.target.value)}>
            <option value="day">白天优先</option>
            <option value="night">夜游优先</option>
            <option value="balanced">均衡</option>
          </select>
        </label>
      </div>

      <div className="planner-block">
        <strong>偏好标签</strong>
        <div className="planner-chip-row">
          {INTEREST_TAG_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={planner.interestTags.includes(option.id) ? "planner-chip is-active" : "planner-chip"}
              onClick={() => toggleTag(planner.interestTags, option.id, planner.setInterestTags)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="planner-actions">
        <button type="button" onClick={planner.handleClarify} disabled={planner.selectedNodes.length < 2 || planner.clarifyState.status === "pending"}>
          {planner.clarifyState.status === "pending" ? "追问中" : "生成追问"}
        </button>
        <button type="button" onClick={planner.handlePlan} disabled={planner.selectedNodes.length < 2 || planner.planState.status === "pending"}>
          {planner.planState.status === "pending" ? "规划中" : "生成方案"}
        </button>
        <button type="button" onClick={planner.clearSelection} disabled={!planner.selectedNodes.length}>
          清空
        </button>
      </div>

      {planner.planState.answer && (
        <div className="planner-block">
          <strong>行程摘要</strong>
          <p className="planner-copy">{planner.planState.answer}</p>
          <p className="planner-copy is-muted">{planner.planState.selectedReasoning}</p>
        </div>
      )}

      {planner.planState.days.length > 0 && (
        <div className="planner-block">
          <strong>{planner.planState.itinerary?.title || "路线方案"}</strong>
          <TravelPlannerDayTabs days={planner.planState.days} activeDay={planner.planState.activeDay} onSelectDay={planner.setActiveDay} />
          <TravelPlannerDayTimeline
            day={activeDayPlan}
            activeStopId={planner.planState.activeStopId}
            activeLegId={planner.planState.activeLegId}
            onSelectStop={planner.setActiveStopId}
            onSelectLeg={planner.setActiveLegId}
          />
        </div>
      )}

      {sourceStatuses.length > 0 && (
        <div className="planner-block">
          <strong>数据源状态</strong>
          <div className="planner-source-list">
            {sourceStatuses.map((item) => (
              <div key={item.source_id} className={`source-note is-${item.status}`}>
                <strong>{item.source_label}</strong>
                <span>{item.coverage_note || item.provenance}</span>
                {item.error && <small>{item.error}</small>}
              </div>
            ))}
          </div>
        </div>
      )}

      {uncertainty && (
        <div className={`source-note is-${uncertainty.level}`}>
          <strong>不确定性</strong>
          <span>{uncertainty.message}</span>
          {uncertainty.items?.map((item) => (
            <small key={item}>{item}</small>
          ))}
        </div>
      )}

      {(planner.clarifyState.error || planner.planState.error) && (
        <div className="source-note is-failed">
          <strong>请求错误</strong>
          <span>{planner.planState.error || planner.clarifyState.error}</span>
        </div>
      )}
    </aside>
  );
}
