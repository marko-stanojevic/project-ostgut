# OSTGUT — Agent Instructions

## What this product is

**OSTGUT** is a premium, curated internet radio platform — "The Listening Room". It is not a radio directory. It is an editorial listening experience where users discover and enjoy high-quality live stations from around the world.

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

**When reviewing, report suspicious code.** If you spot something fishy while reviewing the codebase, call it out explicitly and suggest a refinement or refactor instead of silently working around it.

**Track workarounds and deferred issues.** When introducing or keeping a workaround, temporary exception, toolchain quirk, or follow-up issue, record it immediately in the appropriate backlog doc: use `docs/pending-issues.md` for general engineering/product follow-ups and `docs/pending-security-issues.md` for security or dependency vulnerability follow-ups. Keep notes concise and include the safe resolution path.

**Lockfiles are part of the contract.** If a dependency manifest changes, the corresponding lockfile must be updated in the same change. Treat `package.json` and `package-lock.json` as one unit during reviews and refactors.

## Architectural Discipline (Required)

Every change — feature, bug fix, refactor — is an architectural decision. Treat it as such. Plumbing-style fixes ("thread one more bool through three layers", "add another `if` branch", "sniff a string for a type") are forbidden as the default approach. Slow down, identify the root cause, and fix the design.

### Before writing code

1. **Name the concern.** Which layer owns this? Handler, store, context, hook, service? If multiple layers seem to own it, the design is wrong — pick one.
2. **Find the root cause, not the symptom.** "The UI shows the wrong value" is a symptom. The cause is upstream — usually a data contract, a side-channel, or a missing field. Fix the contract.
3. **Check existing patterns before adding new ones.** If a similar problem is already solved (e.g. `apiFetch`, `PlayerContext`, `store.ErrNotFound`), use it. If the existing pattern is wrong, refactor it — do not copy it.
4. **Sketch the data flow end-to-end.** Where is state created, persisted, read, displayed? Write it down (1–2 lines is enough). If the flow has a side-channel (a field that exists only to thread state through an unrelated layer), redesign.

### Anti-patterns to refuse

- **String matching on errors or types.** Use sentinel errors (`errors.Is`), enums, or typed contracts. `strings.Contains(err.Error(), "timeout")` is a bug waiting to happen.
- **Boolean flags piling up on existing structs.** When a struct grows a third or fourth flag to describe "mode", split into two entry points or a typed mode enum. `Config.DetectFoo` next to `Config.Foo` next to `Config.MaybeFoo` is the warning sign.
- **Side-channel fields.** A field marked `json:"-"` that exists only to ferry data between two layers is a smell. Return a separate evidence/result struct instead.
- **Cache keys built from string concatenation.** Use a typed key struct as the map key. Concatenated keys silently collide.
- **Hard-coded constants duplicated across backend and frontend.** If the backend knows the value, the API must return it. Frontend mirroring of a backend constant is technical debt.
- **Catch-and-default error handling.** If the backend returns unexpected data, fail loudly and fix the contract. Do not coerce, default, or fall back silently.
- **"Fix" by adding another branch.** If a function has grown a chain of `if/else` for special cases, the abstraction is wrong. Refactor the dispatch.
- **Cross-layer reaches.** Handlers do not touch the DB pool. Components do not call `fetch` directly. Stores do not import handlers. If you need to, the layering is wrong.

### Bug fixes are architecture work

When fixing a regression:

1. **Reproduce, then explain why the design allowed it.** "Race condition" is not an explanation. "The cache key did not include the delayed flag, so the probe path read a stale runtime entry" is.
2. **Fix the design, not just the symptom.** If the symptom is one of three possible manifestations of the same root cause, fix all three by fixing the root.
3. **Add a test that fails on the old design.** A regression test that only catches the literal symptom is incomplete. Test the contract.
4. **Consider whether the same bug class exists elsewhere.** If you found a string-matched error, search for other string-matched errors. If you found a side-channel, search for other side-channels.

### Features are architecture work

When adding a feature:

1. **Define the contract first.** What does the API return? What does the store expose? What does the context publish? Write the type signatures before the implementation.
2. **Place each piece in its correct layer.** Persistence in the store. HTTP shape in the handler. Side-effects in hooks/contexts. Pure logic in pure functions.
3. **Prefer one good abstraction over five duplicated call sites.** If the third caller is copy-pasting setup code, extract.
4. **Surface diagnostic data through dedicated types, not by mutating the user-facing payload.** If the poller needs to know how a result was obtained, return an evidence struct alongside the result; do not stuff observability fields into the response model.

### When to stop and rethink

If any of the following is true, stop coding and reconsider the design:

- The change requires editing more than three files for a single concern, and they are not in the same layer.
- A new field is being added to a struct that is already "the bag of everything for X".
- A test asserts on a string that came from a log message or an error message.
- The fix "works" but you cannot explain in one sentence *why* the previous design failed.
- You catch yourself thinking "I'll come back and clean this up later."

The codebase is small enough that the right thing is also the fast thing. Spending 30 extra minutes on the design saves three days of plumbing later.

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
- **Tailwind v4**: uses `@import "tailwindcss"` + `@theme inline` block in `globals.css`. Do NOT use `@tailwind base/components/utilities`. There is NO `tailwind.config.js`.
- **Theme**: four themes (`light`, `dark`, `sepia`, `midnight`) selected via `next-themes` + `data-theme` attribute. Tokens are organized in **two tiers** in `src/app/globals.css`:
  - **Tier 1 (per-theme blocks)**: only the values that visibly differ between themes (palette, glassy gradients, shadow tint).
  - **Tier 2 (`:root` after the theme blocks)**: every component-scope token derived from the primitives via `color-mix(in oklab, ...)`. Adding a new theme requires editing only Tier 1.
  - **Scale tokens**: radius (`--radius-{2xs..3xl,full}`), tracking (`--tracking-{tighter..widest}`), motion (`--motion-{fast,base,slow,emphasized}` + `--ease-{standard,emphasized,out-soft}`), safe area (`--safe-{top,bottom,left,right}` from `env()`).
  - **Breakpoints**: `compact` (480px), `regular` (768px), `wide` (1280px), `carplay` (800px landscape) in addition to the Tailwind defaults.
  - **Container queries**: `--container-{compact,regular,wide}` for component-scoped responsive layout.
- **Auth**: `useAuth()` from `@/context/AuthContext` gives `{ user, session, signOut }`. `session.accessToken` is the JWT for backend calls
- **API calls**: use `process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'` as base URL, always pass `Authorization: Bearer ${session.accessToken}` on protected endpoints
- **Audio player**: global state in `PlayerContext` — persists across navigation. Player bar is pinned to bottom of the protected layout. Volume and last station survive page reload (localStorage) and are synced per-user to the backend. Shared player primitives (stream resolution, waveform bars) live in `src/components/player/` and are reused by both the bar and the full-screen view.
- **Frontend container runtime**: staging and production frontend images must remain distroless. Node upgrades are allowed, but do not switch the runtime stage to a general-purpose base image.

## Radio platform

- Stations ingested from **Radio Browser API** + optional manual curated list
- Curation rules: filter dead streams, prefer high bitrate, prefer stations with metadata
- Ingested stations must remain `pending` until an admin user explicitly approves them. Do not auto-approve imported or synced stations.
- Stations cached in Postgres, refreshed every 6h via background goroutine
- Public endpoints (no auth): `GET /stations`, `GET /stations/:id`, `GET /search`
- Audio: MP3/AAC native, HLS via `hls.js`
- Player preferences (volume + last station): persisted in localStorage and synced to `GET/PUT /users/me/player-preferences`
- Max ~50 stations per view — paginate or curate, never dump the full list

## Key env vars

| Var | Where | Purpose |
|-----|-------|---------|
| `DATABASE_URL` | backend | `postgres://` scheme (auto-converted to `pgx5://` for migrations) |
| `JWT_SECRET` | backend | HS256 secret used to sign backend access tokens (independent of frontend) |
| `AUTH_SECRET` | frontend | NextAuth cookie/JWE encryption secret (independent of backend) |
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
- Do not auto-approve stations during ingestion, sync, bootstrap, or recovery flows; only an admin user may approve a station for public visibility
- Do not commit secrets — all secrets flow through GitHub Secrets → OpenTofu vars → Container App secrets
- Do not replace the frontend staging/production runtime image with a non-distroless base image
