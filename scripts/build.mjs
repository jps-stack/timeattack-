import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, "dist");
const staticEntries = ["index.html", "staff-login.html", "assets"];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const entry of staticEntries) {
  await cp(join(root, entry), join(output, entry), { recursive: true });
}

const html = await readFile(join(output, "index.html"), "utf8");
if (!html.includes("/assets/car-selector.css") || !html.includes("/assets/car-selector.js")) {
  throw new Error("index.html no incluye las mejoras visuales de VM Time Attack");
}

console.log(`Static site ready in ${output}`);
