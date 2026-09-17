import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("el reglamento publica las condiciones, asistencias y premios", async () => {
  const html = await readFile(new URL("reglamento.html", root), "utf8");

  for (const expected of [
    "VM Time Attack Barcelona",
    "tres vueltas",
    "mejor vuelta válida",
    "Force Feedback desactivado",
    "8 años",
    "US$200",
    "Mouse y teclado",
    "Merch VM Lounge",
    "10 horas de academia"
  ]) {
    assert.ok(html.includes(expected), `Falta el contenido: ${expected}`);
  }
});

test("dashboard e inscripción enlazan al reglamento", async () => {
  const [dashboard, registration] = await Promise.all([
    readFile(new URL("assets/dashboard-ta-v6.js", root), "utf8"),
    readFile(new URL("assets/registro-ta-v6.js", root), "utf8")
  ]);

  assert.ok(dashboard.includes('href:"/reglamento"'));
  assert.ok(registration.includes('href: "/reglamento"'));
});

test("la configuración inicial del evento coincide con Barcelona", async () => {
  const seed = JSON.parse(await readFile(new URL("netlify/seed/state.json", root), "utf8"));
  assert.equal(seed.config.trackId, "barcelona");
});
