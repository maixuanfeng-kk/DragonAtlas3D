import { TravelPlannerDayTabs } from "./TravelPlannerDayTabs.jsx";
import { TravelPlannerDayTimeline } from "./TravelPlannerDayTimeline.jsx";

const INTEREST_TAG_OPTIONS = [
  { id: "sightseeing", label: "Sightseeing" },
  { id: "food", label: "Food" },
  { id: "street", label: "Street" },
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
  detailMode = false,
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
  onSelectDay,
  onSelectStop,
  onSelectLeg,
}) {
  const sourceStatuses = planState.sourceStatus.length ? planState.sourceStatus : clarifyState.sourceStatus;
  const uncertainty = planState.uncertainty || clarifyState.uncertainty;
  const activeDayPlan = planState.days.find((day) => day.day === planState.activeDay) || planState.days[0] || null;

  return (
    <section className={detailMode ? "planner-panel planner-panel-detail" : "hud planner-panel"}>
      <div className="planner-head">
        <div>
          <p className="panel-title">Wuhan Travel Agent</p>
          <h2>City itinerary planner</h2>
        </div>
        <button type="button" className="planner-add" onClick={addCurrentSelection} disabled={!currentCandidate}>
          Add current place
        </button>
      </div>

      <div className="planner-block">
        <strong>Selected places</strong>
        <div className="planner-chip-row">
          {selectedNodes.length ? (
            selectedNodes.map((node) => (
              <button key={node.id} type="button" className="planner-chip" onClick={() => removeSelection(node.id)}>
                {node.name}
              </button>
            ))
          ) : (
            <span className="planner-empty">Select city places on the map first, then add them into the itinerary set.</span>
          )}
        </div>
      </div>

      <div className="planner-grid">
        <label>
          Days
          <select value={tripDays} onChange={(event) => setTripDays(Number(event.target.value))}>
            <option value={3}>3 days</option>
            <option value={4}>4 days</option>
            <option value={5}>5 days</option>
          </select>
        </label>

        <label>
          Rhythm
          <select value={dayOrNightPreference} onChange={(event) => setDayOrNightPreference(event.target.value)}>
            <option value="day">Day</option>
            <option value="night">Night</option>
            <option value="balanced">Balanced</option>
          </select>
        </label>
      </div>

      <div className="planner-block">
        <strong>Interest tags</strong>
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
          {clarifyState.status === "pending" ? "Clarifying..." : "Generate questions"}
        </button>
        <button type="button" onClick={handlePlan} disabled={selectedNodes.length < 2 || planState.status === "pending"}>
          {planState.status === "pending" ? "Planning..." : "Generate plan"}
        </button>
        <button type="button" onClick={clearSelection} disabled={!selectedNodes.length}>
          Clear
        </button>
      </div>

      {planState.answer && (
        <div className="planner-block">
          <strong>Plan summary</strong>
          <p className="planner-copy">{planState.answer}</p>
          <p className="planner-copy is-muted">{planState.selectedReasoning}</p>
        </div>
      )}

      {planState.days.length > 0 && (
        <div className="planner-block">
          <strong>{planState.itinerary?.title || "Itinerary"}</strong>
          <TravelPlannerDayTabs days={planState.days} activeDay={planState.activeDay} onSelectDay={onSelectDay} />
          <TravelPlannerDayTimeline
            day={activeDayPlan}
            activeStopId={planState.activeStopId}
            activeLegId={planState.activeLegId}
            onSelectStop={onSelectStop}
            onSelectLeg={onSelectLeg}
          />
        </div>
      )}

      {clarifyState.questions.length > 0 && (
        <div className="planner-block">
          <strong>Current questions</strong>
          <ul className="planner-list">
            {clarifyState.questions.map((question) => (
              <li key={question.id}>{question.label}</li>
            ))}
          </ul>
        </div>
      )}

      {sourceStatuses.length > 0 && (
        <div className="planner-block">
          <strong>Source status</strong>
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
          <strong>Uncertainty</strong>
          <span>{uncertainty.message}</span>
          {uncertainty.items?.map((item) => (
            <small key={item}>{item}</small>
          ))}
        </div>
      )}

      {(clarifyState.error || planState.error) && (
        <div className="source-note is-failed">
          <strong>Request error</strong>
          <span>{planState.error || clarifyState.error}</span>
        </div>
      )}
    </section>
  );
}
