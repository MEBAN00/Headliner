// MapLibre 6 resolves its web worker relative to import.meta.url, which breaks once the bundler
// moves the code. We serve the worker (and the shared chunk it imports) from /public instead and
// point MapLibre at it with setWorkerUrl(). Runs before `dev` and `build`.

import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const from = path.join(root, "node_modules", "maplibre-gl", "dist");
const to = path.join(root, "public", "vendor", "maplibre");

await mkdir(to, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  await copyFile(path.join(from, file), path.join(to, file));
}
console.log("maplibre worker → public/vendor/maplibre");
