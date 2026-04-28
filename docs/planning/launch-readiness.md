# Launch Readiness

The work that **must** be completed before project-ostgut enters public launch
and accepts real users on a public domain. Items here are pulled from the broader backlog in
[`pending-security-issues.md`](./pending-security-issues.md) and
duplicated here so the launch checklist is self-contained.

When an item ships, mark it `[x]` here and delete it from the source
backlog (or vice versa). Do not let the two lists drift.

The order is **dependency-driven, not priority-driven** — earlier items
unblock later ones.

---

## P0 — required before any public traffic

### Auth & account safety

- [ ] **Email delivery + verified-email gating** (backlog 1.1)
  Wire Resend (or SES) via `internal/email/`. Replace the
  `password reset token generated` log line with a real send. Add
  `email_verified_at TIMESTAMPTZ` to `users` and require verification
  on credentials signup. Block login (or at minimum editor/admin
  actions) when `email_verified_at IS NULL`.

- [ ] **Per-account login lockout** (backlog 1.2)
  Add `failed_login_attempts` + `locked_until` to `users`. Lock for
  15 min after 10 failures in 15 min. Magic-link unlock once 1.1 ships.

- [ ] **Audit log for sensitive actions** (backlog 1.3)
  `audit_events` table, append-only. Middleware on `/admin/*` and
  `/editor/*` writes one row per request. Required for GDPR DSAR
  responses (5.3) and for forensic post-mortems.

- [ ] **Sudo-mode re-auth on privileged actions** (backlog 1.4)
  `sudo_until` claim, `POST /auth/sudo` to refresh it. Gate
  `PUT /admin/users/:id/role`, `DELETE /admin/users/:id`, station
  bulk delete behind it.

### Infrastructure hardening

- [ ] **Postgres firewall: drop `azure_services` rule** (backlog 3.1)
  Currently allows all Azure tenants worldwide. Replace with
  Container Apps subnet allow-list. Requires VNet integration first.

- [ ] **Storage: disable public blob + account-key access** (backlog 3.2)
  `allow_nested_items_to_be_public = false`,
  `shared_access_key_enabled = false`, reject
  `MEDIA_STORAGE_ACCOUNT_KEY` in `config.Load` when `ENV=production`.

- [ ] **Private endpoints for Postgres + Storage** (backlog 3.3)
  `azurerm_private_endpoint` for both, private DNS zone integrated
  with the Container Apps VNet. Public endpoints unreachable from
  the internet.

- [ ] **Azure Front Door + WAF** (backlog 3.4)
  Front Door in front of Container Apps, OWASP Core Rule Set, geo-
  blocking, managed TLS at the edge. Lock Container Apps ingress to
  accept only Front Door's `X-Azure-FDID` header. Required for DDoS
  Protection Standard.

- [ ] **Move secrets to Key Vault** (backlog 3.5)
  Migrate `JWT_SECRET`, `OAUTH_SHARED_SECRET`, `AUTH_SECRET`,
  `PADDLE_*`, `DATABASE_URL` to Key Vault references. Removes
  secret values from Terraform state.

- [ ] **JWT key rotation via `kid`** (backlog 3.6)
  Add `kid` header, accept N most recent keys at verify time.
  Without this, rotating `JWT_SECRET` invalidates every active
  session simultaneously — operationally untenable in production.

### Public disclosure surface

- [ ] **Finalize `SECURITY.md` + publish `security.txt`** (backlog 4.2)
  - Replace placeholder body of [`SECURITY.md`](../../SECURITY.md) with
    real scope domains, working disclosure email (dedicated alias on
    the production domain), optional PGP key fingerprint.
  - Recreate `frontend/public/.well-known/security.txt` with valid
    `Contact:`, `Expires:` (≤ 1 year), `Canonical:` matching the
    production URL.
  - Verify it serves at
    `https://<production-domain>/.well-known/security.txt` with
    `Content-Type: text/plain` over HTTPS.

### Operational visibility

- [ ] **Failed-auth alerting** (backlog 4.1)
  New Relic alert: > N `invalid token` / `refresh token reused`
  log lines from a single IP in 5 min → page on-call. Without this,
  the rate limiter and refresh-reuse detection are invisible.

### Validation

- [ ] **Re-enable full GitHub Actions gates before launch**
  Restore the development-disabled automation before public traffic. The
  current reduced workflow set exists only to control pre-launch billing while
  the same checks are expected to run locally before merge. Before launch,
  explicitly put the hosted gate back in place:
  - Re-enable [../../.github/workflows/ci.yml](../../.github/workflows/ci.yml)
    on `push main`, not just on pull requests, so the protected branch itself
    is validated after merge and before release operations depend on it.
  - Restore the Docker validation jobs in `CI` for both backend and frontend,
    so multi-stage Dockerfiles, distroless runtime assumptions, and build args
    are exercised in hosted automation instead of only on developer machines.
  - Restore any removed hosted verification steps that were trimmed for minute
    control, including backend coverage artifact generation/upload if the team
    wants coverage trend visibility again.
  - Re-enable [../../.github/workflows/security.yml](../../.github/workflows/security.yml)
    on both pull requests and `push main`, not only schedule/manual dispatch.
    The launch-state expectation is that dependency, static-analysis, SBOM,
    and image-scan failures are visible immediately on code changes.
  - Confirm the security workflow again runs the full launch-time set:
    `govulncheck`, `gosec`, `npm audit`, SBOM generation, Trivy filesystem
    scanning, and backend/frontend image vulnerability scans.
  - Decide whether [../../.github/workflows/deploy.yml](../../.github/workflows/deploy.yml)
    should stay manual-only or return to automatic staging deploys from
    `main`. If automatic deploys are restored, reintroduce the trigger only
    after hosted branch validation is back in place; do not chain deploys to
    an unvalidated branch.
  - Replace the development-era expectation of running
    `All: Validate Before Push` locally as the primary gate. Keep the VS Code
    tasks as a fast local preflight, but make hosted GitHub Actions the source
    of truth again for merge safety.
  - Re-enable branch protection on `main` so merge is blocked unless the full
    required check set passes. At minimum this should require the restored
    `CI` workflow and the restored `Security` workflow; if automatic staging
    deploys are part of launch operations, also require the deploy preconditions
    that feed that path.
  - Review artifact retention and job scope after re-enabling the full gate
    set so minute reduction work does not silently leave production with a
    weaker validation contract than intended.

- [x] **Threat model document** (backlog 4.3)
  [Threat model](../security/threat-model.md) maps the OWASP Top 10 to endpoints
  with status (Mitigated / Accepted / TODO). It forces explicit
  decisions on accepted risks.

- [ ] **External pen test** (backlog 4.4)
  5-day focused test by a reputable EU shop (Cure53, NCC, Pentest
  People, Securitum). Schedule **after** all P0 items above are done
  but **before** the public launch announcement. Budget €5–10k.

---

## P1 — required before privileged users (editors/admins) get public access

These can lag the public launch by a few days, but cannot lag editor
account creation, because editor accounts have catalog-wide write access.

- [ ] **2FA / WebAuthn for editors and admins** (backlog 5.1)
  TOTP first, passkeys second. Block on this for any account with
  role `editor` or `admin`.

---

## P2 — required before EU users (GDPR)

If launch geofences EU out at the WAF on day one, these can ship
shortly after. Otherwise they are P0.

- [ ] **GDPR DSAR endpoints** (backlog 5.3)
  `/users/me/export` (JSON of all user-owned rows),
  `/users/me/delete` (24-hour grace window, hard delete cascading
  through subscriptions, refresh tokens; audit events redacted to
  `actor_id = NULL`).

- [ ] **Cookie consent** — only if analytics beyond New Relic
  functional monitoring is added. Not needed today (backlog 5.4).

---

## Conditional — only if usage exceeds rate-limit + lockout

- [ ] **CAPTCHA on auth endpoints** (backlog 5.5)
  Cloudflare Turnstile on `/auth/register` and `/auth/forgot-password`
  after the per-IP limiter triggers. Add only if 1.2 proves
  insufficient against real attacks.

---

## Definition of "ready to launch"

All P0 items checked off, **and**:

- The pen test report (4.4) has zero open Critical or High findings.
- The threat model (4.3) has zero "TODO" rows on auth, billing, or
  media upload paths.
- A practice incident has been run against the failed-auth alert
  (4.1) and it paged correctly.
- A practice DSAR has been run end-to-end if launching in the EU.
- `security.txt` (4.2) has been validated by an external linter
  (e.g. https://securitytxt.org).
