# Zeish Status

Uptime status page for Zeish infrastructure. No servers, no third-party
monitoring SaaS — just GitHub Actions checking each endpoint and committing
the results, and GitHub Pages serving the generated page.

## How it works

- [`config/services.json`](config/services.json) lists the monitored
  endpoints, each tagged with a `product` (`zeish` / `arin`) and `kind`
  (`frontend` / `backend`). The page groups cards by product and has
  client-side filter pills to show just one product at a time.
- [`scripts/healthcheck.ts`](scripts/healthcheck.ts) pings each one, appends
  the result to `data/<slug>/pings.json` (rolling ~2 day window) and
  `data/<slug>/daily.json` (90-day uptime rollup), and opens/closes entries
  in `data/incidents.json` when a service's status flips.
- [`scripts/build.ts`](scripts/build.ts) renders `data/` into a static
  `docs/index.html`, styled to match [zeish.dev](../website)'s dark theme.
- [`.github/workflows/healthcheck.yml`](.github/workflows/healthcheck.yml)
  runs on GitHub's shortest cron interval (5 minutes) but loops 5 times
  internally with a 60s sleep, committing after each pass — so checks land
  roughly once a minute even though the scheduler can't trigger that often.

Scripts are plain `.ts` files run directly with `node` — Node 24 strips
TypeScript types natively (no `ts-node`/`tsx`, no build step, no extra
dependencies).

Everything (data + the built page) lives in git history on `main`, so
GitHub Pages just needs to serve `/docs` — no separate deploy step.

## One-time setup after creating the GitHub repo

Settings → Pages → Source: **Deploy from a branch** → Branch: `main`, folder: `/docs`.

Custom domain: `status.dvito.cloud`. `scripts/build.ts` writes `docs/CNAME`
on every build (it has to — `docs/` is regenerated from scratch each run,
so the CNAME file would otherwise get wiped the first time the workflow
commits). In Cloudflare DNS, add:

| Type  | Name     | Target                | Proxy status |
|-------|----------|------------------------|--------------|
| CNAME | `status` | `spinupdev.github.io` | DNS only (grey cloud) |

Keep it DNS-only until GitHub finishes issuing the HTTPS certificate for
the domain (Settings → Pages will show "DNS check successful" then an
"Enforce HTTPS" checkbox) — Cloudflare's proxy can interfere with that
initial validation. Safe to switch to proxied afterwards if you want.

## Local usage

```bash
npm run check   # run one round of health checks against config/services.json
npm run build   # regenerate docs/index.html from the current data/
```

## Notes

- A check counts as "up" if the host returns any status code under 500
  (i.e. it's reachable and answering), not necessarily HTTP 200 — endpoints
  without a root route would otherwise show as permanently down.
- Repo must stay **public** for unlimited free GitHub Actions minutes; a
  private repo would burn through the 2,000 free minutes/month in a few days
  at this check frequency.
- Zeish Backend (`api-edge.dvito.cloud`) and Arin Frontend
  (`arin.dvito.cloud`) share the same origin host, so they tend to go down
  together — that's expected, not a bug in the checker.
