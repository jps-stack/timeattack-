import { readFile } from "node:fs/promises";
import { getStaffSession } from "../lib/auth.mjs";

const indexPath = new URL("../../index.html", import.meta.url);
const loginPath = new URL("../../staff-login.html", import.meta.url);

export default async (request) => {
  if (!["GET", "HEAD"].includes(request.method)) {
    return new Response("Método no permitido", { status: 405 });
  }

  try {
    const authenticated = Boolean(getStaffSession(request));
    const html = await readFile(authenticated ? indexPath : loginPath, "utf8");
    return new Response(request.method === "HEAD" ? null : html, {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
        "x-frame-options": "DENY"
      }
    });
  } catch (error) {
    console.error("VM Time Attack admin error", error);
    return new Response("No se pudo abrir el panel Staff", { status: 500 });
  }
};
