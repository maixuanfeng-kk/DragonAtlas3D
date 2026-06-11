export function TravelPlannerDayTimeline({ day, activeStopId, activeLegId, onSelectStop, onSelectLeg }) {
  if (!day) {
    return null;
  }

  return (
    <div className="planner-day-timeline">
      {day.stops.map((stop, index) => (
        <section key={stop.stop_id} className={stop.stop_id === activeStopId ? "planner-stop-card is-active" : "planner-stop-card"}>
          <button type="button" className="planner-stop-button" onClick={() => onSelectStop(stop.stop_id)}>
            <span className="planner-stop-index">{index + 1}</span>
            <span className="planner-stop-copy">
              <strong>{stop.name}</strong>
              <small>
                {stop.arrival_time} - {stop.departure_time}
              </small>
              <em>{stop.reason}</em>
            </span>
          </button>

          {day.legs[index] && (
            <button
              type="button"
              className={day.legs[index].leg_id === activeLegId ? "planner-leg-card is-active" : "planner-leg-card"}
              onClick={() => onSelectLeg(day.legs[index].leg_id)}
            >
              <strong>{day.legs[index].mode_label}</strong>
              <span>{day.legs[index].duration_minutes ? `${day.legs[index].duration_minutes} min` : "Unavailable"}</span>
              <small>{day.legs[index].status}</small>
            </button>
          )}
        </section>
      ))}
    </div>
  );
}
