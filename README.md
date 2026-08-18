# Sales Champions TV

A Spinify-style sales leaderboard for real-estate offices. An office TV runs a
full-screen, esports-styled carousel of sales leaderboards, team goal progress,
hot listings and announcements — and the moment a sale is recorded in the admin
console, every TV interrupts its carousel to play a full-screen celebration
with the agent's personal anthem.

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
4. Deploy (push to the connected branch). Database migrations run
   automatically on server start.
5. Run the seed once against the deployed service:
   `railway run npm run db:seed` (append `-- --demo` for demo data).

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
- **`/api/tv/register` has no authentication and no rate limiting** — any
  client that can reach it can mint a TV pairing code. Deploy on a trusted or
  internal network, or add rate limiting in front of it at the reverse proxy.
- **Set a body size limit at the reverse proxy.** The app already rejects
  oversized uploads early via the `Content-Length` header (`/api/uploads`,
  10MB cap), but treat that as a second line of defense — configure a limit
  such as `client_max_body_size` at the reverse proxy as the first one.

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
