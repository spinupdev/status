import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Service, Ping, DailyEntry, Incident, StateMap, CheckResult, LastCheck } from "./types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const CONFIG_PATH = path.join(ROOT, "config", "services.json");

const TIMEOUT_MS = 10_000;
const MAX_PINGS = 2880; // ~2 days at 1 check/min
const MAX_DAILY = 90; // days of rollup history kept

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value));
}

async function checkService(service: Service): Promise<CheckResult> {
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(service.url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "zeish-status-page/1.0" },
    });
    clearTimeout(timer);
    // Any response under 500 means the host answered — treat as up.
    return { ok: res.status < 500, status: res.status, ms: Math.round(performance.now() - start) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, ms: Math.round(performance.now() - start), error: message };
  }
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

async function updateServiceData(service: Service, result: CheckResult, now: string): Promise<void> {
  const dir = path.join(DATA_DIR, service.slug);
  const pingsFile = path.join(dir, "pings.json");
  const dailyFile = path.join(dir, "daily.json");

  const pings = await readJson<Ping[]>(pingsFile, []);
  pings.push({ t: now, ok: result.ok, ms: result.ms, status: result.status });
  while (pings.length > MAX_PINGS) pings.shift();
  await writeJson(pingsFile, pings);

  const daily = await readJson<DailyEntry[]>(dailyFile, []);
  const date = todayUTC();
  let entry = daily.find((d) => d.date === date);
  if (!entry) {
    entry = { date, checks: 0, upChecks: 0, totalMs: 0 };
    daily.push(entry);
  }
  entry.checks += 1;
  entry.upChecks += result.ok ? 1 : 0;
  entry.totalMs += result.ms;
  while (daily.length > MAX_DAILY) daily.shift();
  await writeJson(dailyFile, daily);
}

async function updateIncidents(service: Service, result: CheckResult, now: string, state: StateMap): Promise<void> {
  const incidentsFile = path.join(DATA_DIR, "incidents.json");
  const incidents = await readJson<Incident[]>(incidentsFile, []);
  const prev = state[service.slug];
  const wasUp = prev ? prev.status === "up" : true;

  if (wasUp && !result.ok) {
    incidents.push({ slug: service.slug, name: service.name, start: now, end: null });
    state[service.slug] = { status: "down", since: now };
  } else if (!wasUp && result.ok) {
    const open = [...incidents].reverse().find((i) => i.slug === service.slug && i.end === null);
    if (open) open.end = now;
    state[service.slug] = { status: "up", since: now };
  } else if (!prev) {
    state[service.slug] = { status: result.ok ? "up" : "down", since: now };
  }

  await writeJson(incidentsFile, incidents);
}

async function main(): Promise<void> {
  const services = await readJson<Service[]>(CONFIG_PATH, []);
  const now = new Date().toISOString();
  const statePath = path.join(DATA_DIR, "state.json");
  const state = await readJson<StateMap>(statePath, {});

  const results: LastCheck["results"] = {};
  for (const service of services) {
    const result = await checkService(service);
    results[service.slug] = result;
    await updateServiceData(service, result, now);
    await updateIncidents(service, result, now, state);
    console.log(`[${now}] ${service.name}: ${result.ok ? "UP" : "DOWN"} (${result.status}, ${result.ms}ms)`);
  }

  await writeJson(statePath, state);
  await writeJson(path.join(DATA_DIR, "last-check.json"), { t: now, results } satisfies LastCheck);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
