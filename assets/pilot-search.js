export function normalizePilotSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

export function matchesPilotSearch(pilot, query) {
  const normalizedQuery = normalizePilotSearch(query);
  if (!normalizedQuery) return true;

  const searchable = normalizePilotSearch([
    pilot.firstName,
    pilot.lastName,
    `${pilot.firstName ?? ""} ${pilot.lastName ?? ""}`,
    `${pilot.lastName ?? ""} ${pilot.firstName ?? ""}`,
    pilot.shortName,
    pilot.team,
    pilot.memberNumber,
    pilot.contactType,
    pilot.contact,
    pilot.status
  ].join(" "));

  return normalizedQuery.split(/\s+/).every((term) => searchable.includes(term));
}
