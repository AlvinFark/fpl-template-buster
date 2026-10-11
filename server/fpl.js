import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const BASE = 'https://fantasy.premierleague.com/api';
const CACHE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '.cache');
const DEFAULT_TTL = 5 * 60 * 1000;

const mem = new Map(); // path -> {at, data}
const inflight = new Map(); // path -> Promise (dedup concurrent fetches)

// Global upstream concurrency guard.
const MAX_CONCURRENT = 6;
let running = 0;
const waitQueue = [];
const acquire = () =>
  running < MAX_CONCURRENT
    ? (running++, Promise.resolve())
    : new Promise((r) => waitQueue.push(r)).then(() => running++);
const release = () => {
  running--;
  waitQueue.shift()?.();
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cacheFile = (key) =>
  path.join(CACHE_DIR, crypto.createHash('sha1').update(key).digest('hex') + '.json');

async function readDisk(key) {
  try {
    return JSON.parse(await fs.readFile(cacheFile(key), 'utf8'));
  } catch {
    return null;
  }
}

async function writeDisk(key, entry) {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(cacheFile(key), JSON.stringify(entry));
  } catch {
    /* disk cache is best-effort */
  }
}

async function fetchJson(url, attempt = 0) {
  const res = await fetch(url, { headers: { 'User-Agent': 'template-buster/1.0' } });
  if (res.ok) return res.json();
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    const retryAfter = Number(res.headers.get('retry-after')) * 1000 || 0;
    await sleep(Math.max(retryAfter, 500 * 2 ** attempt) + Math.random() * 300);
    return fetchJson(url, attempt + 1);
  }
  const err = new Error(`FPL API ${url} -> ${res.status}`);
  err.status = res.status;
  throw err;
}

// ttl: ms before a cached entry is refetched (Infinity = immutable).
// isStale(data): extra freshness check applied even within ttl — use for data
// that grows over time (e.g. element-summary gaining a new round row).
export async function fplFetch(pathname, { ttl = DEFAULT_TTL, isStale } = {}) {
  const fresh = (e) =>
    e && Date.now() - e.at < ttl && !isStale?.(e.data) ? e : null;

  const hit = fresh(mem.get(pathname)) ?? fresh(await readDisk(pathname));
  if (hit) {
    mem.set(pathname, hit);
    return hit.data;
  }

  if (!inflight.has(pathname)) {
    inflight.set(
      pathname,
      (async () => {
        await acquire();
        try {
          const data = await fetchJson(`${BASE}${pathname}`);
          const entry = { at: Date.now(), data };
          mem.set(pathname, entry);
          writeDisk(pathname, entry);
          return data;
        } finally {
          release();
          inflight.delete(pathname);
        }
      })()
    );
  }
  return inflight.get(pathname);
}

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    })
  );
  return out;
}

export const api = {
  bootstrap: () => fplFetch('/bootstrap-static/'),
  entry: (id) => fplFetch(`/entry/${id}/`),
  transfers: (id) => fplFetch(`/entry/${id}/transfers/`),
  // Finished-GW picks are immutable; live-GW picks update as subs settle.
  picks: (id, gw, { finished = false } = {}) =>
    fplFetch(`/entry/${id}/event/${gw}/picks/`, { ttl: finished ? Infinity : 60 * 1000 }),
  // History rows for finished GWs never change; refetch while it lacks the
  // current GW's row (adds `selected` snapshot near deadline).
  elementSummary: (id, { currentGw } = {}) =>
    fplFetch(`/element-summary/${id}/`, {
      ttl: 30 * 60 * 1000,
      isStale: currentGw
        ? (d) => !d.history?.some((h) => h.round === currentGw)
        : undefined,
    }),
  live: (gw) => fplFetch(`/event/${gw}/live/`, { ttl: 60 * 1000 }),
  leagueStandings: (id, page = 1) =>
    fplFetch(`/leagues-classic/${id}/standings/?page_standings=${page}`),
};
