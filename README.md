# Zeish Status

Uptime status page for Zeish infrastructure. No servers, no third-party
monitoring SaaS — just GitHub Actions checking each endpoint and committing
the results, and GitHub Pages serving the generated page.

## How it works

- [`config/services.json`](config/services.json) lists the monitored endpoints.
- [`scripts/healthcheck.mjs`](scripts/healthcheck.mjs) pings each one, appends
  the result to `data/<slug>/pings.json` (rolling ~2 day window) and
  `data/<slug>/daily.json` (90-day uptime rollup), and opens/closes entries
  in `data/incidents.json` when a service's status flips.
- [`scripts/build.mjs`](scripts/build.mjs) renders `data/` into a static
  `docs/index.html`, styled to match [zeish.dev](../website)'s dark theme.
- [`.github/workflows/healthcheck.yml`](.github/workflows/healthcheck.yml)
  runs on GitHub's shortest cron interval (5 minutes) but loops 5 times
  internally with a 60s sleep, committing after each pass — so checks land
  roughly once a minute even though the scheduler can't trigger that often.

Everything (data + the built page) lives in git history on `main`, so
GitHub Pages just needs to serve `/docs` — no separate deploy step.

## One-time setup after creating the GitHub repo

Settings → Pages → Source: **Deploy from a branch** → Branch: `main`, folder: `/docs`.

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
