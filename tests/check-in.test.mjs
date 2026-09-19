import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { transitionParticipantStatus } from "../netlify/lib/domain.mjs";

const root = new URL("../", import.meta.url);

const queuedPilot = {
  id: "pilot-1",
  firstName: "Ana",
  status: "queued",
  queuedAt: 1_000,
  updatedAt: 1_000
};

test("el check-in registra el momento exacto y cambia al piloto a presente", () => {
  const present = transitionParticipantStatus(queuedPilot, "check-in", 12_345);

  assert.equal(present.status, "present");
  assert.equal(present.checkedInAt, 12_345);
  assert.equal(present.updatedAt, 12_345);
});

test("llamar desde la fila virtual mantiene al piloto fuera de la fila presencial", () => {
  const invited = transitionParticipantStatus(queuedPilot, "invite", 10_000);

  assert.equal(invited.status, "invited");
  assert.equal(invited.invitedAt, 10_000);
  assert.equal(invited.checkedInAt, undefined);
});

test("un piloto llamado virtualmente puede hacer check-in al llegar", () => {
  const invited = transitionParticipantStatus(queuedPilot, "invite", 10_000);
  const present = transitionParticipantStatus(invited, "check-in", 12_345);

  assert.equal(present.status, "present");
  assert.equal(present.checkedInAt, 12_345);
  assert.equal(present.invitedAt, undefined);
});

test("cancelar el llamado virtual conserva el orden original", () => {
  const invited = transitionParticipantStatus(queuedPilot, "invite", 10_000);
  const queued = transitionParticipantStatus(invited, "uninvite", 11_000);

  assert.equal(queued.status, "queued");
  assert.equal(queued.queuedAt, queuedPilot.queuedAt);
  assert.equal(queued.invitedAt, undefined);
});

test("repetir el check-in no cambia la posición original", () => {
  const present = { ...queuedPilot, status: "present", checkedInAt: 12_345 };

  assert.equal(transitionParticipantStatus(present, "check-in", 99_999), present);
});

test("un piloto sin check-in no puede ser llamado", () => {
  assert.throws(
    () => transitionParticipantStatus(queuedPilot, "call", 12_345),
    (error) => error.statusCode === 409 && /check-in/.test(error.message)
  );
});

test("llamar y devolver a la fila conserva el orden del check-in", () => {
  const present = { ...queuedPilot, status: "present", checkedInAt: 12_345 };
  const called = transitionParticipantStatus(present, "call", 20_000);
  const returned = transitionParticipantStatus(called, "requeue", 30_000);

  assert.equal(called.status, "called");
  assert.equal(called.calledAt, 20_000);
  assert.equal(returned.status, "present");
  assert.equal(returned.checkedInAt, 12_345);
});

test("Staff y dashboard separan llamado virtual y llamado a pista en v10", async () => {
  const [html, admin, dashboard, dataHook] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("assets/admin-ta-v10.js", root), "utf8"),
    readFile(new URL("assets/dashboard-ta-v10.js", root), "utf8"),
    readFile(new URL("assets/logos-ta-v10.js", root), "utf8")
  ]);

  assert.ok(html.includes("/assets/index-ta-v10.js"));
  assert.ok(admin.includes("Ya está aquí"));
  assert.ok(admin.includes("Llamar a pista"));
  assert.ok(admin.includes("Cancelar llamado"));
  assert.ok(admin.includes('action:"invite"'));
  assert.ok(admin.includes('action:"uninvite"'));
  assert.ok(admin.includes('action:"check-in"'));
  assert.ok(admin.includes("Check-in · "));
  assert.ok(dashboard.includes('function re({present:t,called:s})'));
  assert.ok(dashboard.includes('const a=[...s?[s]:[],...t.slice(0,5)]'));
  assert.ok(dashboard.includes('children:"Piloto en pista"'));
  assert.ok(dashboard.includes('children:"Llamado de fila virtual"'));
  assert.ok(dashboard.includes("Favor reportarse con Staff"));
  assert.ok(dashboard.includes('e.jsx(re,{present:s,called:a})'));
  assert.ok(dataHook.includes('status==="queued"||t.status==="invited"'));
  assert.ok(dataHook.includes("invited:y"));
  assert.ok(dataHook.includes('status==="present"'));
  assert.ok(dataHook.includes("checkedInAt??t.queuedAt"));
});
