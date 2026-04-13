# bouji.fm — Agent Instructions

## What this project is

A premium curated internet radio platform called **"The Listening Room"**. Users discover and listen to high-quality live radio stations. The experience is editorial and minimal — closer to Apple Music than a radio directory.

Built on top of a Go + Next.js SaaS starter with auth, subscriptions, and Azure infrastructure already in place.

## Monorepo structure

```
project-ostgut/
├── backend/          # Go 1.23, Gin, pgx/v5, golang-migrate
│   ├── cmd/api/      # main.go — entry point
│   ├── internal/
│   │   ├── config/   # env var loading
│   │   ├── db/       # pgxpool connection
│   │   ├── handler/  # HTTP handlers (auth, user, billing, station)
│   │   ├── middleware/  # JWT auth (sets "user_id" in context)
│   │   └── store/    # DB access layer (UserStore, SubscriptionStore, StationStore)
│   └── migrations/   # golang-migrate SQL files (embedded via iofs)
├── frontend/         # Next.js 14, App Router, TypeScript, Tailwind v4, shadcn/ui v4
│   └── src/
│       ├── app/
│       │   ├── (protected)/   # Auth-gated: dashboard, profile, settings, account
│       │   ├── auth/          # login, signup, forgot/reset password
│       │   └── page.tsx       # Public home / landing
│       ├── components/
│       │   └── ui/            # shadcn components
│       └── context/           # AuthContext, PlayerContext (audio player state)
└── infra/            # OpenTofu (Terraform) — Azure Container Apps + PostgreSQL
```

## Backend conventions

- **Package per layer**: `handler`, `store`, `middleware`, `config` — no cross-layer imports except handler→store→db
- **Context key for user ID**: always `"user_id"` (set by auth middleware). Use `middleware.GetUserID(c)` in handlers, never `c.Get("userID")`
- **Error sentinel**: `store.ErrNotFound` — check with `errors.Is` before returning 404
- **Migrations**: sequential numbered SQL files in `backend/migrations/`. Scheme must be `pgx5://` for golang-migrate (not `postgres://`). The app replaces the scheme at startup
- **pgcrypto is banned on Azure PostgreSQL Flexible Server** — use `gen_random_uuid()` built-in (PG 13+), no extension needed
- **Config**: all env vars loaded in `config.Load()`. Add new vars there, never call `os.Getenv` directly in handlers
- **Handler wiring**: `handler.New(userStore, subStore, logger, ...)` — add new stores/deps to the `Handler` struct in `handler.go` and `New()`

## Frontend conventions

- **shadcn v4 / Radix v2**: uses `render` prop pattern, NOT `asChild`. Example: `<SidebarMenuButton render={<Link href="/" />}>`
- **Tailwind v4**: uses `@import "tailwindcss"` + `@theme inline` block in `globals.css`. Do NOT use `@tailwind base/components/utilities`
- **Theme**: oklch color tokens, dark mode via `next-themes` + `.dark` class. Toggle in sidebar header
- **Auth**: `useAuth()` from `@/context/AuthContext` gives `{ user, session, signOut }`. `session.accessToken` is the JWT for backend calls
- **API calls**: use `process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'` as base URL, always pass `Authorization: Bearer ${session.accessToken}` on protected endpoints
- **Audio player**: global state in `PlayerContext` — persists across navigation. Player bar is pinned to bottom of the protected layout

## Key env vars

| Var | Where | Purpose |
|-----|-------|---------|
| `DATABASE_URL` | backend | `postgres://` scheme (auto-converted to `pgx5://` for migrations) |
| `JWT_SECRET` | backend + frontend (`AUTH_SECRET`) | shared HS256 signing key |
| `ALLOWED_ORIGINS` | backend | comma-separated CORS origins |
| `PADDLE_API_KEY` | backend | server-side Paddle key (optional) |
| `PADDLE_WEBHOOK_SECRET` | backend | HMAC verification for webhooks |
| `PADDLE_CLIENT_TOKEN` | backend → frontend via API | Paddle.js overlay checkout |
| `PADDLE_PRICE_ID` | backend → frontend via API | Pro plan price |
| `NEXT_PUBLIC_API_URL` | frontend build arg | backend base URL |
| `NEXT_PUBLIC_PADDLE_ENV` | frontend | `sandbox` or `production` |

## Infrastructure

- **Platform**: Azure Container Apps (backend + frontend), Azure PostgreSQL Flexible Server
- **IaC**: OpenTofu in `infra/`. State stored in Azure Blob Storage
- **Auth to Azure**: OIDC (no client secrets in CI)
- **Image registry**: Azure Container Registry (ACR), pulled via managed identity
- **Custom domains**: `api.staging.worksfine.app` (backend), `console.staging.worksfine.app` (frontend)
- **Scale**: backend `min_replicas = 0` on staging (cold start expected). Set to 1 for production

## CI/CD

- **deploy.yml**: push to `main` triggers deploy to staging. `workflow_dispatch` allows targeting staging or production
- **Selective builds**: `dorny/paths-filter` detects which service changed; unchanged services reuse the current running image tag
- **Versioning**: GitVersion from `GitVersion.yml` at repo root

## Billing

- **Paddle** as Merchant of Record
- Webhook at `POST /billing/webhook` — HMAC-verified, handles `subscription.*` events
- Frontend uses Paddle.js overlay checkout (no redirect). Requires `custom_data: { user_id }` so the webhook can map back to the user
- Subscription row auto-created by DB trigger on user insert (14-day trial). Pre-existing users without a row get `{ plan: "free", status: "trialing" }` from the API

## Radio platform (in progress)

- Stations ingested from **Radio Browser API** + optional manual curated list
- Curation rules: filter dead streams, prefer high bitrate, prefer stations with metadata
- Stations cached in Postgres, refreshed every 6h via background goroutine
- Public endpoints (no auth): `GET /stations`, `GET /stations/:id`, `GET /search`
- Protected: favorites (future)
- Audio: MP3/AAC native, HLS via `hls.js`
- Player state: global React context, persists across navigation, pinned bottom bar

## Do not do

- Do not call `os.Getenv` outside of `config/config.go`
- Do not use `asChild` on shadcn components (Radix v2 removed it)
- Do not use `@tailwind base` directives (breaks Tailwind v4)
- Do not create `pgcrypto` extension (banned on Azure PostgreSQL Flexible Server)
- Do not use `postgres://` scheme for golang-migrate (use `pgx5://`)
- Do not commit secrets — all secrets flow through GitHub Secrets → OpenTofu vars → Container App secrets
- Do not add social features, podcast features, or user-generated stations
