import {
  STAFF_SESSION_LIFETIME_MS,
  createStaffCookie,
  createStaffSessionToken,
  getClientKey,
  getStaffSession,
  isStaffPasswordValid
} from "../lib/auth.mjs";
import {
  deleteLoginAttempt,
  deleteLogo,
  readLoginAttempt,
  readLogo,
  readState,
  updateState,
  writeLoginAttempt,
  writeLogo
} from "../lib/data.mjs";
import {
  LOGO_UPLOAD_LIMIT_BYTES,
  cleanLogoFileName,
  configWithLogo,
  createHttpError,
  fetchCoautoProduct,
  getLogoMeta,
  getLogoSlot,
  isPng,
  normalizeContactType,
  parseTimeMs,
  publicParticipant,
  validateConfigUpdate
} from "../lib/domain.mjs";

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      ...headers
    }
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw createHttpError(400, "El cuerpo de la solicitud no es JSON válido");
  }
}

function apiPath(url) {
  const marker = "/.netlify/functions/api";
  if (!url.pathname.startsWith(marker)) return url.pathname;
  const suffix = url.pathname.slice(marker.length).replace(/^\/+/, "");
  return suffix ? `/api/${suffix}` : "/api";
}

function requireStaff(request) {
  if (getStaffSession(request)) return null;
  return json({ error: "Se requiere autenticación de Staff" }, 401);
}

function participantList(state) {
  return Array.isArray(state.participants) ? state.participants : [];
}

function cleanText(value, maxLength = 160) {
  return String(value || "").trim().slice(0, maxLength);
}

async function handleStaff(request, context, path) {
  if (path === "/api/staff/session" && request.method === "GET") {
    const session = getStaffSession(request);
    return json({ authenticated: Boolean(session), expiresAt: session?.expiresAt || null });
  }

  if (path === "/api/staff/login" && request.method === "POST") {
    const clientKey = getClientKey(request, context);
    let attempt = await readLoginAttempt(clientKey);
    if (!Number.isFinite(attempt.resetAt) || attempt.resetAt <= Date.now()) {
      attempt = { count: 0, resetAt: Date.now() + 10 * 60 * 1000 };
    }
    if (attempt.count >= 5) {
      return json(
        { error: "Demasiados intentos. Espera 10 minutos antes de volver a intentar." },
        429
      );
    }

    const body = await readJson(request);
    if (!isStaffPasswordValid(String(body.password || ""))) {
      await writeLoginAttempt(clientKey, { ...attempt, count: attempt.count + 1 });
      return json({ error: "Contraseña incorrecta" }, 401);
    }

    await deleteLoginAttempt(clientKey);
    const token = createStaffSessionToken();
    const expiresAt = Date.now() + STAFF_SESSION_LIFETIME_MS;
    return json(
      { authenticated: true, expiresAt },
      200,
      { "set-cookie": createStaffCookie(request, token, STAFF_SESSION_LIFETIME_MS / 1000) }
    );
  }

  if (path === "/api/staff/logout" && request.method === "POST") {
    return json(
      { authenticated: false },
      200,
      { "set-cookie": createStaffCookie(request, "", 0) }
    );
  }
  return null;
}

async function handleConfig(request) {
  if (request.method === "GET") return json((await readState()).config);
  if (request.method !== "PUT") return json({ error: "Método no permitido" }, 405);

  const unauthorized = requireStaff(request);
  if (unauthorized) return unauthorized;
  const update = validateConfigUpdate(await readJson(request));
  const state = await updateState((current) => ({
    ...current,
    config: { ...current.config, ...update, updatedAt: Date.now() }
  }));
  return json(state.config);
}

async function handleParticipants(request, path) {
  if (path === "/api/participants") {
    if (request.method === "GET") {
      const state = await readState();
      const participants = participantList(state);
      const visible = getStaffSession(request)
        ? participants
        : participants.map(publicParticipant);
      return json({ participants: visible, updatedAt: Date.now() });
    }

    if (request.method === "DELETE") {
      const unauthorized = requireStaff(request);
      if (unauthorized) return unauthorized;
      await updateState((state) => ({
        ...state,
        participants: participantList(state).filter((participant) => participant.status !== "finished")
      }));
      return json({ ok: true });
    }

    if (request.method === "POST") {
      const body = await readJson(request);
      if (body.action === "restore") {
        const unauthorized = requireStaff(request);
        if (unauthorized) return unauthorized;
        if (!Array.isArray(body.participants)) {
          throw createHttpError(400, "El respaldo no contiene participantes válidos");
        }
        await updateState((state) => ({ ...state, participants: body.participants }));
        return json({ ok: true });
      }

      const isStaff = Boolean(getStaffSession(request));
      const timeMs = isStaff ? parseTimeMs(body.time) : null;
      const now = Date.now();
      const hasContact = Boolean(body.hasContact);
      const contact = hasContact ? cleanText(body.contact, 180) : "";
      if (hasContact && !contact) {
        throw createHttpError(400, "Ingresa el usuario o número de contacto");
      }
      const participant = {
        id: crypto.randomUUID(),
        firstName: cleanText(body.firstName, 80),
        lastName: cleanText(body.lastName, 80),
        shortName: `${cleanText(body.firstName, 80)} ${cleanText(body.lastName, 80).charAt(0)}`.trim(),
        team: cleanText(body.team, 100),
        isMember: Boolean(body.isMember),
        memberNumber: cleanText(body.memberNumber, 80),
        hasContact,
        contactType: normalizeContactType(body.contactType, hasContact),
        contact,
        source: isStaff ? cleanText(body.source, 20) || "staff" : "public",
        status: timeMs === null ? "queued" : "finished",
        queuedAt: now,
        createdAt: now,
        updatedAt: now,
        timeMs
      };
      await updateState((state) => ({
        ...state,
        participants: [...participantList(state), participant]
      }));
      return json(isStaff ? participant : publicParticipant(participant));
    }
    return json({ error: "Método no permitido" }, 405);
  }

  const match = path.match(/^\/api\/participants\/([^/]+)$/);
  if (!match) return null;
  const unauthorized = requireStaff(request);
  if (unauthorized) return unauthorized;
  const id = decodeURIComponent(match[1]);

  if (request.method === "DELETE") {
    await updateState((state) => ({
      ...state,
      participants: participantList(state).filter((participant) => participant.id !== id)
    }));
    return new Response(null, { status: 204 });
  }

  if (request.method === "PUT") {
    const body = await readJson(request);
    await updateState((state) => ({
      ...state,
      participants: participantList(state).map((participant) => {
        if (participant.id !== id) return participant;
        const updatedAt = Date.now();
        if (body.action === "call") return { ...participant, status: "called", updatedAt };
        if (body.action === "requeue") return { ...participant, status: "queued", updatedAt };
        const timeMs = parseTimeMs(body.time);
        const firstName = cleanText(body.firstName ?? participant.firstName, 80);
        const lastName = cleanText(body.lastName ?? participant.lastName, 80);
        const hasContact = Boolean(body.hasContact);
        const contact = hasContact ? cleanText(body.contact, 180) : "";
        if (hasContact && !contact) {
          throw createHttpError(400, "Ingresa el usuario o número de contacto");
        }
        return {
          ...participant,
          firstName,
          lastName,
          shortName: `${firstName} ${lastName.charAt(0)}`.trim(),
          team: cleanText(body.team ?? participant.team, 100),
          isMember: Boolean(body.isMember),
          memberNumber: cleanText(body.memberNumber, 80),
          hasContact,
          contactType: normalizeContactType(body.contactType, hasContact),
          contact,
          timeMs,
          status: timeMs === null ? participant.status : "finished",
          updatedAt
        };
      })
    }));
    return json({ ok: true });
  }
  return json({ error: "Método no permitido" }, 405);
}

async function handleLogos(request, url, path) {
  const slot = getLogoSlot(path);
  if (!slot) return null;

  if (request.method === "GET") {
    const state = await readState();
    if (!getLogoMeta(state.config, slot)) return json({ error: "No hay un logo cargado" }, 404);
    const logo = await readLogo(slot);
    if (!logo) return json({ error: "No se encontró el archivo del logo" }, 404);
    return new Response(logo, {
      headers: {
        "cache-control": "public, max-age=31536000, immutable",
        "content-type": "image/png",
        "x-content-type-options": "nosniff"
      }
    });
  }

  const unauthorized = requireStaff(request);
  if (unauthorized) return unauthorized;

  if (request.method === "POST") {
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "image/png") {
      return json({ error: "Solo se permiten archivos PNG" }, 415);
    }
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(declaredLength) && declaredLength > LOGO_UPLOAD_LIMIT_BYTES) {
      return json({ error: "El logo no puede superar 5 MB" }, 413);
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > LOGO_UPLOAD_LIMIT_BYTES) {
      return json({ error: "El logo no puede superar 5 MB" }, 413);
    }
    if (!isPng(bytes)) return json({ error: "El archivo no es un PNG válido" }, 400);

    await writeLogo(slot, bytes);
    const meta = {
      fileName: cleanLogoFileName(url.searchParams.get("name")),
      needsLightBg: url.searchParams.get("dark") === "1",
      updatedAt: Date.now()
    };
    await updateState((state) => ({
      ...state,
      config: configWithLogo(state.config, slot, meta)
    }));
    return json({ ok: true, meta });
  }

  if (request.method === "DELETE") {
    await updateState((state) => ({
      ...state,
      config: configWithLogo(state.config, slot, null)
    }));
    await deleteLogo(slot);
    return json({ ok: true });
  }
  return json({ error: "Método no permitido" }, 405);
}

export default async (request, context) => {
  try {
    const url = new URL(request.url);
    const path = apiPath(url);

    const staffResponse = await handleStaff(request, context, path);
    if (staffResponse) return staffResponse;

    if (path === "/api/products/preview") {
      if (request.method !== "POST") return json({ error: "Método no permitido" }, 405);
      const unauthorized = requireStaff(request);
      if (unauthorized) return unauthorized;
      const body = await readJson(request);
      return json(await fetchCoautoProduct(body.url));
    }

    if (path === "/api/config") return await handleConfig(request);
    const participantResponse = await handleParticipants(request, path);
    if (participantResponse) return participantResponse;
    const logoResponse = await handleLogos(request, url, path);
    if (logoResponse) return logoResponse;
    return json({ error: "Ruta API no encontrada" }, 404);
  } catch (error) {
    console.error("VM Time Attack API error", error);
    return json({ error: error?.message || "Error interno" }, error?.statusCode || 500);
  }
};
