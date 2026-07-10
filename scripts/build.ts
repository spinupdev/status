import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Service, Ping, DailyEntry, Incident } from "./types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const DOCS_DIR = path.join(ROOT, "docs");
const CUSTOM_DOMAIN = "status.dvito.cloud";
const CONFIG_PATH = path.join(ROOT, "config", "services.json");

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function esc(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function dayColor(entry: DailyEntry | undefined): string {
  if (!entry || entry.checks === 0) return "var(--muted)";
  const uptime = entry.upChecks / entry.checks;
  if (uptime >= 0.999) return "var(--ok)";
  if (uptime >= 0.95) return "var(--warn)";
  return "var(--down)";
}

function buildDayBars(daily: DailyEntry[]): string {
  const days = 90;
  const byDate = new Map(daily.map((d) => [d.date, d]));
  const bars: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const date = d.toISOString().slice(0, 10);
    const entry = byDate.get(date);
    const uptime = entry && entry.checks ? ((entry.upChecks / entry.checks) * 100).toFixed(2) : null;
    const title = entry ? `${date}: ${uptime}% uptime (${entry.upChecks}/${entry.checks} checks)` : `${date}: no data`;
    bars.push(`<span class="bar" style="background:${dayColor(entry)}" title="${esc(title)}"></span>`);
  }
  return bars.join("");
}

function computeUptimePct(daily: DailyEntry[]): string | null {
  if (!daily.length) return null;
  let checks = 0;
  let up = 0;
  for (const d of daily) {
    checks += d.checks;
    up += d.upChecks;
  }
  if (!checks) return null;
  return ((up / checks) * 100).toFixed(2);
}

function latestPing(pings: Ping[]): Ping | null {
  return pings.length ? pings[pings.length - 1]! : null;
}

async function buildServiceCard(service: Service): Promise<{ html: string; up: boolean | null }> {
  const dir = path.join(DATA_DIR, service.slug);
  const pings = await readJson<Ping[]>(path.join(dir, "pings.json"), []);
  const daily = await readJson<DailyEntry[]>(path.join(dir, "daily.json"), []);
  const last = latestPing(pings);
  const up = last ? last.ok : null;
  const statusLabel = up === null ? "Pending" : up ? "Operational" : "Down";
  const statusClass = up === null ? "pending" : up ? "up" : "down";
  const uptimePct = computeUptimePct(daily);
  const latency = last ? `${last.ms}ms` : "—";

  const html = `
  <div class="card">
    <div class="card-top">
      <div class="card-title">
        <span class="dot ${statusClass}"></span>
        <span class="name">${esc(service.name)}</span>
      </div>
      <span class="status-label ${statusClass}">${statusLabel}</span>
    </div>
    <div class="card-meta">
      <span>${uptimePct !== null ? uptimePct + "% uptime (90d)" : "collecting data"}</span>
      <span class="latency">${latency}</span>
    </div>
    <div class="bars">${buildDayBars(daily)}</div>
  </div>`;
  return { html, up };
}

function buildIncidents(incidents: Incident[]): string {
  const sorted = [...incidents].sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime()).slice(0, 15);
  if (!sorted.length) {
    return `<p class="empty">No incidents recorded.</p>`;
  }
  return sorted
    .map((inc) => {
      const start = new Date(inc.start);
      const end = inc.end ? new Date(inc.end) : null;
      const durationMin = end ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000)) : null;
      return `
    <div class="incident">
      <span class="dot ${end ? "down" : "down live"}"></span>
      <div class="incident-body">
        <div class="incident-title">${esc(inc.name)} — ${end ? "Resolved" : "Ongoing outage"}</div>
        <div class="incident-time">${start.toISOString().replace("T", " ").slice(0, 16)} UTC${end ? ` · ${durationMin} min` : ""}</div>
      </div>
    </div>`;
    })
    .join("");
}

const PRODUCT_LABEL: Record<string, string> = {
  zeish: "Zeish",
  arin: "Arin",
};

const LOGO_SVG = `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="logo">
  <rect width="64" height="64" rx="18" fill="url(#logo-bg)" />
  <rect x="6" y="6" width="52" height="52" rx="12" fill="url(#logo-panel)" stroke="url(#logo-stroke)" stroke-width="1.5" />
  <path d="M18 19H46L28 32H46V45H18L36 32H18V19Z" fill="url(#logo-z)" />
  <circle cx="48.5" cy="15.5" r="3" fill="#22D3EE" fill-opacity="0.9" />
  <circle cx="16" cy="48" r="2.5" fill="#FB7185" fill-opacity="0.85" />
  <defs>
    <linearGradient id="logo-bg" x1="5" y1="4" x2="59" y2="60" gradientUnits="userSpaceOnUse">
      <stop stop-color="#05070D" /><stop offset="0.55" stop-color="#11142A" /><stop offset="1" stop-color="#220C18" />
    </linearGradient>
    <linearGradient id="logo-panel" x1="10" y1="9" x2="54" y2="55" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0A0D16" /><stop offset="1" stop-color="#120B12" />
    </linearGradient>
    <linearGradient id="logo-stroke" x1="10" y1="8" x2="54" y2="57" gradientUnits="userSpaceOnUse">
      <stop stop-color="#22D3EE" stop-opacity="0.7" /><stop offset="0.52" stop-color="#F97316" stop-opacity="0.5" /><stop offset="1" stop-color="#FB7185" stop-opacity="0.7" />
    </linearGradient>
    <linearGradient id="logo-z" x1="20" y1="19" x2="43" y2="45" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FACC15" /><stop offset="0.38" stop-color="#22D3EE" /><stop offset="0.72" stop-color="#A78BFA" /><stop offset="1" stop-color="#FB7185" />
    </linearGradient>
  </defs>
</svg>`;

const CSS = `
:root {
  --background: #000000;
  --foreground: #f5f5f5;
  --card: #0a0a0a;
  --border: rgba(255, 255, 255, 0.08);
  --muted: #222222;
  --muted-foreground: #888888;
  --ok: #00e5a0;
  --warn: #facc15;
  --down: #fb7185;
  --radius: 1.25rem;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background-color: var(--background);
  background-image:
    radial-gradient(ellipse 80% 50% at 50% -20%, rgba(0, 229, 160, 0.08), transparent 60%),
    radial-gradient(ellipse 60% 40% at 80% 10%, rgba(0, 229, 160, 0.03), transparent 50%);
  color: var(--foreground);
  font-family: "Inter", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
main {
  max-width: 760px;
  margin: 0 auto;
  padding: 3rem 1.25rem 5rem;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2rem;
}
.brand { display: flex; align-items: center; gap: 0.75rem; }
.logo { width: 2.25rem; height: 2.25rem; }
.brand-name { font-size: 1.25rem; font-weight: 600; letter-spacing: -0.02em; }
.gradient-text {
  display: inline-block;
  color: transparent;
  background: linear-gradient(90deg, #00e5a0 0%, #4bf6c6 25%, #22d3ee 50%, #60a5fa 75%, #00e5a0 100%);
  background-size: 200% auto;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: gradient-shift 4s linear infinite;
}
@keyframes gradient-shift { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
.repo-link {
  color: var(--muted-foreground);
  text-decoration: none;
  font-size: 0.875rem;
  border: 1px solid var(--border);
  padding: 0.4rem 0.9rem;
  border-radius: 999px;
  transition: all 0.2s ease;
}
.repo-link:hover { color: var(--foreground); border-color: rgba(255,255,255,0.2); }

.banner {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.9rem 1.25rem;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--foreground) 2%, transparent);
  font-weight: 600;
  margin-bottom: 1.5rem;
}
.banner.up { border-color: rgba(0, 229, 160, 0.25); box-shadow: 0 0 44px rgba(0, 229, 160, 0.06), inset 0 1px 0 rgba(0, 229, 160, 0.1); }
.banner.down { border-color: rgba(251, 113, 133, 0.3); }

.filters {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.75rem;
}
.filter-btn {
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--muted-foreground);
  background: color-mix(in srgb, var(--foreground) 2%, transparent);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.4rem 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
}
.filter-btn:hover { color: var(--foreground); border-color: rgba(255,255,255,0.2); }
.filter-btn.active { color: #000; background: var(--ok); border-color: var(--ok); }

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;
}
.dot.up { background: var(--ok); box-shadow: 0 0 8px rgba(0, 229, 160, 0.7); }
.dot.down { background: var(--down); box-shadow: 0 0 8px rgba(251, 113, 133, 0.7); }
.dot.pending { background: var(--muted-foreground); }
.dot.live { animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

.product-group { margin-bottom: 1.75rem; }
.product-group[hidden] { display: none; }
.product-heading {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted-foreground);
  margin: 0 0 0.7rem 0.2rem;
}
.cards { display: flex; flex-direction: column; gap: 0.875rem; }
.card {
  background: color-mix(in srgb, var(--foreground) 2%, transparent);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.1rem 1.25rem;
  backdrop-filter: blur(8px);
}
.card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.6rem; }
.card-title { display: flex; align-items: center; gap: 0.55rem; }
.name { font-weight: 600; font-size: 0.95rem; }
.status-label { font-size: 0.8rem; font-weight: 600; }
.status-label.up { color: var(--ok); }
.status-label.down { color: var(--down); }
.status-label.pending { color: var(--muted-foreground); }
.card-meta {
  display: flex;
  justify-content: space-between;
  color: var(--muted-foreground);
  font-size: 0.8rem;
  font-family: "JetBrains Mono", monospace;
  margin-bottom: 0.75rem;
}
.bars { display: flex; gap: 2px; overflow: hidden; }
.bar { flex: 1; min-width: 2px; height: 26px; border-radius: 2px; }

.incidents-section { margin-top: 1.25rem; }
.incidents-section h2 { font-size: 1rem; font-weight: 600; margin-bottom: 1rem; letter-spacing: -0.02em; }
.incidents { display: flex; flex-direction: column; gap: 0.75rem; }
.incident {
  display: flex;
  gap: 0.75rem;
  padding: 0.9rem 1.1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--foreground) 2%, transparent);
}
.incident .dot { margin-top: 0.3rem; }
.incident-title { font-weight: 600; font-size: 0.875rem; }
.incident-time { color: var(--muted-foreground); font-size: 0.8rem; font-family: "JetBrains Mono", monospace; margin-top: 0.2rem; }
.empty { color: var(--muted-foreground); font-size: 0.875rem; }

.footer {
  margin-top: 3rem;
  display: flex;
  justify-content: space-between;
  color: var(--muted-foreground);
  font-size: 0.78rem;
  font-family: "JetBrains Mono", monospace;
  border-top: 1px solid var(--border);
  padding-top: 1.25rem;
}
@media (max-width: 480px) {
  .footer { flex-direction: column; gap: 0.35rem; }
}
`;

const FILTER_SCRIPT = `
document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const filter = btn.dataset.filter;
    document.querySelectorAll(".product-group").forEach((group) => {
      const match = filter === "all" || group.dataset.product === filter;
      group.hidden = !match;
    });
  });
});
`;

async function main(): Promise<void> {
  const services = await readJson<Service[]>(CONFIG_PATH, []);
  const incidents = await readJson<Incident[]>(path.join(DATA_DIR, "incidents.json"), []);

  const products = [...new Set(services.map((s) => s.product))];

  let anyDown = false;
  let anyPending = false;
  const cardsByProduct = new Map<string, string[]>();

  for (const service of services) {
    const { html, up } = await buildServiceCard(service);
    if (up === null) anyPending = true;
    else if (!up) anyDown = true;
    if (!cardsByProduct.has(service.product)) cardsByProduct.set(service.product, []);
    cardsByProduct.get(service.product)!.push(html);
  }

  const overall = anyDown ? "Degraded Performance" : anyPending ? "Checks Starting" : "All Systems Operational";
  const overallClass = anyDown ? "down" : anyPending ? "pending" : "up";
  const updatedAt = new Date().toISOString().replace("T", " ").slice(0, 16);

  const filterButtons = [
    `<button class="filter-btn active" data-filter="all">All</button>`,
    ...products.map((p) => `<button class="filter-btn" data-filter="${esc(p)}">${esc(PRODUCT_LABEL[p] ?? p)}</button>`),
  ].join("\n    ");

  const productSections = products
    .map((product) => {
      const cards = cardsByProduct.get(product) ?? [];
      return `
  <section class="product-group" data-product="${esc(product)}">
    <h3 class="product-heading">${esc(PRODUCT_LABEL[product] ?? product)}</h3>
    <div class="cards">${cards.join("\n")}</div>
  </section>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Zeish Status</title>
<meta name="description" content="Live status and uptime history for Zeish and Arin.">
<style>${CSS}</style>
</head>
<body>
<main>
  <header class="header">
    <div class="brand">
      ${LOGO_SVG}
      <span class="brand-name">Zeish <span class="gradient-text">Status</span></span>
    </div>
    <a class="repo-link" href="https://github.com/spinupdev/status">Source</a>
  </header>

  <section class="banner ${overallClass}">
    <span class="dot ${overallClass}"></span>
    <span>${overall}</span>
  </section>

  <div class="filters">
    ${filterButtons}
  </div>
${productSections}

  <section class="incidents-section">
    <h2>Incident History</h2>
    <div class="incidents">
      ${buildIncidents(incidents)}
    </div>
  </section>

  <footer class="footer">
    <span>Checked every minute via GitHub Actions</span>
    <span>Last updated ${updatedAt} UTC</span>
  </footer>
</main>
<script>${FILTER_SCRIPT}</script>
</body>
</html>`;

  await mkdir(DOCS_DIR, { recursive: true });
  await writeFile(path.join(DOCS_DIR, "index.html"), html);
  await writeFile(path.join(DOCS_DIR, ".nojekyll"), "");
  // Regenerated every build so the custom domain survives docs/ being rebuilt from scratch each run.
  await writeFile(path.join(DOCS_DIR, "CNAME"), CUSTOM_DOMAIN + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
