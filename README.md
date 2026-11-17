# Pravaah

*(प्रवाह — "flow". Formerly "Nabz". The npm workspace scope is still `@nabz/*` internally.)*

**See today's beds before they jam.** Pravaah is a bed-flow digital twin for a small hospital. A
nurse photographs the three paper registers they already keep; Nabz reads them into numbers,
simulates the whole day minute-by-minute, shows where beds will jam, and produces an ordered
discharge list — in English and Hindi.

This repository is a full application: a React frontend, a Node/Fastify API, a PostgreSQL
database, and a shared simulation engine, all dockerized.

---

## Quick start (Docker)

```bash
cp .env.example .env        # adjust ports/credentials if you like
docker compose up --build   # builds db + api + web
```

Then open **http://localhost:8088** (the `WEB_PORT`).

- `web` — nginx serving the React build, reverse-proxying `/api` to the API (one origin, no CORS).
- `api` — Fastify; on start it applies Prisma migrations, seeds the sample day, then serves on `:3000`.
- `db` — PostgreSQL 16, data in the `nabz_db` volume.

Stop with `docker compose down` (add `-v` to wipe the database volume).

---

## Architecture

```
nabz/
  packages/engine/   Shared, deterministic simulation (TypeScript). Runs in BOTH the
                     browser (instant scrubbing/playback) and the API (authoritative runs
                     + heavy Monte-Carlo). One codebase → identical results everywhere.
  apps/api/          Fastify + Prisma + PostgreSQL. Engine endpoints, the assistant
                     boundary, and persistence (readings, days, plans).
  apps/web/          React + Vite. The four screens, the digital-twin floor, and the
                     redesigned day playback.
  legacy/            The original static prototype, kept for reference.
```

**Why TypeScript everywhere:** the engine is the crown jewel (a discrete-event model of the
bed chain: discharge paperwork → ward → ICU → theatres, plus ER boarding). Sharing it as one
package means the browser and server can never disagree about what today looks like.

### The four screens
1. **Registers** — photograph the bed register, theatre list and ICU board. The assistant reads them.
2. **Check** — confirm the numbers (a wrong count means a wrong forecast).
3. **Today** — the single-screen control room (below).
4. **Discharge list** — an ordered, bilingual action list with per-step tick-offs.

### The "Today" control room
The old prototype flashed the whole 13-hour day in ~11 seconds across a page you had to
scroll. "Today" is now one screen, no scrolling, built to be understood by someone who doesn't
know the jargon:

- **The hospital as a flow.** Five labelled *stations* — Theatres → Intensive care → Ward →
  Discharge, with Emergency feeding the ward — each with a one-line "what this is," an occupancy
  bar, and **patient tokens that travel along the arrows** so you see the flow. Click a station to
  see its individual beds.
- **A guided walkthrough by default.** It auto-plays from the morning (Slow / Normal / Fast),
  and **pauses at each jam with a plain-language callout** — what jammed, what it causes, and why —
  then you press *Keep playing*. *Take control* switches to free scrubbing at any time.
- **A live narration panel.** "What's happening" tells the story in plain English as the clock
  runs ("An intensive-care patient is well enough for the ward, but every ward bed is full…"),
  headed by the **cause-and-effect summary** of the whole day.
- **A bottleneck spotlight.** The station that's jamming is ringed and tagged, so the eye goes
  straight to the constraint.
- **Side tools on demand.** *Ask Nabz*, *Test a plan* and the by-tonight numbers live in a
  slide-over ("What can we do?"), so the simulation stays the focus.

The narration is produced by a presentation-layer narrator (`apps/web/src/narrator.ts`) that
derives the story from the simulation result, so the engine — and its parity tests — are
untouched.

---

## The assistant (swappable "stub brain")

OCR of the register photos and the bilingual Q&A sit behind an `AssistantProvider` interface
(`apps/api/src/providers/`). Today the `ScriptedProvider` is wired in — intent matching plus
answer templates whose every number comes from the engine. To make it real later, implement the
same interface with a model (e.g. Sarvam for Indian-language OCR + chat) and set
`ASSISTANT_PROVIDER=model`. No routes change.

---

## Local development (without Docker)

Requires Node ≥ 20, pnpm 9, and a PostgreSQL you can point `DATABASE_URL` at.

```bash
pnpm install
pnpm --filter @nabz/engine build        # build the shared engine first

# API
cd apps/api
cp ../../.env.example .env               # set DATABASE_URL to your local Postgres
pnpm prisma:migrate:dev                  # create/apply migrations
pnpm seed
pnpm dev                                 # http://localhost:3000

# Web (new terminal)
pnpm --filter @nabz/web dev              # http://localhost:5173, proxies /api -> :3000
```

## Tests

```bash
pnpm --filter @nabz/engine test   # golden parity tests vs the original engine (13)
pnpm --filter @nabz/api test      # API route tests (7)
pnpm -r build                     # typecheck + build everything
```

The engine's golden tests assert the TypeScript port is **bit-identical** to the original
`legacy/js/engine.js` across simulate / risk / best-plan. Regenerate fixtures with
`pnpm --filter @nabz/engine gen:golden` only if you intentionally change engine behavior.

---

## Environment variables

See `.env.example`. Key ones: `DATABASE_URL`, `WEB_PORT` (default 8088), `API_PORT` (3000),
`HOSPITAL_NAME`, `ASSISTANT_PROVIDER` (`scripted` | `model`), and the `SARVAM_*` placeholders
for a future real model.

> Demo build: the hospital, patients and registers are invented, and the assistant's wording is
> scripted. Every number on screen is computed by the simulation.
