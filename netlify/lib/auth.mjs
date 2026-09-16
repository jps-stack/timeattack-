import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const STAFF_COOKIE_NAME = "ta_staff_session";
export const STAFF_SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;

function getEnv(name) {
  return globalThis.Netlify?.env?.get(name) || process.env[name] || "";
}

function getRequiredEnv(name) {
  const value = getEnv(name);
  if (!value) {
    const error = new Error(`Falta configurar ${name} en Netlify`);
    error.statusCode = 500;
    throw error;
  }
  return value;
}

function sign(value) {
  return createHmac("sha256", getRequiredEnv("SESSION_SECRET")).update(value).digest("base64url");
}

function equalStrings(left, right) {
  const leftBytes = Buffer.from(String(left));
  const rightBytes = Buffer.from(String(right));
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function getCookie(request, name) {
  const cookies = String(request.headers.get("cookie") || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const prefix = `${name}=`;
  const cookie = cookies.find((part) => part.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

export function createStaffSessionToken() {
  const payload = Buffer.from(
    JSON.stringify({ expiresAt: Date.now() + STAFF_SESSION_LIFETIME_MS }),
    "utf8"
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function getStaffSession(request) {
  const token = getCookie(request, STAFF_COOKIE_NAME);
  if (!token) return null;
  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length || !equalStrings(signature, sign(payload))) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Number.isFinite(decoded.expiresAt) || decoded.expiresAt <= Date.now()) return null;
    return { expiresAt: decoded.expiresAt };
  } catch {
    return null;
  }
}

export function isStaffPasswordValid(candidate) {
  return equalStrings(candidate, getRequiredEnv("STAFF_PASSWORD"));
}

export function createStaffCookie(request, token, maxAgeSeconds) {
  const url = new URL(request.url);
  const forwardedProtocol = request.headers.get("x-forwarded-proto") || "";
  const secure = url.protocol === "https:" || forwardedProtocol === "https" ? "; Secure" : "";
  return `${STAFF_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}${secure}`;
}

export function getClientKey(request, context) {
  const address =
    context?.ip ||
    String(request.headers.get("x-forwarded-for") || "local")
      .split(",")[0]
      .trim();
  return createHash("sha256").update(address).digest("hex");
}
