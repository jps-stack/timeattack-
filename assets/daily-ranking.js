export const EVENT_TIME_ZONE = "America/Costa_Rica";

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export function getEventDayKey(timestamp) {
  if (!Number.isFinite(timestamp)) return "";
  const parts = Object.fromEntries(
    dayFormatter
      .formatToParts(new Date(timestamp))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getDailyLeaderboard(participants, now = Date.now()) {
  const today = getEventDayKey(now);
  return participants
    .filter(
      (participant) =>
        participant.status === "finished" &&
        Number.isFinite(participant.timeMs) &&
        getEventDayKey(participant.updatedAt) === today
    )
    .sort(
      (left, right) =>
        left.timeMs - right.timeMs ||
        (left.updatedAt ?? 0) - (right.updatedAt ?? 0) ||
        String(left.id).localeCompare(String(right.id))
    );
}

export function getDailyRank(participants, participantId, now = Date.now()) {
  const leaderboard = getDailyLeaderboard(participants, now);
  const index = leaderboard.findIndex((participant) => participant.id === participantId);
  const rank = index === -1 ? null : index + 1;
  return {
    rank,
    inTopTen: rank !== null && rank <= 10,
    total: leaderboard.length
  };
}
