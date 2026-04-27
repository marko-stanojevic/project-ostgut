# Asset Architecture

## Scope

This document defines how OSTGUT should manage image assets for:

- User avatars
- Station icons

Goals:

- Fast delivery worldwide
- Secure upload handling
- Predictable image quality
- Low operational overhead
- Clear separation between user-generated and editorial assets

## Recommended Stack

- Storage: Azure Blob Storage
- Delivery: Azure Front Door or Azure CDN in front of Blob
- API orchestration: Go backend issues short-lived app upload tokens
- Blob auth (backend): Azure Managed Identity + RBAC (no RW SAS in app config)
- Processing: backend worker or background job for validation + derivatives
- Persistence: Postgres stores metadata and references only (not image binaries)

## Asset Classes

### 1) User avatars (user-generated)

- Self-service upload
- Strong validation and safety checks
- Replaceable by the user at any time
- Optional moderation for abuse/NSFW

### 2) Station icons (editorial)

- Admin-managed or curated ingestion
- Higher quality bar and consistency requirements
- Optional approval workflow before publishing

## Data Modeling

Use a single media table and reference it from owners.

### media_assets (proposed)

- id (uuid)
- owner_type (enum: user, station)
- owner_id (uuid)
- kind (enum: avatar, station_icon)
- storage_key_original (text)
- variants (jsonb)  // maps size/format to blob keys
- mime_type (text)
- width (int)
- height (int)
- byte_size (bigint)
- content_hash (text) // sha256 for dedupe and cache busting
- status (enum: pending, ready, rejected)
- rejection_reason (text, nullable)
- created_at (timestamptz)
- updated_at (timestamptz)

### Owner references

- users.avatar_asset_id -> media_assets.id
- stations.icon_asset_id -> media_assets.id

Notes:

- Keep binaries out of Postgres.
- Prefer immutable variant keys to simplify CDN caching.

## Storage Layout

Use deterministic blob keys.

Examples:

- avatars/{user_id}/{asset_id}/original
- avatars/{user_id}/{asset_id}/64.png
- avatars/{user_id}/{asset_id}/128.png
- avatars/{user_id}/{asset_id}/256.png

- stations/{station_id}/{asset_id}/original
- stations/{station_id}/{asset_id}/96.png
- stations/{station_id}/{asset_id}/192.png
- stations/{station_id}/{asset_id}/384.png

Guideline:

- Never overwrite existing variant blobs in place.
- New upload creates new asset_id or hash-based key.

## Upload and Processing Flow

1. Client requests upload intent from backend:
   - includes kind (avatar or station_icon)
   - optional expected mime/size hints
2. Backend authenticates/authorizes and returns:
   - short-lived app upload URL and token (backend endpoint)
   - target blob key
   - constraints (max size, accepted types)
3. Client uploads binary to backend upload endpoint.
4. Backend validates payload and writes original object to Blob Storage.
5. Client calls backend complete endpoint.
6. Backend processing pipeline:
   - verifies blob exists
   - validates file signature and dimensions
   - strips EXIF/metadata
   - generates derivatives (fixed sizes + formats)
   - stores derivative blobs
   - marks media_assets row ready or rejected
7. Client fetches media metadata and renders CDN URLs.

Why this flow:

- API containers avoid proxying large files.
- Easier horizontal scaling.
- Better control over security and cost.

## Validation and Security

Minimum controls for both asset classes:

- Validate true MIME using file signature, not extension.
- Enforce max upload size.
- Enforce allowed formats: jpeg, png, webp.
- Strip EXIF metadata.
- Reject malformed or decompression-bomb-like files.

Additional controls for avatars:

- Per-user rate limits on upload-intent.
- Optional moderation checks.
- Optional abuse blocklist handling.

Additional controls for station icons:

- Enforce minimum dimensions.
- Enforce near-square aspect ratio.
- Optional admin approval fields (approved_by, approved_at).

## Transformation Policy

Use fixed variants only (no arbitrary resize URLs).

Recommended avatar variants:

- 64
- 128
- 256

Recommended station icon variants:

- 96
- 192
- 384

Formats:

- Current implementation: PNG derivatives (pure-Go encoder, CGO-free builds)
- Optional future target: WebP/AVIF via safe, portable encoder path

Benefits:

- Predictable cache hit rates
- Simpler frontend usage
- Controlled compute costs

## CDN and Caching

For immutable variant URLs:

- Cache-Control: public, max-age=31536000, immutable

For metadata/API endpoints:

- Short TTL or no-store depending on endpoint semantics

Cache-busting strategy:

- New asset creates new path (asset_id or hash in key)
- Do not mutate existing blob content behind the same URL

## Frontend Integration

Guidelines for Next.js frontend:

- Render assets through stable CDN URLs from API metadata.
- Request closest fixed size needed by viewport context.
- Always provide fallback image for missing/rejected assets.
- Lazy-load lists of station icons outside above-the-fold regions.

## Operational Concerns

Lifecycle policies:

- Optionally retain originals for a fixed moderation/audit window.
- Move old originals to cool tier or delete after retention.

Garbage collection:

- Periodic job removes orphaned media assets not referenced by users/stations.

Metrics to track:

- Upload intent count
- Upload failure rate
- Processing latency (p50/p95)
- Rejection rate by reason
- Average output bytes per variant
- CDN hit ratio for asset paths

## Access Control

Suggested access model:

- Original uploads and processing writes: backend-only access via managed identity
- Derivatives: public-read through CDN (or signed read URLs if policy requires)

Backend responsibilities:

- Generate short-lived app upload tokens only for authorized users
- Validate owner mapping (user can only modify own avatar)
- Restrict station icon uploads to admin/editor roles

### Current runtime configuration (implemented)

- `MEDIA_UPLOAD_BASE_URL`: public base URL used for resolving media URLs in API responses
- `MEDIA_STORAGE_ACCOUNT_NAME`: enables managed identity blob client mode
- `MEDIA_STORAGE_CONTAINER_NAME`: container used by managed identity blob client mode

Security note:

- Do not place long-lived RW SAS in `MEDIA_UPLOAD_BASE_URL`
- Keep blob write privileges in Azure RBAC attached to backend managed identity

## Proposed API Contract (MVP)

### POST /media/upload-intent

Request:

- kind: avatar | station_icon
- ownerId: optional (station id for admin/editor flow)
- contentType: string
- contentLength: number

Response:

- uploadUrl: string
- blobKey: string
- assetId: string
- expiresAt: timestamp
- constraints:
  - maxBytes
  - allowedMimeTypes

### POST /media/complete

Request:

- assetId: string
- blobKey: string

Response:

- status: pending | ready | rejected
- asset metadata (if ready)

### GET /media/:id

Response:

- status
- kind
- owner
- variants map (size/format -> CDN URL)

## Rollout Plan

Phase 1 (MVP)

- Add media_assets table + owner references
- Add upload-intent and complete endpoints
- Add processing worker for validation + variants
- Wire avatar upload UI

Phase 2

- Wire station icon admin flow
- Add approval metadata for editorial assets
- Add observability dashboards and alerts

Phase 3

- Add moderation integrations (if needed)
- Add lifecycle + orphan cleanup automation
- Optimize derivative formats and quality by telemetry

## Implementation Notes for This Repository

Backend conventions to follow:

- Add config vars only in internal/config/config.go
- Add handler methods in internal/handler with route registration in cmd/api/main.go
- Use store.ErrNotFound for missing rows and check via errors.Is in handlers
- Use middleware.GetUserID(c) for authenticated user id access

Frontend conventions to follow:

- Use existing auth context session token for protected API calls
- Keep player state in PlayerContext only (unrelated but important project rule)

## Open Decisions

- Should derivatives be generated synchronously on complete or via queue?
- Will station icon ingestion from external sources reuse same processing path?
- Is AVIF worth enabling in MVP or after baseline metrics?
- What retention period is needed for original uploads?

## Success Criteria

- Avatar update end-to-end latency acceptable for user UX
- Station icon delivery consistently fast with high CDN hit ratio
- No raw binary storage in Postgres
- Clear auditability of asset ownership and status
- Minimal incidents from malformed uploads
