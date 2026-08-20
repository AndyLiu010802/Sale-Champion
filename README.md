# Sales Champions TV

A Spinify-style sales leaderboard for real-estate offices. An office TV runs a
full-screen, esports-styled carousel of sales scorecards, leaderboards, team
goal progress and announcements — and the moment a sale is recorded in the admin
console, every TV interrupts its carousel to play a full-screen celebration
with the agent's personal anthem.

Every TV page (carousel, pairing screen and the offline state) renders on an
animated city-skyline background: the palette follows the real local time of
day (dawn → morning → midday → golden hour → sunset → night, anchored on the
day's actual sunrise/sunset) and layers live weather effects — rain, wind-blown
clouds, lightning, snow, fog and clear night stars — from Open-Meteo, defaulting
to Hobart (`WEATHER_LAT` / `WEATHER_LON` to change the location). A failing
weather link never affects the data display: the TV falls back to a clear sky
with fixed 06:30/19:00 sunrise/sunset.

Built as a single Next.js (App Router) application served by a custom Node
server that hosts a WebSocket hub on the same port. PostgreSQL via Drizzle ORM
(embedded PGlite in development), Tailwind CSS, Framer Motion, Vitest and
Playwright.

## Quickstart (local development)

Requirements: Node.js >= 20.

```bash
npm install
cp .env.example .env          # defaults are fine for local dev
npm run db:seed -- --demo     # creates org, admin user and demo data
npm run dev                   # http://localhost:3000
```

- Admin console: http://localhost:3000/admin — log in with `ADMIN_EMAIL` /
  `ADMIN_PASSWORD` from your `.env` (defaults: `admin@example.com` /
  `admin1234`).
- TV display: http://localhost:3000/tv
- Without `DATABASE_URL` the app uses an embedded PGlite database stored in
  `.data/pglite` — no local PostgreSQL needed.

## Pairing a TV

1. On the TV, open `https://<your-host>/tv` in a browser (kiosk / full-screen
   mode recommended). The screen shows a 6-character pairing code (valid for
   15 minutes; it refreshes automatically).
2. In the admin console go to **Screens**, enter the code under **Pair a TV**
   and give the screen a name.
3. The TV switches to a **CLICK TO START** overlay. Click once — this unlocks
   audio (a browser requirement) and enters the full-screen carousel.
4. The device token is stored in the TV browser's localStorage, so the TV
   reconnects automatically after a power cut or server restart — no
   re-pairing needed. Use **Unpair** on the Screens page to reset a TV.

## Environment variables

See `.env.example` for the authoritative list:

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (default `3000`) |
| `TZ` | Server timezone used for leaderboard periods, e.g. `Australia/Sydney`; also sets the 11:00 birthday-broadcast trigger time. |
| `SESSION_SECRET` | Secret for admin session cookies — random, at least 32 chars |
| `DATABASE_URL` | PostgreSQL connection string; leave unset to use embedded PGlite (dev) |
| `PGLITE_MEMORY` | `1` = in-memory database (tests only) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | First admin account, created by `npm run db:seed` |
| `STORAGE_DRIVER` | `local` (disk, dev) or `s3` (Cloudflare R2, production) |
| `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL` | Cloudflare R2 credentials, required when `STORAGE_DRIVER=s3` |
| `WEATHER_LAT` / `WEATHER_LON` | Coordinates for the TV background's live weather (default Hobart `-42.8794` / `147.3294`) |

## Deploying to Railway

1. Create a new Railway project from this repository. `railway.json` tells
   Railway to build with the `Dockerfile` and to health-check `/api/health`.
2. Add the **PostgreSQL** plugin to the project.
3. On the app service, set the variables:
   - `DATABASE_URL` — reference the plugin: `${{Postgres.DATABASE_URL}}`
   - `SESSION_SECRET` — a long random string (32+ chars)
   - `TZ` — e.g. `Australia/Sydney`
   - `STORAGE_DRIVER` — `s3`, plus `R2_ENDPOINT`, `R2_BUCKET`,
     `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL`
     (with `local`, uploads are written to the container disk and are lost on
     every redeploy — use R2 in production)
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` — credentials for the first admin
4. Deploy (push to the connected branch). `railway.json` declares a
   `preDeployCommand` of `npm run db:migrate`, which applies pending migrations
   once, before the new container starts serving. The app itself never runs
   DDL — it connects, checks that the schema is at least as new as the code,
   and refuses to start if it is not.
5. Run the seed once against the deployed service:
   `railway run npm run db:seed` (append `-- --demo` for demo data). The
   pre-deploy step has already created the schema by then; if you ever seed a
   database that has never been deployed to, run `railway run npm run db:migrate`
   first.
6. Leave the service's **Custom Start Command empty** so the `Dockerfile` `CMD`
   is used. In particular it must not run the seed: seeding on every boot is
   what caused the 2026-08-20 outage (see *Migrations* below).

## Production considerations

- **`SESSION_SECRET` must be replaced.** The app refuses to start if it is
  missing or shorter than 32 characters (`src/lib/auth/session.ts`) — never
  ship the placeholder value from `.env.example`. Generate a real random
  string of at least 32 characters for every deployment.
- **Set `ADMIN_PASSWORD` before seeding production.** If it is unset,
  `npm run db:seed` falls back to the default password `admin1234` and prints
  a console warning. That default is fine for local dev but must not be used
  in production.
- **`npm run db:seed` is a single-process operation.** It checks for existing
  rows before inserting (not an atomic upsert), so run it once from a single
  instance. Do not run it concurrently from multiple replicas or as part of a
  rolling deploy that fires on every instance.

### Migrations

Migrations are a deploy step, not a boot step. `npm run db:migrate` takes a
PostgreSQL advisory lock, applies everything pending, and exits; the serving
process only connects and calls `assertSchemaAtHead`, which refuses to listen
when the newest applied migration is older than the newest file in
`drizzle/meta/_journal.json`.

Both halves of that exist because of a real outage on 2026-08-20. Drizzle's
migrator reads "newest applied migration" *outside* its transaction and takes no
lock of its own, so two processes that migrate at once will both decide the same
migration is pending — the second one then replays DDL against a schema that
already has it and throws. Because migrations used to run inside `getDb()`,
which the server awaits before `server.listen()`, that throw meant nothing ever
bound the port, the health check failed for five minutes and the deploy was
rolled back with the site down. Two rules follow:

- **Write every migration so it can be applied twice.** `drizzle-kit generate`
  does not do this for you: prefer `ADD COLUMN IF NOT EXISTS`, and
  `DROP CONSTRAINT IF EXISTS` before `ADD CONSTRAINT`.
- **Nothing that serves requests may run migrations.** Keep the Railway start
  command empty, and never wire `db:seed` (which calls `getDb()`) into startup.

Failing closed is deliberate. A container that will not start leaves the
previous one serving; a container that starts against a stale schema looks
healthy and then 42703s on the first request that touches a new column.
- **`/api/tv/register` has no authentication and no rate limiting** — any
  client that can reach it can mint a TV pairing code. Deploy on a trusted or
  internal network, or add rate limiting in front of it at the reverse proxy.
- **Set a body size limit at the reverse proxy.** The app already rejects
  oversized uploads early via the `Content-Length` header (`/api/uploads`,
  10MB cap), but treat that as a second line of defense — configure a limit
  such as `client_max_body_size` at the reverse proxy as the first one.
- **Upgrading past the scorecard feature commit resets TV slide
  customization once.** The settings row's slide list grew from 6/7 keys to
  8 (`scorecard` and `scorecard_ytd` were added); an old stored row fails
  validation on first read after the upgrade and falls back to the new
  8-key defaults, silently dropping any custom slide order, enabled/disabled
  toggles or per-slide durations. An admin needs to reconfigure slides once
  after that upgrade.
- **Upgrading past the TV cleanup commit resets TV slide customization once
  more.** The Hot Listings carousel slide was removed entirely, shrinking the
  slide list from 8 keys to 7; a stored 8-key settings row fails validation on
  first read and falls back to the new 7-key defaults (same mechanism as the
  previous upgrades). Reconfigure slides once after upgrading.

## Importing real data

`docs/import/2026-08-south-scorecard.sql` is an idempotent bulk import of
real SOUTH. scorecard data for July–August 2026 (agents, sales, listings and
appraisals). Re-running it is safe and has no side effects — it checks for
existing rows before inserting.

- Local: `npx tsx scripts/run-sql.ts docs/import/2026-08-south-scorecard.sql`
- Production: open the Railway PostgreSQL plugin's **Data** tab and paste
  and run the whole file — it can be re-run without duplicating data.

### Teams

A member's **Type** is `Agent`, `Staff` or `Team`. A Team row stands in for a
group of agents: pick Team in the member dialog and tick its members in the
**Members** list (ticking moves an agent out of whatever team it was in). A
Team has no birthday, and its members keep their own photo, birthday broadcast
and anthem.

Performance is recorded against the team, never against its members: the
agent dropdowns on Sales, Listings and Appraisals list Team rows and agents
who belong to no team, and the API rejects anything else with
`400 Unknown agent`. Leaderboards and the scorecard follow the same rule, so a
team appears once and its members never appear separately. Rows a member
recorded *before* joining a team still count toward org goal totals. When a
team sells, the celebration shows the team name with all of its active
members' photos side by side. Deleting a team releases its members (they
survive, unattached) and removes only the team's own sales, listings and
appraisals.

`docs/import/2026-08-teams.sql` migrates the standing data: it converts the
three existing group rows (Hill & Co, Team Cowley, Team Brudenell) into Team
rows in place and creates their seven members, attached and without photos —
upload those from the Team page afterwards. It is idempotent and expects
`2026-08-south-scorecard.sql` to have been run first; run it the same two ways
as the import above.

## Architecture

One Next.js application served by a custom Node server (`server.ts` →
`src/server/bootstrap.ts`) that hosts both the HTTP app and a `ws`
WebSocketServer on `/ws` on the same port. Admin CRUD API routes write to
PostgreSQL through Drizzle ORM and broadcast events (`celebration.play`,
`data.updated`, `config.updated`) through an in-process hub to every paired
TV, so a recorded sale reaches all TVs in under two seconds without any
message queue. TVs are plain browser clients paired with 6-character codes;
they cache their state locally and render the carousel without per-slide
requests. Money is stored as integer cents; every table carries an `org_id`
so the schema is ready for multi-tenancy. Uploaded files (agent photos,
anthems, listing photos) go to local disk in development and Cloudflare R2
(S3 API) in production. A `CrmAdapter` interface (`src/lib/crm/adapter.ts`)
reserves the integration point for future CRM sync (Agentbox first).

```
server.ts               # entry point — custom Node server (Next + WebSocket, one port)
src/
  server/bootstrap.ts   # server assembly: Next handler + /ws upgrade + WS hub wiring
  lib/                  # domain logic: db (Drizzle), auth, leaderboards, pairing,
                        # carousel reducer, settings, storage drivers, WS hub, CRM adapter
  app/                  # Next.js App Router: / (landing), /tv, /admin, /api/*
  components/           # tv/ (slides, celebration overlay, audio) and admin/ UI kit
  hooks/                # useTvSocket — TV WebSocket lifecycle
tests/                  # Vitest unit + integration tests (in-memory PGlite)
e2e/                    # Playwright end-to-end tests
drizzle/                # generated SQL migrations
```

## Testing

```bash
npm test                            # unit + integration tests (Vitest)
npx playwright install chromium     # once, before the first e2e run
npm run build && npm run test:e2e   # end-to-end tests (Playwright)
```
