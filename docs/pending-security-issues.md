# Pending security issues

This is the live backlog of security work that has been identified but not
yet implemented. Items are roughly ordered by impact-per-effort. The list
is maintained alongside the code: when an item ships, delete it from this
file in the same PR.

For context on why each item matters, see the original audit pass and the
follow-up implementation notes in PR history.

---

## Already shipped (reference)

The following items were closed by the first hardening pass and the CSP
nonce / supply-chain follow-up. Listed here so reviewers don't propose them
again.

- HMAC-signed `/auth/oauth` handshake with timestamp + email-verified gate
- Removed plaintext password-reset URL from logs
- Per-IP token-bucket rate limiter on `/auth/*`
- 1 MB request body cap (media upload exempted)
- `SetTrustedProxies` pinned to known ingress range
- Strict `ALLOWED_ORIGINS` validation in staging/production
- Refresh-token reuse detection → revoke-all-sessions
- Backend security headers (`X-Content-Type-Options`, `X-Frame-Options`,
  Referrer-Policy, CORP)
- Frontend static security headers (HSTS, X-Frame-Options, Permissions-Policy,
  COOP, CORP) in `next.config.js`
- Frontend CSP with **per-request nonce** in `src/middleware.ts`,
  `'strict-dynamic'` for chunk loading, `<Script nonce={…}>` everywhere
- Open-redirect guard on `callbackUrl`
- `PUBLIC_API_BASE_URL` used for signed upload URLs (no Host-header injection)
- Dependabot config covering gomod, npm, GitHub Actions, both Dockerfiles
- `govulncheck` + `npm audit --omit=dev` in CI
- Trivy filesystem + image scans in CI
- All GitHub Actions pinned to commit SHAs with `# vX.Y` comments
- `gosec` static analysis in CI (medium+ severity, SARIF artifact)
- `POST /users/me/sessions/revoke-all` endpoint (sign out all devices)
- `RequireJSON` middleware on `/auth`, protected, editor, admin groups
  (rejects non-JSON POST/PUT/PATCH with 415; closes form-CSRF surface)
- Decompression-bomb guard on image uploads (`width * height ≤ 25 MP`)
- CSP violation reports → `/api/csp-report` (`report-uri` + Reports API
  `report-to` with `Reporting-Endpoints` header)

---

## Tier 1 — finish the auth surface

### 1.1 Email delivery + verified-email gating
**Why:** Without it, password-reset is offline (token currently logged at
the prefix only and goes nowhere) and we can't enforce email verification
on signup. Verified email is the only sound defense against the credentials
↔ OAuth account-linking attack on a shared email.

**What to do:**
- Wire Resend (preferred — EU region, simple API) or SES via `internal/email/`.
- Replace the `h.log.Info("password reset token generated", …)` line in
  [backend/internal/handler/auth.go](../backend/internal/handler/auth.go) with
  a real email send.
- Add `email_verified_at TIMESTAMPTZ` to `users`; set on OAuth signup only
  if the provider asserted it (already passed via `email_verified` in the
  HMAC handshake), require explicit verification for credentials signup.
- Block login (or at least `editor`/`admin` actions) when `email_verified_at`
  is null.

### 1.2 Per-account login lockout
**Why:** Per-IP rate limiting doesn't stop a distributed credential-stuffing
attack against one popular email.

**What to do:**
- Add `failed_login_attempts INT NOT NULL DEFAULT 0` and
  `locked_until TIMESTAMPTZ` to `users`.
- In `Login`, increment on bad password; after 10 fails in 15 min set
  `locked_until = NOW() + 15 min` and return the same generic 401.
- Reset both columns on successful login.
- Surface a magic-link unlock once email is wired (1.1).

### 1.3 Audit log for sensitive actions
**Why:** Required for GDPR DSAR responses, forensic post-mortems, and
detecting insider abuse. Today `AdminSetUserRole`, station bulk approval,
station deletion, and user list reads leave no trace.

**What to do:**
- New table `audit_events (id, actor_id, action, target_type, target_id,
  ip, user_agent, payload_hash, created_at)`.
- Tiny middleware on `/admin/*` and `/editor/*` writes one row per request.
- Append-only — no update or delete grants.
- Surface in admin UI as a paginated list (read-only).

### 1.4 Sudo-mode re-auth on privileged actions
**Why:** A stolen access token currently grants permanent admin escalation
via `PUT /admin/users/:id/role`. Sudo mode requires a recent password
re-entry for high-impact actions.

**What to do:**
- Add `sudo_until` claim to access token, set when the user re-enters their
  password against `POST /auth/sudo`.
- Reject `PUT /admin/users/:id/role`, `DELETE /admin/users/:id`, station
  bulk delete, etc. when `sudo_until < NOW() + 5 min`.

---

## Tier 2 — input/output hardening

### 2.1 Whitelisted query params on public list endpoints
**Why:** `GET /stations`, `GET /search` accept arbitrary query keys today.
A future refactor that introduces dynamic SQL composition could leak
private columns through an unfiltered key.

**What to do:** Reject unknown keys with 400 in non-development builds.

### 2.4 Confirm EXIF strip on processed avatars
**Why:** Documented in [docs/assets-management.md](assets-management.md)
but never verified by code or test. Re-encoding through `image.Encode`
strips EXIF as a side-effect, but assert it in a test so a future "preserve
metadata" optimization doesn't reintroduce a privacy leak.

### 2.5 SRI hashes on third-party CDN scripts (deferred)
**Why:** CSP nonces don't help when the script is loaded by URL — a
compromised CDN serves attacker JS. SRI ensures the browser only runs
the exact bytes we expected.

**Why deferred:** New Relic's `nr-loader-spa-current.min.js` and Google
Cast's `cast_sender.js` are deliberately rolling URLs — the upstream
contract is "always latest". Pinning an SRI hash would either lock us
to one snapshot (and break silently when the vendor ships a fix) or
require automation that fetches and re-hashes on every upstream release.

**What to do (when prioritized):** Either (a) self-host pinned versions
of both scripts and add SRI on the local URLs, or (b) add a daily job
that resolves the upstream URL to a versioned one, hashes it, and opens
a PR updating the integrity attribute.

---

## Tier 3 — infrastructure (depends on Azure access)

### 3.1 Postgres firewall: drop the `azure_services` rule
**Why:** [infra/main.tf](../infra/main.tf) currently allows the entire
`AzureServices` range, which is **all Azure tenants worldwide**, not just
ours. A hostile workload in any subscription can hit our DB.

**What to do:** Replace with explicit Container Apps subnet allow-list.
Requires VNet-integrating the Container Apps environment first.

### 3.2 Storage account: disable public blob, account-key access
**Why:** Today `MediaStorageAccountKey` is supported as a fallback; if it
ever leaks, an attacker can write arbitrary blobs. Public blob access on
the account is an additional risk surface even if the container is private.

**What to do:**
- `allow_nested_items_to_be_public = false` on the storage account.
- `shared_access_key_enabled = false` once managed identity is verified
  working in production.
- Reject `MEDIA_STORAGE_ACCOUNT_KEY` in `config.Load` when `ENV=production`.

### 3.3 Private endpoints for Postgres + Storage
**Why:** Even with firewall rules, the public endpoints can be enumerated
and probed. Private endpoints make the resources unreachable from the
internet, full stop.

**What to do:** Provision `azurerm_private_endpoint` for both, route via
private DNS zone integrated with the Container Apps VNet.

### 3.4 Azure Front Door + WAF in front of Container Apps
**Why:** Replaces our in-process rate limiter for L7 protection (keep the
in-process one as defense in depth), gives geo-blocking, OWASP Core Rule
Set, and managed TLS at the edge. Required for DDoS Protection Standard.

**What to do:** Add `azurerm_cdn_frontdoor_*` resources, swap custom domain
records to point at Front Door, lock down Container Apps ingress to only
accept Front Door's `X-Azure-FDID` header.

### 3.5 Move secrets to Key Vault
**Why:** Today secrets live as Container App-scoped secrets, with values
stored in Terraform state. Key Vault gives rotation, RBAC, audit trail,
and keeps values out of state.

**What to do:** Migrate to Key Vault references
(`@Microsoft.KeyVault(SecretUri=…)`) for `JWT_SECRET`, `OAUTH_SHARED_SECRET`,
`AUTH_SECRET`, `PADDLE_*`, `DATABASE_URL`.

### 3.6 JWT key rotation via `kid`
**Why:** Rotating `JWT_SECRET` today invalidates every active session
simultaneously. With a `kid` header, two valid secrets can run in parallel
during a rotation window.

**What to do:** Add `kid` to issued tokens, accept N most recent keys at
verify time, document the rotation procedure.

---

## Tier 4 — operational visibility

### 4.1 Failed-auth alerting
**Why:** The rate limiter and refresh-reuse detection emit `Warn` lines
but nobody reads them. Without alerts these defenses are invisible.

**What to do:** New Relic alert: "more than N `invalid token` /
`refresh token reused` log lines from a single IP in 5 min" → page on-call.

### 4.2 Finalize `SECURITY.md` + publish `/.well-known/security.txt`
**Why:** Both files currently exist as placeholders only. The repo is
private and there is no public domain, support email, or PGP key yet,
so any concrete values would be inaccurate. Researchers parse
`security.txt` strictly (RFC 9116) — a malformed file is worse than
none, so the file has been removed for now and only `SECURITY.md` carries
a "placeholder" notice.

**What to do (at public launch):**
- Replace the placeholder body of [SECURITY.md](../SECURITY.md) with
  real scope domains, a working disclosure email (e.g. dedicated
  alias on the production domain), and an optional PGP key fingerprint.
- Recreate `frontend/public/.well-known/security.txt` with valid
  `Contact:`, `Expires:` (≤ 1 year out), and `Canonical:` matching the
  production URL it will be served from.
- Verify it serves at `https://<production-domain>/.well-known/security.txt`
  with `Content-Type: text/plain` over HTTPS.

### 4.3 Threat model document
**Why:** Forces explicit decisions on what we choose not to defend against
("we accept that Paddle webhook signature is the only billing trust
anchor") so reviewers can challenge the assumptions.

**What to do:** One-page OWASP Top 10 table mapped to endpoints with
status (Mitigated / Accepted / TODO). Update on every PR that changes the
auth surface.

### 4.4 External pen test before public launch
**Why:** A focused 5-day test on the full app finds issues this kind of
audit cannot — business-logic bugs, race conditions in billing, real
chained exploits.

**What to do:** Budget €5–10k with a reputable EU shop (Cure53, NCC,
Pentest People, Securitum). Schedule once Tier 1 is done, before Tier 5
launches.

---

## Tier 5 — product-level (when there are users)

### 5.1 2FA / WebAuthn for editors and admins
**Why:** Editorial accounts have catalog-wide write access. Password-only
auth is the wrong trust level.

**What to do:** TOTP first (small scope), then passkeys. Block on this for
any account with role `editor` or `admin`.

### 5.2 Session inventory + per-device revocation
**Why:** Once `audit_events` (1.3) and `logout-all` (1.5) exist, this is
trivial: add `device_label` and `last_used_at` to `refresh_tokens`, expose
the list with a "revoke" action per row.

### 5.3 GDPR DSAR endpoints
**Why:** Mandatory in our target market. Customers have a right to export
and delete.

**What to do:** `/users/me/export` (returns JSON of all user-owned rows),
`/users/me/delete` (24-hour grace window, then hard delete cascading
through subscriptions, refresh tokens, audit events redacted to actor=null).

### 5.4 Cookie consent
**Why:** Required if/when analytics is added beyond New Relic browser
agent (which is functional, not analytic). Not needed today.

### 5.5 CAPTCHA on auth endpoints
**Why:** Last line of defense after rate limit + lockout. UX friction —
don't add until 1.2 proves insufficient.

**What to do:** Cloudflare Turnstile on `/auth/register` and
`/auth/forgot-password` after the per-IP limiter triggers. Server-side
verification only.

---

## Tier 6 — nice-to-have, not gated on launch

### 6.2 SBOM generation
**Why:** Some enterprise customers ask for it, and it's useful when
responding to a CVE ("am I shipping vulnerable-package-X?").

**What to do:** `syft` step in CI, attach SPDX JSON as a workflow artifact,
publish on each release.

### 6.4 Style-src nonces (drop `'unsafe-inline'`)
**Why:** Lower priority than script nonces because `<style>` can't execute
code, but `style="background: url(…)"` can still exfiltrate via attribute
selectors. Same nonce mechanism as script-src.

### 6.5 Tighten `media-src` once stream catalog stabilizes
**Why:** `media-src 'self' https: blob:` is broad because radio streams
come from thousands of independent broadcasters. Once we move all approved
streams behind a CDN/proxy, narrow this to the proxy origin.

### 6.6 Drop `'unsafe-inline'` from `style-src`
Coupled with 6.4. Requires nonced `<style>` for Next.js streaming SSR
fragments.
