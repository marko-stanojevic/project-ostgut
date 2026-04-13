# bouji.fm — GitHub Copilot Instructions

## Project overview

Premium curated internet radio platform ("The Listening Room"). Go backend + Next.js frontend, deployed on Azure Container Apps. Auth, subscriptions (Paddle), and infrastructure are already in place. The current focus is building the radio station layer on top.

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
Global state lives in `PlayerContext`. Always use the context to set/read the current station — never manage playback state locally in a page component.

## Radio station model

```typescript
interface Station {
  id: string
  name: string
  streamUrl: string
  genre: string
  language: string
  country: string
  tags: string[]
  bitrate: number
  isActive: boolean
  featured: boolean
  reliabilityScore: number
}
```

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
- Podcast, social, or user-generated station features
- Hardcoded secrets or connection strings
- Thousands of stations rendered at once (paginate or curate — max ~50 per view)
