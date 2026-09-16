import { readFile } from "node:fs/promises";
import { getStore } from "@netlify/blobs";

const STORE_NAME = "vm-time-attack";
const STATE_KEY = "event/state";
const MAX_UPDATE_ATTEMPTS = 5;

function getDataStore() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

function clone(value) {
  return structuredClone(value);
}

async function readSeedState() {
  const text = await readFile(new URL("../seed/state.json", import.meta.url), "utf8");
  return JSON.parse(text);
}

async function getStateEntry() {
  const store = getDataStore();
  let entry = await store.getWithMetadata(STATE_KEY, { type: "json" });
  if (entry) return entry;

  const seed = await readSeedState();
  const created = await store.setJSON(STATE_KEY, seed, { onlyIfNew: true });
  if (created.modified) return { data: seed, etag: created.etag };

  entry = await store.getWithMetadata(STATE_KEY, { type: "json" });
  if (!entry) throw new Error("No se pudo inicializar el estado del evento");
  return entry;
}

export async function readState() {
  return clone((await getStateEntry()).data);
}

export async function updateState(mutator) {
  const store = getDataStore();
  for (let attempt = 0; attempt < MAX_UPDATE_ATTEMPTS; attempt += 1) {
    const current = await getStateEntry();
    const next = await mutator(clone(current.data));
    const result = await store.setJSON(STATE_KEY, next, { onlyIfMatch: current.etag });
    if (result.modified) return clone(next);
  }
  const error = new Error("El evento cambió al mismo tiempo. Intenta nuevamente.");
  error.statusCode = 409;
  throw error;
}

export async function readLoginAttempt(clientKey) {
  return (
    (await getDataStore().get(`login-attempts/${clientKey}`, { type: "json" })) || {
      count: 0,
      resetAt: Date.now() + 10 * 60 * 1000
    }
  );
}

export async function writeLoginAttempt(clientKey, attempt) {
  await getDataStore().setJSON(`login-attempts/${clientKey}`, attempt);
}

export async function deleteLoginAttempt(clientKey) {
  await getDataStore().delete(`login-attempts/${clientKey}`);
}

function logoKey(slot) {
  return `logos/${slot}.png`;
}

async function readSeedLogo(slot) {
  if (slot !== "sponsor") return null;
  try {
    return await readFile(new URL(`../seed/logos/${slot}.png`, import.meta.url));
  } catch {
    return null;
  }
}

export async function readLogo(slot) {
  const store = getDataStore();
  let logo = await store.get(logoKey(slot), { type: "arrayBuffer" });
  if (logo) return logo;

  const seed = await readSeedLogo(slot);
  if (!seed) return null;
  const bytes = seed.buffer.slice(seed.byteOffset, seed.byteOffset + seed.byteLength);
  await store.set(logoKey(slot), bytes, { onlyIfNew: true });
  logo = await store.get(logoKey(slot), { type: "arrayBuffer" });
  return logo || bytes;
}

export async function writeLogo(slot, bytes) {
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  await getDataStore().set(logoKey(slot), data);
}

export async function deleteLogo(slot) {
  await getDataStore().delete(logoKey(slot));
}
