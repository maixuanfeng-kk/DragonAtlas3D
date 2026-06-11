export function TravelPlannerDayTabs({ days, activeDay, onSelectDay }) {
  if (!days.length) {
    return null;
  }

  return (
    <div className="planner-day-tabs">
      {days.map((day) => (
        <button key={day.day} type="button" className={day.day === activeDay ? "is-active" : ""} onClick={() => onSelectDay(day.day)}>
          Day {day.day}
        </button>
      ))}
    </div>
  );
}
