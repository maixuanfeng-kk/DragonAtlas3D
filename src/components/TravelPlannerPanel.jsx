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

export function TravelPlannerPanel({
  currentCandidate,
  selectedNodes,
  tripDays,
  setTripDays,
  dayOrNightPreference,
  setDayOrNightPreference,
  interestTags,
  setInterestTags,
  clarifyState,
  planState,
  addCurrentSelection,
  removeSelection,
  clearSelection,
  handleClarify,
  handlePlan,
}) {
  const sourceStatuses = planState.sourceStatus.length ? planState.sourceStatus : clarifyState.sourceStatus;
  const uncertainty = planState.uncertainty || clarifyState.uncertainty;

  return (
    <section className="hud planner-panel">
      <div className="planner-head">
        <div>
          <p className="panel-title">武汉 Travel Agent</p>
          <h2>旅游路线生成</h2>
        </div>
        <button type="button" className="planner-add" onClick={addCurrentSelection} disabled={!currentCandidate}>
          加入当前选择
        </button>
      </div>

      <div className="planner-block">
        <strong>已选节点</strong>
        <div className="planner-chip-row">
          {selectedNodes.length ? (
            selectedNodes.map((node) => (
              <button key={node.id} type="button" className="planner-chip" onClick={() => removeSelection(node.id)}>
                {node.name}
              </button>
            ))
          ) : (
            <span className="planner-empty">先在地图上点选武汉相关区域或点位，再加入行程。</span>
          )}
        </div>
      </div>

      <div className="planner-grid">
        <label>
          天数
          <select value={tripDays} onChange={(event) => setTripDays(Number(event.target.value))}>
            <option value={3}>3 天</option>
            <option value={4}>4 天</option>
            <option value={5}>5 天</option>
          </select>
        </label>

        <label>
          节奏
          <select value={dayOrNightPreference} onChange={(event) => setDayOrNightPreference(event.target.value)}>
            <option value="day">偏白天</option>
            <option value="night">偏夜游</option>
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
              className={interestTags.includes(option.id) ? "planner-chip is-active" : "planner-chip"}
              onClick={() => toggleTag(interestTags, option.id, setInterestTags)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="planner-actions">
        <button type="button" onClick={handleClarify} disabled={!selectedNodes.length || clarifyState.status === "pending"}>
          {clarifyState.status === "pending" ? "追问中..." : "生成追问"}
        </button>
        <button type="button" onClick={handlePlan} disabled={!selectedNodes.length || planState.status === "pending"}>
          {planState.status === "pending" ? "生成中..." : "生成方案"}
        </button>
        <button type="button" onClick={clearSelection} disabled={!selectedNodes.length}>
          清空
        </button>
      </div>

      {clarifyState.questions.length > 0 && (
        <div className="planner-block">
          <strong>当前追问</strong>
          <ul className="planner-list">
            {clarifyState.questions.map((question) => (
              <li key={question.id}>{question.label}</li>
            ))}
          </ul>
        </div>
      )}

      {planState.answer && (
        <div className="planner-block">
          <strong>推荐说明</strong>
          <p className="planner-copy">{planState.answer}</p>
          <p className="planner-copy is-muted">{planState.selectedReasoning}</p>
        </div>
      )}

      {planState.itinerary?.days?.length > 0 && (
        <div className="planner-block">
          <strong>{planState.itinerary.title}</strong>
          <ul className="planner-list">
            {planState.itinerary.days.map((day) => (
              <li key={day.day}>
                Day {day.day} · {day.summary}
              </li>
            ))}
          </ul>
        </div>
      )}

      {sourceStatuses.length > 0 && (
        <div className="planner-block">
          <strong>来源状态</strong>
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

      {(clarifyState.error || planState.error) && (
        <div className="source-note is-failed">
          <strong>调用错误</strong>
          <span>{planState.error || clarifyState.error}</span>
        </div>
      )}
    </section>
  );
}
