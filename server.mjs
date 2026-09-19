import { createServer } from "node:http";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { isSensitiveActionPasswordValid } from "./netlify/lib/auth.mjs";
import { transitionParticipantStatus } from "./netlify/lib/domain.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const statePath = join(root, ".timeattack-state.json");
const logoUploadDir = join(root, ".timeattack-uploads");
const logoUploadLimitBytes = 5 * 1024 * 1024;
const productPageLimitBytes = 2 * 1024 * 1024;
const customAdLimit = 12;
const partnerCount = 8;
const validLogoSlots = new Set([
  "sponsor",
  ...Array.from({ length: partnerCount }, (_, index) => `partner-${index + 1}`)
]);
const validCarIds = new Set([
  "audi",
  "ferrari",
  "mclaren",
  "mercedes",
  "red-bull",
  "cadillac",
  "virtual-motors"
]);
const validAdIds = new Set([
  "gt-lite",
  "wheel-stand",
  "motion-plus",
  "gt-elite-lite",
  "open-wheel",
  "monitor-mount"
]);
const validContactTypes = new Set(["whatsapp", "instagram", "facebook"]);
const staffPassword = process.env.STAFF_PASSWORD;
if (!staffPassword) {
  throw new Error("Falta configurar STAFF_PASSWORD para iniciar el servidor local");
}
const staffCookieName = "ta_staff_session";
const staffSessionLifetimeMs = 8 * 60 * 60 * 1000;
const staffSessions = new Map();
const loginAttempts = new Map();

let participants = [];
const defaultConfig = {
  activeGame: "f1",
  trackId: "barcelona",
  awardMode: false,
  selectedCar: "audi",
  adsEnabled: true,
  selectedAds: ["gt-lite", "wheel-stand", "open-wheel"],
  customAds: [],
  sponsor: null,
  partners: Array.from({ length: partnerCount }, () => null),
  updatedAt: Date.now()
};

let config = defaultConfig;

try {
  const persistedState = JSON.parse(await readFile(statePath, "utf8"));
  config = { ...defaultConfig, ...persistedState.config };
} catch {
  // The first local run starts with the event defaults.
}

async function persistConfig() {
  await writeFile(statePath, `${JSON.stringify({ config }, null, 2)}\n`, "utf8");
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json; charset=utf-8"
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(body));
}

function getCookie(req, name) {
  const cookies = String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const prefix = `${name}=`;
  const cookie = cookies.find((part) => part.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

function getStaffSession(req) {
  const token = getCookie(req, staffCookieName);
  if (!token) return null;

  const expiresAt = staffSessions.get(token);
  if (!expiresAt || expiresAt <= Date.now()) {
    staffSessions.delete(token);
    return null;
  }
  return { token, expiresAt };
}

function requireStaff(req, res) {
  if (getStaffSession(req)) return true;
  sendJson(res, 401, { error: "Staff authentication required" });
  return false;
}

function requireSensitiveActionPassword(req, res) {
  if (isSensitiveActionPasswordValid(req.headers["x-action-password"] || "")) return true;
  sendJson(res, 403, { error: "Contraseña de acción incorrecta" });
  return false;
}

function getClientKey(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local")
    .split(",")[0]
    .trim();
}

function getLoginAttempt(req) {
  const key = getClientKey(req);
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= Date.now()) {
    const fresh = { count: 0, resetAt: Date.now() + 10 * 60 * 1000 };
    loginAttempts.set(key, fresh);
    return { key, attempt: fresh };
  }
  return { key, attempt: current };
}

function createStaffCookie(req, token, maxAgeSeconds) {
  const forwardedProtocol = String(req.headers["x-forwarded-proto"] || "");
  const secure = forwardedProtocol === "https" ? "; Secure" : "";
  return `${staffCookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}${secure}`;
}

function publicParticipant(participant) {
  const {
    contact: _contact,
    contactType: _contactType,
    hasContact: _hasContact,
    isMember: _isMember,
    memberNumber: _memberNumber,
    ...visibleParticipant
  } = participant;
  return visibleParticipant;
}

function normalizeContactType(value, hasContact) {
  if (!hasContact) return "";
  const contactType = String(value || "").trim().toLowerCase();
  if (!validContactTypes.has(contactType)) {
    throw createHttpError(400, "Selecciona WhatsApp, Instagram o Facebook como medio de contacto");
  }
  return contactType;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

async function readBinaryBody(req, limitBytes) {
  const declaredLength = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > limitBytes) {
    const error = new Error("El logo no puede superar 5 MB");
    error.statusCode = 413;
    throw error;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) {
      const error = new Error("El logo no puede superar 5 MB");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function isPng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature);
}

function getLogoSlot(pathname) {
  const match = pathname.match(/^\/api\/logos\/([^/]+)$/);
  if (!match) return null;
  const slot = decodeURIComponent(match[1]);
  return validLogoSlots.has(slot) ? slot : null;
}

function getLogoMeta(slot) {
  if (slot === "sponsor") return config.sponsor;
  const index = Number(slot.slice("partner-".length)) - 1;
  return config.partners[index] || null;
}

function configWithLogo(slot, meta) {
  const updatedAt = Date.now();
  if (slot === "sponsor") return { ...config, sponsor: meta, updatedAt };

  const partners = Array.from({ length: partnerCount }, (_, index) => config.partners[index] || null);
  const index = Number(slot.slice("partner-".length)) - 1;
  partners[index] = meta;
  return { ...config, partners, updatedAt };
}

function cleanLogoFileName(value) {
  const fileName = String(value || "logo.png").split(/[\\/]/).pop();
  return fileName.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180) || "logo.png";
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeCoautoProductUrl(value) {
  let productUrl;
  try {
    productUrl = new URL(String(value || "").trim());
  } catch {
    throw createHttpError(400, "Ingresa un enlace válido de Coauto Simracing");
  }

  const hostname = productUrl.hostname.toLowerCase().replace(/^www\./, "");
  const productMatch = productUrl.pathname.match(/^\/products\/(\d+)\/([a-z0-9-]+)\/?$/i);
  if (hostname !== "coautosim.com" || !productMatch) {
    throw createHttpError(400, "El enlace debe pertenecer a un producto de www.coautosim.com");
  }

  productUrl.protocol = "https:";
  productUrl.hostname = "www.coautosim.com";
  productUrl.port = "";
  productUrl.search = "";
  productUrl.hash = "";
  productUrl.pathname = `/products/${productMatch[1]}/${productMatch[2]}`;
  return { productId: productMatch[1], productUrl };
}

function normalizeProductImageUrl(value) {
  let imageUrl;
  try {
    imageUrl = new URL(String(value || ""));
  } catch {
    throw createHttpError(422, "El producto no incluye una imagen válida");
  }
  if (!["http:", "https:"].includes(imageUrl.protocol)) {
    throw createHttpError(422, "El producto no incluye una imagen válida");
  }
  imageUrl.protocol = "https:";
  return imageUrl.toString();
}

async function readResponseText(response, limitBytes) {
  if (!response.body) return "";
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > limitBytes) {
      throw createHttpError(502, "La página del producto es demasiado grande para procesarla");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function findProductJsonLd(html) {
  const scriptPattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const candidates = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.["@graph"])
          ? parsed["@graph"]
          : [parsed];
      const product = candidates.find((candidate) => {
        const type = candidate?.["@type"];
        return type === "Product" || (Array.isArray(type) && type.includes("Product"));
      });
      if (product) return product;
    } catch {
      // Ignore unrelated or malformed JSON-LD blocks and continue looking.
    }
  }
  return null;
}

function productImageFromJsonLd(product) {
  const image = Array.isArray(product?.image) ? product.image[0] : product?.image;
  if (typeof image === "string") return image;
  return image?.url || image?.contentUrl || "";
}

function productBrandFromJsonLd(product) {
  if (typeof product?.brand === "string") return product.brand;
  return product?.brand?.name || "Coauto Simracing";
}

async function fetchCoautoProduct(value) {
  const requested = normalizeCoautoProductUrl(value);
  let response;
  try {
    response = await fetch(requested.productUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "VirtualMotors-TimeAttack/1.0"
      },
      redirect: "manual",
      signal: AbortSignal.timeout(12000)
    });
  } catch {
    throw createHttpError(502, "No se pudo consultar el producto en Coauto Simracing");
  }

  if (!response.ok) {
    throw createHttpError(502, `Coauto Simracing respondió con HTTP ${response.status}`);
  }

  const html = await readResponseText(response, productPageLimitBytes);
  const product = findProductJsonLd(html);
  const name = String(product?.name || "").trim().slice(0, 120);
  if (!name) throw createHttpError(422, "No se encontraron los datos públicos del producto");

  const canonical = normalizeCoautoProductUrl(product?.offers?.url || requested.productUrl);
  return {
    id: `coauto-${canonical.productId}`,
    name,
    brand: String(productBrandFromJsonLd(product)).trim().slice(0, 80) || "Coauto Simracing",
    image: normalizeProductImageUrl(productImageFromJsonLd(product)),
    url: canonical.productUrl.toString()
  };
}

function normalizeCustomAds(value) {
  if (!Array.isArray(value) || value.length > customAdLimit) {
    throw createHttpError(400, `Puedes guardar hasta ${customAdLimit} productos personalizados`);
  }

  const products = value.map((item) => {
    const canonical = normalizeCoautoProductUrl(item?.url);
    const name = String(item?.name || "").trim().slice(0, 120);
    if (!name) throw createHttpError(400, "Cada anuncio debe incluir el nombre del producto");
    return {
      id: `coauto-${canonical.productId}`,
      name,
      brand: String(item?.brand || "Coauto Simracing").trim().slice(0, 80),
      image: normalizeProductImageUrl(item?.image),
      url: canonical.productUrl.toString()
    };
  });

  return [...new Map(products.map((product) => [product.url, product])).values()];
}

function parseTimeMs(value) {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d+):(\d{2})\.(\d{3})$/);
  if (!match) return null;
  return Number(match[1]) * 60000 + Number(match[2]) * 1000 + Number(match[3]);
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/staff/session" && req.method === "GET") {
    const session = getStaffSession(req);
    return sendJson(res, 200, {
      authenticated: Boolean(session),
      expiresAt: session?.expiresAt || null
    });
  }

  if (url.pathname === "/api/staff/login" && req.method === "POST") {
    const { key, attempt } = getLoginAttempt(req);
    if (attempt.count >= 5) {
      return sendJson(res, 429, {
        error: "Demasiados intentos. Espera 10 minutos antes de volver a intentar."
      });
    }

    const body = await readBody(req);
    if (String(body.password || "") !== staffPassword) {
      attempt.count += 1;
      loginAttempts.set(key, attempt);
      return sendJson(res, 401, { error: "Contraseña incorrecta" });
    }

    loginAttempts.delete(key);
    const token = crypto.randomUUID();
    const expiresAt = Date.now() + staffSessionLifetimeMs;
    staffSessions.set(token, expiresAt);
    res.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "set-cookie": createStaffCookie(req, token, staffSessionLifetimeMs / 1000)
    });
    return res.end(JSON.stringify({ authenticated: true, expiresAt }));
  }

  if (url.pathname === "/api/staff/logout" && req.method === "POST") {
    const session = getStaffSession(req);
    if (session) staffSessions.delete(session.token);
    res.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "set-cookie": createStaffCookie(req, "", 0)
    });
    return res.end(JSON.stringify({ authenticated: false }));
  }

  if (url.pathname === "/api/products/preview" && req.method === "POST") {
    if (!requireStaff(req, res)) return;
    const body = await readBody(req);
    return sendJson(res, 200, await fetchCoautoProduct(body.url));
  }

  if (url.pathname === "/api/config") {
    if (req.method === "GET") return sendJson(res, 200, config);
    if (req.method === "PUT") {
      if (!requireStaff(req, res)) return;
      const body = await readBody(req);
      if (Object.hasOwn(body, "awardMode") && !requireSensitiveActionPassword(req, res)) return;
      if (body.selectedCar && !validCarIds.has(body.selectedCar)) {
        return sendJson(res, 400, { error: "Unknown car selection" });
      }
      if (
        body.selectedAds &&
        (!Array.isArray(body.selectedAds) ||
          body.selectedAds.length > validAdIds.size ||
          body.selectedAds.some((id) => !validAdIds.has(id)))
      ) {
        return sendJson(res, 400, { error: "Unknown product selection" });
      }
      if (body.adsEnabled !== undefined && typeof body.adsEnabled !== "boolean") {
        return sendJson(res, 400, { error: "Invalid ads state" });
      }
      if (body.customAds !== undefined) body.customAds = normalizeCustomAds(body.customAds);
      config = { ...config, ...body, updatedAt: Date.now() };
      await persistConfig();
      return sendJson(res, 200, config);
    }
  }

  if (url.pathname === "/api/participants") {
    if (req.method === "GET") {
      const visibleParticipants = getStaffSession(req)
        ? participants
        : participants.map(publicParticipant);
      return sendJson(res, 200, { participants: visibleParticipants, updatedAt: Date.now() });
    }

    if (req.method === "DELETE") {
      if (!requireStaff(req, res)) return;
      if (!requireSensitiveActionPassword(req, res)) return;
      participants = participants.filter((p) => p.status !== "finished");
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      if (body.action === "restore" && Array.isArray(body.participants)) {
        if (!requireStaff(req, res)) return;
        participants = body.participants;
        return sendJson(res, 200, { ok: true });
      }
      const isStaff = Boolean(getStaffSession(req));
      const timeMs = isStaff ? parseTimeMs(body.time) : null;
      const hasContact = Boolean(body.hasContact);
      const contact = hasContact ? String(body.contact || "").trim().slice(0, 180) : "";
      if (hasContact && !contact) {
        throw createHttpError(400, "Ingresa el usuario o número de contacto");
      }
      const now = Date.now();
      const participant = {
        id: crypto.randomUUID(),
        firstName: body.firstName || "",
        lastName: body.lastName || "",
        shortName: `${body.firstName || ""} ${(body.lastName || "").charAt(0)}`.trim(),
        team: body.team || "",
        isMember: Boolean(body.isMember),
        memberNumber: body.memberNumber || "",
        hasContact,
        contactType: normalizeContactType(body.contactType, hasContact),
        contact,
        source: isStaff ? body.source || "staff" : "public",
        status: timeMs === null ? "queued" : "finished",
        queuedAt: now,
        createdAt: now,
        updatedAt: now,
        timeMs
      };
      participants.push(participant);
      return sendJson(res, 200, isStaff ? participant : publicParticipant(participant));
    }
  }

  const participantMatch = url.pathname.match(/^\/api\/participants\/([^/]+)$/);
  if (participantMatch) {
    const id = participantMatch[1];
    if (req.method === "DELETE") {
      if (!requireStaff(req, res)) return;
      participants = participants.filter((p) => p.id !== id);
      res.writeHead(204);
      return res.end();
    }
    if (req.method === "PUT") {
      if (!requireStaff(req, res)) return;
      const body = await readBody(req);
      participants = participants.map((p) => {
        if (p.id !== id) return p;
        const statusTransition = transitionParticipantStatus(p, body.action);
        if (statusTransition) return statusTransition;
        const timeMs = parseTimeMs(body.time);
        const hasContact = Boolean(body.hasContact);
        const contact = hasContact ? String(body.contact || "").trim().slice(0, 180) : "";
        if (hasContact && !contact) {
          throw createHttpError(400, "Ingresa el usuario o número de contacto");
        }
        return {
          ...p,
          ...body,
          hasContact,
          contactType: normalizeContactType(body.contactType, hasContact),
          contact,
          timeMs,
          status: timeMs === null ? p.status : "finished",
          updatedAt: Date.now()
        };
      });
      return sendJson(res, 200, { ok: true });
    }
  }

  if (url.pathname.startsWith("/api/logos/")) {
    const slot = getLogoSlot(url.pathname);
    if (!slot) return sendJson(res, 404, { error: "Espacio de logo desconocido" });
    const logoPath = join(logoUploadDir, `${slot}.png`);

    if (req.method === "GET") {
      if (!getLogoMeta(slot)) return sendJson(res, 404, { error: "No hay un logo cargado" });
      try {
        const logo = await readFile(logoPath);
        res.writeHead(200, {
          "cache-control": "public, max-age=31536000, immutable",
          "content-length": logo.length,
          "content-type": "image/png",
          "x-content-type-options": "nosniff"
        });
        return res.end(logo);
      } catch (error) {
        if (error?.code === "ENOENT") {
          return sendJson(res, 404, { error: "No se encontró el archivo del logo" });
        }
        throw error;
      }
    }

    if (!requireStaff(req, res)) return;

    if (req.method === "POST") {
      if (req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "image/png") {
        return sendJson(res, 415, { error: "Solo se permiten archivos PNG" });
      }

      const logo = await readBinaryBody(req, logoUploadLimitBytes);
      if (!isPng(logo)) return sendJson(res, 400, { error: "El archivo no es un PNG válido" });

      await mkdir(logoUploadDir, { recursive: true });
      await writeFile(logoPath, logo);
      const meta = {
        fileName: cleanLogoFileName(url.searchParams.get("name")),
        needsLightBg: url.searchParams.get("dark") === "1",
        updatedAt: Date.now()
      };
      config = configWithLogo(slot, meta);
      await persistConfig();
      return sendJson(res, 200, { ok: true, meta });
    }

    if (req.method === "DELETE") {
      config = configWithLogo(slot, null);
      await persistConfig();
      await unlink(logoPath).catch((error) => {
        if (error?.code !== "ENOENT") throw error;
      });
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 405, { error: "Método no permitido" });
  }

  return sendJson(res, 404, { error: "Mock API route not found" });
}

function safePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const target = normalize(join(root, decoded));
  return target.startsWith(root) ? target : null;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      return await handleApi(req, res, url);
    }

    if ((url.pathname === "/admin" || url.pathname.startsWith("/admin/")) && !getStaffSession(req)) {
      const loginHtml = await readFile(join(root, "staff-login.html"), "utf8");
      res.writeHead(200, {
        "cache-control": "no-store",
        "content-type": types[".html"],
        "x-frame-options": "DENY"
      });
      return res.end(loginHtml);
    }

    if (url.pathname === "/reglamento") {
      const rulesHtml = await readFile(join(root, "reglamento.html"), "utf8");
      res.writeHead(200, {
        "cache-control": "no-store",
        "content-type": types[".html"]
      });
      return res.end(rulesHtml);
    }

    const target = safePath(url.pathname === "/" ? "/index.html" : url.pathname);
    if (target === join(root, "index.html")) {
      const html = await readFile(target, "utf8");
      res.writeHead(200, { "content-type": types[".html"] });
      return res.end(html);
    }

    if (target && existsSync(target)) {
      res.writeHead(200, { "content-type": types[extname(target)] || "application/octet-stream" });
      return createReadStream(target).pipe(res);
    }

    const html = await readFile(join(root, "index.html"), "utf8");
    res.writeHead(200, { "content-type": types[".html"] });
    res.end(html);
  } catch (error) {
    sendJson(res, error?.statusCode || 500, { error: error?.message || "Server error" });
  }
});

server.listen(port, host, () => {
  console.log(`TimeAttack recovery running at http://${host}:${port}`);
});
