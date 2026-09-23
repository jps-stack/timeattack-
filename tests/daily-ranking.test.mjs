import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  EVENT_TIME_ZONE,
  getDailyLeaderboard,
  getDailyRank,
  getEventDayKey
} from "../assets/daily-ranking.js";

const today = Date.parse("2026-09-22T18:00:00.000Z");
const root = new URL("../", import.meta.url);

function finishedPilot(index, timeMs, updatedAt = today) {
  return {
    id: `pilot-${index}`,
    firstName: `Piloto ${index}`,
    status: "finished",
    timeMs,
    updatedAt
  };
}

test("el día del evento usa la zona horaria de Costa Rica", () => {
  assert.equal(EVENT_TIME_ZONE, "America/Costa_Rica");
  assert.equal(getEventDayKey(Date.parse("2026-09-22T05:59:59.000Z")), "2026-09-21");
  assert.equal(getEventDayKey(Date.parse("2026-09-22T06:00:00.000Z")), "2026-09-22");
});

test("el ranking diario solo incluye tiempos válidos registrados hoy", () => {
  const yesterday = Date.parse("2026-09-21T18:00:00.000Z");
  const participants = [
    finishedPilot(1, 92_500),
    finishedPilot(2, 91_000),
    finishedPilot(3, 80_000, yesterday),
    { ...finishedPilot(4, 70_000), status: "queued" }
  ];

  assert.deepEqual(
    getDailyLeaderboard(participants, today).map((participant) => participant.id),
    ["pilot-2", "pilot-1"]
  );
});

test("informa con exactitud quién entra y quién queda fuera del Top 10", () => {
  const participants = Array.from({ length: 11 }, (_, index) =>
    finishedPilot(index + 1, 80_000 + index * 1_000, today + index)
  );

  assert.deepEqual(getDailyRank(participants, "pilot-10", today), {
    rank: 10,
    inTopTen: true,
    total: 11
  });
  assert.deepEqual(getDailyRank(participants, "pilot-11", today), {
    rank: 11,
    inTopTen: false,
    total: 11
  });
});

test("Staff muestra el Top 10 del día y explica la posición al guardar", async () => {
  const [html, admin, api, server] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("assets/admin-ta-v12.js", root), "utf8"),
    readFile(new URL("netlify/functions/api.mjs", root), "utf8"),
    readFile(new URL("server.mjs", root), "utf8")
  ]);

  assert.ok(html.includes("/assets/index-ta-v12.js"));
  assert.ok(admin.includes("Top 10 de hoy"));
  assert.ok(admin.includes("entró al Top 10 de hoy"));
  assert.ok(admin.includes("fuera del Top 10 de hoy"));
  assert.ok(admin.includes("buildDailyLeaderboard"));
  assert.ok(api.includes("inDailyTopTen"));
  assert.ok(server.includes("inDailyTopTen"));
});
