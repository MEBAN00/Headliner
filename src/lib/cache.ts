// Response cache: memory always, plus disk — ./.cache locally, the OS temp dir on Vercel
// (the only writable place there; it survives while a function instance stays warm).
// Keeps us inside API rate limits and makes demo runs repeatable.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const memory = new Map<string, unknown>();
const CACHE_DIR = process.env.VERCEL ? path.join(tmpdir(), "headliner-cache") : path.join(process.cwd(), ".cache");

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
