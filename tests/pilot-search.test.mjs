import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { matchesPilotSearch, normalizePilotSearch } from "../assets/pilot-search.js";

const root = new URL("../", import.meta.url);
const pilot = {
  firstName: "José Andrés",
  lastName: "Núñez",
  team: "Virtual Motors",
  memberNumber: "VM-204",
  contactType: "instagram",
  contact: "@jose.racing",
  status: "present"
};

test("la búsqueda ignora mayúsculas y acentos", () => {
  assert.equal(normalizePilotSearch("  JOSÉ Núñez  "), "jose nunez");
  assert.equal(matchesPilotSearch(pilot, "jose nunez"), true);
});

test("la búsqueda combina nombre, escudería, socio y contacto", () => {
  assert.equal(matchesPilotSearch(pilot, "andres motors"), true);
  assert.equal(matchesPilotSearch(pilot, "vm-204"), true);
  assert.equal(matchesPilotSearch(pilot, "jose.racing"), true);
  assert.equal(matchesPilotSearch(pilot, "ferrari"), false);
});

test("el bundle activo de Staff incluye el buscador", async () => {
  const [html, admin] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("assets/admin-ta-v8.js", root), "utf8")
  ]);

  assert.ok(html.includes("/assets/index-ta-v8.js"));
  assert.ok(admin.includes("staff-pilot-search"));
  assert.ok(admin.includes("Nombre, escudería, socio o contacto"));
  assert.ok(admin.includes("matchesPilotSearch"));
});
