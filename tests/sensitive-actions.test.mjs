import assert from "node:assert/strict";
import test from "node:test";

import { isSensitiveActionPasswordValid } from "../netlify/lib/auth.mjs";

test("valida la contraseña secundaria sin exponerla en el frontend", () => {
  const previousPassword = process.env.SENSITIVE_ACTION_PASSWORD;
  process.env.SENSITIVE_ACTION_PASSWORD = "clave-de-prueba";

  try {
    assert.equal(isSensitiveActionPasswordValid("clave-de-prueba"), true);
    assert.equal(isSensitiveActionPasswordValid("otra-clave"), false);
    assert.equal(isSensitiveActionPasswordValid(""), false);
  } finally {
    if (previousPassword === undefined) delete process.env.SENSITIVE_ACTION_PASSWORD;
    else process.env.SENSITIVE_ACTION_PASSWORD = previousPassword;
  }
});
