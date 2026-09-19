export const CONTACT_TYPE_LABELS = Object.freeze({
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook"
});

export function formatContactType(value) {
  return CONTACT_TYPE_LABELS[value] || "";
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDateTime(value) {
  if (!value || !Number.isFinite(value)) return "";
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatTime(value) {
  if (!Number.isFinite(value)) return "";
  const minutes = Math.floor(value / 60000);
  const seconds = Math.floor((value % 60000) / 1000);
  const milliseconds = value % 1000;
  return `${minutes}:${pad(seconds)}.${String(milliseconds).padStart(3, "0")}`;
}

function participantStatus(participant) {
  if (participant.status === "finished" && participant.timeMs !== null) {
    return "Con tiempo registrado";
  }
  if (participant.status === "called") return "Llamado a pista";
  if (participant.status === "present") return "Presente / Check-in realizado";
  if (participant.status === "invited") return "Llamado desde fila virtual";
  return "Pendiente / En fila";
}

function participantSource(participant) {
  return participant.source === "public" ? "Formulario público" : "Staff";
}

function csvCell(value) {
  const cell = String(value ?? "");
  return /[;"\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

export function buildEventBackup({ config, participants, logos, generatedAt, game, track }) {
  const counts = {
    total: participants.length,
    finished: participants.filter((participant) => participant.status === "finished").length,
    queued: participants.filter((participant) => participant.status === "queued").length,
    invited: participants.filter((participant) => participant.status === "invited").length,
    present: participants.filter((participant) => participant.status === "present").length,
    called: participants.filter((participant) => participant.status === "called").length,
    public: participants.filter((participant) => participant.source === "public").length,
    staff: participants.filter((participant) => participant.source !== "public").length
  };

  return {
    type: "vm-time-attack-backup",
    backupVersion: 2,
    eventName: "Virtual Motors Time Attack",
    appVersion: null,
    generatedAt,
    generatedAtISO: new Date(generatedAt).toISOString(),
    config,
    selectedGame: game,
    selectedTrack: track,
    counts,
    participants,
    logos
  };
}

const PARTICIPANT_COLUMNS = [
  "Posición",
  "Nombre",
  "Apellido",
  "Nombre completo",
  "Escudería",
  "Estado",
  "Tiempo",
  "Es socio",
  "Número de socio",
  "Tipo de contacto",
  "Contacto",
  "Fuente de inscripción",
  "Fecha/hora de inscripción",
  "Fecha/hora de llamado virtual",
  "Fecha/hora de check-in presencial",
  "Fecha/hora de tiempo registrado",
  "Pista",
  "Juego activo",
  "Observaciones"
];

export function buildParticipantsCsv(participants, event) {
  const unique = new Map();
  for (const participant of participants) {
    const current = unique.get(participant.id);
    if (!current || (participant.updatedAt ?? 0) >= (current.updatedAt ?? 0)) {
      unique.set(participant.id, participant);
    }
  }

  const values = [...unique.values()];
  const positions = new Map();
  values
    .filter((participant) => participant.status === "finished" && participant.timeMs !== null)
    .sort((left, right) => left.timeMs - right.timeMs)
    .forEach((participant, index) => positions.set(participant.id, index + 1));

  const order = (participant) => {
    if (positions.has(participant.id)) return positions.get(participant.id);
    if (participant.status === "called") return 100000;
    if (participant.status === "present") return 200000 + (participant.checkedInAt ?? participant.queuedAt ?? 0) / 1e13;
    if (participant.status === "queued" || participant.status === "invited") {
      return 300000 + (participant.queuedAt ?? 0) / 1e13;
    }
    return 400000;
  };

  const rows = [PARTICIPANT_COLUMNS];
  for (const participant of values.sort((left, right) => order(left) - order(right))) {
    rows.push([
      positions.get(participant.id) || "",
      participant.firstName,
      participant.lastName,
      `${participant.firstName} ${participant.lastName}`.trim(),
      participant.team,
      participantStatus(participant),
      formatTime(participant.timeMs),
      participant.isMember ? "Sí" : "No",
      participant.isMember ? participant.memberNumber : "",
      participant.hasContact ? formatContactType(participant.contactType) : "",
      participant.hasContact ? participant.contact : "",
      participantSource(participant),
      formatDateTime(participant.createdAt),
      formatDateTime(participant.invitedAt),
      formatDateTime(participant.checkedInAt),
      participant.status === "finished" ? formatDateTime(participant.updatedAt) : "",
      event.trackName,
      event.gameName,
      ""
    ]);
  }

  return `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
}
