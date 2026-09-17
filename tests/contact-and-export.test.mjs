import assert from "node:assert/strict";
import test from "node:test";

import { buildEventBackup, buildParticipantsCsv } from "../assets/event-export.js";
import { normalizeContactType, publicParticipant } from "../netlify/lib/domain.mjs";

function parseCsvRow(row) {
  const cells = [""];
  let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const character = row[index];
    if (character === '"') {
      if (quoted && row[index + 1] === '"') {
        cells[cells.length - 1] += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ";" && !quoted) {
      cells.push("");
    } else {
      cells[cells.length - 1] += character;
    }
  }
  return cells;
}

test("normaliza y valida el medio de contacto", () => {
  assert.equal(normalizeContactType(" WhatsApp ", true), "whatsapp");
  assert.equal(normalizeContactType("", false), "");
  assert.throws(() => normalizeContactType("email", true), /WhatsApp, Instagram o Facebook/);
});

test("la respuesta pública oculta todos los datos de contacto", () => {
  const participant = publicParticipant({
    id: "p-1",
    firstName: "Ana",
    hasContact: true,
    contactType: "instagram",
    contact: "@ana",
    isMember: true,
    memberNumber: "77"
  });

  assert.deepEqual(participant, { id: "p-1", firstName: "Ana" });
});

test("el CSV usa columnas separadas y conserva el tipo de contacto", () => {
  const csv = buildParticipantsCsv(
    [
      {
        id: "p-1",
        firstName: "Ana",
        lastName: "Rojas",
        team: "VM; Racing",
        status: "finished",
        timeMs: 92500,
        isMember: true,
        memberNumber: "77",
        hasContact: true,
        contactType: "instagram",
        contact: "@ana",
        source: "public",
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_100_000
      }
    ],
    { trackName: "Bakú", gameName: "F1" }
  );

  const [header, row] = csv.replace(/^\uFEFF/, "").split("\r\n");
  assert.match(header, /Tipo de contacto;Contacto/);
  assert.match(row, /"VM; Racing"/);
  assert.match(row, /Instagram;@ana/);
  assert.equal(parseCsvRow(header).length, parseCsvRow(row).length);
});

test("el respaldo conserva el nuevo campo y usa la versión 2", () => {
  const participants = [{ id: "p-1", contactType: "facebook", contact: "ana.vm" }];
  const backup = buildEventBackup({
    config: { trackId: "baku" },
    participants,
    logos: [],
    generatedAt: 1_700_000_000_000,
    game: { id: "f1", name: "F1" },
    track: { id: "baku", name: "Bakú" }
  });

  assert.equal(backup.backupVersion, 2);
  assert.equal(backup.participants[0].contactType, "facebook");
  assert.match(JSON.stringify(backup, null, 2), /\n  "participants"/);
});
