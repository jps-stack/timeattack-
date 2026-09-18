import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const instagramUrl = "https://www.instagram.com/virtualmotors_esports/";
const facebookUrl = "https://www.facebook.com/VirtualMotorsEsports";

test("las vistas públicas enlazan a las redes oficiales", async () => {
  const files = await Promise.all(
    ["assets/dashboard-ta-v6.js", "assets/registro-ta-v6.js", "reglamento.html"].map((path) =>
      readFile(new URL(path, root), "utf8")
    )
  );

  for (const source of files) {
    assert.ok(source.includes(instagramUrl));
    assert.ok(source.includes(facebookUrl));
  }
});
