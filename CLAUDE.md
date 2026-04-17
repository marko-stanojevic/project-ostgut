# bouji.fm — Agent Instructions

## What this product is

**bouji.fm** is a premium, curated internet radio platform — "The Listening Room". It is not a radio directory. It is an editorial listening experience where users discover and enjoy high-quality live stations from around the world.

The product feel targets Apple Music / Netflix quality perception applied to live radio. Every design and engineering decision should reinforce: taste, intention, and calm focus over volume and noise.

## Development Mode Constraint (Important)

This project is currently in active early development. There are no active users or production dependencies at this stage.

As a result:

- Do not introduce migration paths
- Do not add backward compatibility layers
- Do not preserve legacy behavior for future upgrades
- Do not optimize for version transitions or upgrade safety

Instead, always prioritize:

- Clean, correct architecture
- Strong adherence to design principles
- High performance and scalability
- Long-term maintainability (without compatibility constraints)
- Simplicity over defensive engineering

The codebase should reflect the best possible final architecture, not an evolution of a legacy system.

Once the product is live and users exist, this section will be removed and compatibility considerations may become relevant.

## Development Mode Best Practices

**Refactoring is encouraged.** If a better architecture emerges, refactor it immediately. Do not preserve old patterns or code structures for consistency — consistency comes after stabilization.

**Data deletion: hard deletes are the default.** Soft deletes add complexity. Use hard deletes unless there's an immediate audit requirement. Soft deletes can be introduced when the product goes live and retention policies become real.

**No feature flags.** Ship directly to staging. Feature flags add cognitive load and aren't needed without users. Branch off features if they're incomplete; merge to main when ready.

**API versioning: skip it.** No `/v1/` or versioning schemes yet. When the API changes, just change it. Document breaking changes in the changelog. Versioning overhead is waste until you have external API consumers.

**Testing: integration tests first, unit tests as needed.** The architecture is still stabilizing, so integration tests (end-to-end flows) validate the actual design better than unit tests of brittle internals. Add unit tests for business logic that won't change (e.g., validation, timestamp logic).

**Documentation: stabilize first, document second.** Don't over-document internal APIs or architectural decisions that are still in flux. Keep a running changelog of major changes. Document the final decisions once the pattern is stable and proven.

**Performance: optimize for clarity first.** Choose the cleanest implementation. Measure after. Premature optimization often locks in wrong abstractions. Once the product stabilizes, add caching, indices, and query optimization based on real metrics, not guesses.

**Error handling: fail loudly and early.** When something goes wrong, crash with a clear message rather than defaulting silently. Defensive programming (null checks, fallbacks) is overhead. If the backend returns unexpected data, let it error; fix the contract. In production, add recovery paths.

## Platform scope

- **Web app** — primary interface (Next.js, App Router)
- **Mobile web** — responsive parity with web app
- **iOS app** — native experience aligned with core UI/UX principles (future)
- **Backend API** — station aggregation, metadata, user features, billing

## Architecture principles

- **Streaming is the highest priority system state.** Active playback must remain uninterrupted. The stream should stop only when explicitly changed by the user. Tab switches, route changes, and app restarts must not degrade playback.
- **Backend efficiency is critical.** Minimize polling. Avoid unnecessary request loops. Use backoff strategies and efficient connection patterns.
- **Resilience is required.** In cases of frontend or backend failure, audio playback should continue if technically possible.
- **Player state is persistent.** Volume and last-played station are stored in localStorage (instant hydration) and synced to the backend (`GET/PUT /users/me/player-preferences`) for cross-device continuity. Conflict resolution uses `updatedAt` timestamps — newer write wins, stale writes are dropped server-side.

## UI direction

- Minimal and editorial
- Artsy and refined — spacious, strong whitespace, typography-led
- Curated rather than content-heavy
- Every screen communicates taste and intention, not volume or quantity
- Avoid all "radio directory" aesthetics — no dense lists, no overwhelming browsing

## Monorepo structure

```
project-ostgut/
├── backend/          # Go 1.23, Gin, pgx/v5, golang-migrate
│   ├── cmd/api/      # main.go — entry point
│   ├── internal/
│   │   ├── config/   # env var loading
│   │   ├── db/       # pgxpool connection
│   │   ├── handler/  # HTTP handlers (auth, user, billing, station, player prefs)
│   │   ├── middleware/  # JWT auth (sets "user_id" in context)
│   │   └── store/    # DB access layer (UserStore, SubscriptionStore, StationStore)
│   └── migrations/   # golang-migrate SQL files (embedded via iofs)
├── frontend/         # Next.js 14, App Router, TypeScript, Tailwind v4, shadcn/ui v4
│   └── src/
│       ├── app/
│       │   ├── (protected)/   # Auth-gated: curated, explore, settings, account
│       │   ├── auth/          # login, signup, forgot/reset password
│       │   └── page.tsx       # Public landing
│       ├── components/
│       │   └── ui/            # shadcn components
│       └── context/           # AuthContext, PlayerContext (audio player state + persistence)
└── infra/            # OpenTofu (Terraform) — Azure Container Apps + PostgreSQL
```

## Engineering principles

### SOLID (applied to this stack)

- **Single Responsibility**: each handler file owns one domain, each store owns one table group, each context owns one concern. Don't merge unrelated logic into a single file or hook.
- **Open/Closed**: station curation and ingestion rules (`radio/ingestion.go`) should be extendable via config or strategy, not via `if/else` patches to core logic.
- **Interface Segregation** (Go): keep store interfaces narrow — a handler should only depend on the store methods it actually calls. Don't force wide interfaces.
- **Dependency Inversion**: handlers depend on store interfaces, not concrete structs. Frontend components depend on context/hooks, not on raw fetch calls or audio APIs.

### General principles

- **Don't Repeat Yourself**: shared fetch logic with auth headers belongs in `src/lib/` (e.g. `apiFetch`), not duplicated in every component.
- **Fail Fast**: validate env vars and config at startup in `config.Load()`. Crash loudly on missing required values rather than failing silently at runtime.
- **Separation of Concerns**: `PlayerContext` owns playback state only. localStorage persistence and backend sync belong in dedicated hooks (`usePlayerStorage`, `usePlayerSync`) called from the provider — not inline in the context body.
- **Law of Demeter**: handlers call store methods; stores call the DB pool. Handlers must not reach into store internals or chain through multiple layers.
- **Idempotency**: `PUT /users/me/player-preferences` uses `ON CONFLICT DO UPDATE` — safe to call repeatedly without side effects.
- **Prefer reversible over irreversible**: use soft deletes, `updatedAt` conflict resolution, and graceful degradation over destructive writes.

## Backend conventions

- **Package per layer**: `handler`, `store`, `middleware`, `config` — no cross-layer imports except handler→store→db
- **Context key for user ID**: always `"user_id"` (set by auth middleware). Use `middleware.GetUserID(c)` in handlers, never `c.Get("userID")`
- **Error sentinel**: `store.ErrNotFound` — check with `errors.Is` before returning 404
- **Migrations**: sequential numbered SQL files in `backend/migrations/`. Scheme must be `pgx5://` for golang-migrate (not `postgres://`). The app replaces the scheme at startup
- **pgcrypto is banned on Azure PostgreSQL Flexible Server** — use `gen_random_uuid()` built-in (PG 13+), no extension needed
- **Config**: all env vars loaded in `config.Load()`. Add new vars there, never call `os.Getenv` directly in handlers
- **Handler wiring**: add method to `internal/handler/` in its own file, add stores/deps to `Handler` struct in `handler.go` and `New()`, register route in `cmd/api/main.go`

## Frontend conventions

- **shadcn v4 / Radix v2**: uses `render` prop pattern, NOT `asChild`. Example: `<SidebarMenuButton render={<Link href="/" />}>`
- **Tailwind v4**: uses `@import "tailwindcss"` + `@theme inline` block in `globals.css`. Do NOT use `@tailwind base/components/utilities`
- **Theme**: oklch color tokens, dark mode via `next-themes` + `.dark` class
- **Auth**: `useAuth()` from `@/context/AuthContext` gives `{ user, session, signOut }`. `session.accessToken` is the JWT for backend calls
- **API calls**: use `process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'` as base URL, always pass `Authorization: Bearer ${session.accessToken}` on protected endpoints
- **Audio player**: global state in `PlayerContext` — persists across navigation. Player bar is pinned to bottom of the protected layout. Volume and last station survive page reload (localStorage) and are synced per-user to the backend

## Radio platform

- Stations ingested from **Radio Browser API** + optional manual curated list
- Curation rules: filter dead streams, prefer high bitrate, prefer stations with metadata
- Stations cached in Postgres, refreshed every 6h via background goroutine
- Public endpoints (no auth): `GET /stations`, `GET /stations/:id`, `GET /search`
- Audio: MP3/AAC native, HLS via `hls.js`
- Player preferences (volume + last station): persisted in localStorage and synced to `GET/PUT /users/me/player-preferences`
- Max ~50 stations per view — paginate or curate, never dump the full list

## Key env vars

| Var | Where | Purpose |
|-----|-------|---------|
| `DATABASE_URL` | backend | `postgres://` scheme (auto-converted to `pgx5://` for migrations) |
| `JWT_SECRET` | backend + frontend (`AUTH_SECRET`) | shared HS256 signing key |
| `ALLOWED_ORIGINS` | backend | comma-separated CORS origins |
| `NEXT_PUBLIC_API_URL` | frontend build arg | backend base URL |

## Infrastructure

- **Platform**: Azure Container Apps (backend + frontend), Azure PostgreSQL Flexible Server
- **IaC**: OpenTofu in `infra/`. State stored in Azure Blob Storage
- **Auth to Azure**: OIDC (no client secrets in CI)
- **Image registry**: Azure Container Registry (ACR), pulled via managed identity
- **Custom domains**: `api.staging.worksfine.app` (backend), `console.staging.worksfine.app` (frontend)
- **Scale**: backend `min_replicas = 0` on staging (cold start expected). Set to 1 for production

## CI/CD

- **deploy.yml**: push to `main` triggers deploy to staging. `workflow_dispatch` allows targeting staging or production
- **Versioning**: GitVersion from `GitVersion.yml` at repo root

## Do not do

- Do not call `os.Getenv` outside of `config/config.go`
- Do not use `asChild` on shadcn components (Radix v2 removed it)
- Do not use `@tailwind base` directives (breaks Tailwind v4)
- Do not create `pgcrypto` extension (banned on Azure PostgreSQL Flexible Server)
- Do not use `postgres://` scheme for golang-migrate (use `pgx5://`)
- Do not commit secrets — all secrets flow through GitHub Secrets → OpenTofu vars → Container App secrets
