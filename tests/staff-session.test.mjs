import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { STAFF_SESSION_LIFETIME_MS } from "../netlify/lib/auth.mjs";

const root = new URL("../", import.meta.url);

test("la sesión de Staff dura 24 horas", () => {
  assert.equal(STAFF_SESSION_LIFETIME_MS, 24 * 60 * 60 * 1000);
});

test("el panel redirige al login cuando una petición devuelve 401", async () => {
  const guard = await readFile(new URL("assets/staff-session-guard-v1.js", root), "utf8");
  assert.ok(guard.includes("response.status === 401"));
  assert.ok(guard.includes('/admin?session=expired'));
  assert.ok(guard.includes("/api/staff/session"));
});

test("el acceso explica claramente que la sesión venció", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("staff-login.html", root), "utf8"),
    readFile(new URL("assets/staff-login-v2.js", root), "utf8")
  ]);
  assert.ok(html.includes("/assets/staff-login-v2.js"));
  assert.ok(script.includes("Tu sesión de Staff venció"));
});
