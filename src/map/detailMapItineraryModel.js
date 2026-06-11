export function normalizePlanDays(response) {
  const days = response?.itinerary?.days || [];
  const activeDay = days[0]?.day || 1;
  return { days, activeDay };
}

export function selectDayFromPlan({ requestedDay, days }) {
  return days.find((day) => day.day === requestedDay)?.day || days[0]?.day || 1;
}

export function buildDetailMapOverlayModel({ activeDay, days }) {
  const day = days.find((item) => item.day === activeDay) || days[0] || { stops: [], legs: [] };
  return {
    markers: day.stops.map((stop, index) => ({
      stopId: stop.stop_id,
      center: stop.center,
      indexLabel: String(index + 1),
      timeLabel: `${stop.arrival_time}-${stop.departure_time}`,
      name: stop.name,
    })),
    legs: day.legs.map((leg) => ({
      legId: leg.leg_id,
      fromStopId: leg.from_stop_id,
      toStopId: leg.to_stop_id,
      status: leg.status,
      polyline: leg.polyline || [],
      label: leg.duration_minutes ? `${leg.mode_label} ${leg.duration_minutes} min` : `${leg.mode_label} unavailable`,
    })),
  };
}
