// Response cache: memory always, disk under ./.cache when the filesystem allows it.
// Keeps us inside API rate limits and makes demo runs repeatable.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const memory = new Map<string, unknown>();
const CACHE_DIR = path.join(process.cwd(), ".cache");

const fileFor = (key: string) =>
  path.join(CACHE_DIR, `${createHash("sha1").update(key).digest("hex")}.json`);

export async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (memory.has(key)) return memory.get(key) as T;

  try {
    const hit = JSON.parse(await readFile(fileFor(key), "utf8")) as T;
    memory.set(key, hit);
    return hit;
  } catch {
    // miss or unreadable — fall through to a fresh load
  }

  const value = await load();
  memory.set(key, value);
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(fileFor(key), JSON.stringify(value));
  } catch {
    // read-only filesystem (e.g. serverless) — memory cache still applies
  }
  return value;
}
