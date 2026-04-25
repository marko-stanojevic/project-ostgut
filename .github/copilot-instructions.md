# bouji.fm — GitHub Copilot Instructions

## Product overview

**bouji.fm** is a premium, curated internet radio platform — "The Listening Room". It is an editorial listening experience, not a radio directory. Users discover and enjoy high-quality live stations from around the world.

Platforms: web app (primary), mobile web (responsive), iOS app (future), backend API.

The experience targets Apple Music / Netflix quality perception applied to live radio. Every screen must communicate taste and intention, not volume or quantity.

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

## Architecture principles

- **Streaming is the highest priority.** Active playback must survive tab switches, route changes, and app restarts.
- **Minimize polling.** Avoid request loops. Use backoff where applicable.
- **Player state is persistent.** Volume and last station are stored in localStorage (instant hydration) and synced to the backend (`GET/PUT /users/me/player-preferences`) for cross-device continuity.

## Engineering principles

### SOLID
- **Single Responsibility** — each handler file owns one domain; each store owns one table group; each context owns one concern
- **Open/Closed** — extend station curation rules (`radio/ingestion.go`) via config or strategy, not `if/else` patches
- **Interface Segregation** (Go) — keep store interfaces narrow; handlers depend only on the methods they call
- **Dependency Inversion** — handlers depend on store interfaces; components depend on context/hooks, not raw fetch calls or audio APIs

### General
- **Don't Repeat Yourself** — shared fetch logic with auth headers belongs in `src/lib/` (e.g. `apiFetch`), not duplicated per component
- **Fail Fast** — validate all env vars at startup in `config.Load()`; crash loudly on missing required values
- **Separation of Concerns** — `PlayerContext` owns playback state only; localStorage persistence belongs in `usePlayerStorage`; backend sync belongs in `usePlayerSync`
- **Law of Demeter** — handlers call store methods; stores call the DB pool; no layer reaches into another's internals
- **Idempotency** — `PUT /users/me/player-preferences` uses `ON CONFLICT DO UPDATE`; safe to call repeatedly
- **Prefer reversible** — soft deletes, `updatedAt` conflict resolution, and graceful degradation over destructive writes

## Repository layout

```
backend/      Go 1.23 · Gin · pgx/v5 · golang-migrate
frontend/     Next.js 14 · App Router · TypeScript · Tailwind v4 · shadcn/ui v4
infra/        OpenTofu (Terraform) — Azure infrastructure
.github/      CI (ci.yml) and CD (deploy.yml) workflows
```

## Backend patterns

### Adding a new handler
1. Add method to `internal/handler/` in its own file
2. If it needs a new store, add to `Handler` struct in `handler.go` and `New()`
3. Register route in `cmd/api/main.go`

### Context key for user ID
Always use `middleware.GetUserID(c)` — the key is `"user_id"` (underscore). Never use `c.Get("userID")`.

### Store errors
Return `store.ErrNotFound` from store methods when a row is missing. Check with `errors.Is(err, store.ErrNotFound)` in handlers.

### Migrations
- Files: `backend/migrations/NNN_name.up.sql` (embedded via `iofs`)
- golang-migrate requires `pgx5://` scheme — the app replaces `postgres://` → `pgx5://` at startup
- No `CREATE EXTENSION pgcrypto` — banned on Azure PostgreSQL Flexible Server. Use `gen_random_uuid()` directly (built-in since PG 13)

### Config
All env vars must be added to `internal/config/config.go` `Config` struct and `Load()`. Never call `os.Getenv` elsewhere.

## Frontend patterns

### shadcn/ui v4 — render prop (not asChild)
```tsx
// Correct
<SidebarMenuButton render={<Link href="/dashboard" />}>
  <Icon />
  <span>Dashboard</span>
</SidebarMenuButton>

// Wrong — asChild is removed in Radix v2
<SidebarMenuButton asChild>
  <Link href="/dashboard">...</Link>
</SidebarMenuButton>
```

### Tailwind v4 — no directives
```css
/* Correct */
@import "tailwindcss";

/* Wrong */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### Auth
```tsx
const { user, session, signOut } = useAuth()
// session.accessToken is the JWT for backend calls
```

### Backend API calls
```tsx
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
const res = await fetch(`${apiUrl}/some/endpoint`, {
  headers: { Authorization: `Bearer ${session.accessToken}` },
})
```

### Audio player
Global state lives in `PlayerContext`. Always use the context to set/read the current station — never manage playback state locally in a page component. Volume and last station are persisted to localStorage and synced to the backend on change.

## Radio station model

```typescript
interface Station {
  id: string
  name: string
  streamUrl: string
  logo?: string
  genre: string
  country: string
  city?: string
  countryCode: string
  bitrate: number
  codec: string
}
```

## Station approval policy

- Stations discovered by ingestion or sync must remain `pending` by default.
- Never auto-approve stations as part of import, sync, bootstrap, repair, or recovery flows.
- A station becomes publicly visible only after an admin user explicitly approves it.

## Naming conventions

| Layer | Convention |
|-------|-----------|
| Go packages | lowercase, single word |
| Go exported types | PascalCase |
| Go DB columns | snake_case |
| TS components | PascalCase, one per file |
| TS hooks | `use` prefix, camelCase |
| TS context files | `src/context/NounContext.tsx` |
| API routes | kebab-case, plural nouns (`/stations`, `/stations/:id`) |

## What NOT to generate

- `pgcrypto` extension usage
- `asChild` prop on any shadcn component
- `@tailwind` directives
- `os.Getenv` calls outside `config/config.go`
- Hardcoded secrets or connection strings
- Large station lists without pagination (max ~50 per view)
- Playback state managed locally in a page component
