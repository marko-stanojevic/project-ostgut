# Threat model

This document maps bouji.fm's current API and frontend trust boundaries to the OWASP Top 10. It is a launch-readiness artifact, not a replacement for the detailed backlog in [pending-security-issues.md](pending-security-issues.md).

Status values are intentionally blunt:

- **Mitigated**: Current code has a concrete control and local/CI validation.
- **Accepted**: Risk is understood and intentionally carried for the current stage.
- **TODO**: Required work remains before public launch or privileged-user rollout.

| OWASP area | Primary surfaces | Status | Current controls / decision | Follow-up |
| --- | --- | --- | --- | --- |
| A01 Broken Access Control | `/users/me/*`, `/editor/*`, `/admin/*`, station moderation actions | TODO | JWT middleware gates protected routes; editor/admin route groups require explicit roles; editor routes cannot manage users. | Add audit events, sudo-mode re-auth for privileged actions, and 2FA/WebAuthn before editor/admin public access. |
| A02 Cryptographic Failures | Access tokens, refresh tokens, upload URLs, OAuth handoff | TODO | OAuth handoff is HMAC-signed; refresh-token reuse revokes sessions; upload URLs use configured public API base instead of Host-derived URLs. | Add JWT `kid` rotation and move secrets to Key Vault before production. |
| A03 Injection | Station list/search filters, admin/editor writes, auth payloads | Mitigated | Store layer uses pgx parameters; backend query composition is constrained to typed filters and fixed order clauses; JSON-only middleware rejects form posts on write groups. | Reject unknown public query params outside development. |
| A04 Insecure Design | Auth recovery, account takeover, billing trust, launch operations | TODO | Per-IP auth limiter and generic auth errors reduce brute-force signal; Paddle webhook is treated as the billing trust anchor. | Wire email delivery + verified email, per-account lockout, failed-auth alerting, and external pen test before launch. |
| A05 Security Misconfiguration | Security headers, CORS, trusted proxies, CSP | Mitigated | Backend and frontend set hardening headers; CORS is strictly validated outside development; trusted proxies are pinned; frontend CSP uses per-request nonce and violation reporting. | Keep `unsafe-eval` development-only; validate production CSP reports during staging soak. |
| A06 Vulnerable and Outdated Components | Go modules, npm packages, Docker images, Actions | TODO | CI has govulncheck, npm audit high+ runtime gate, gosec, Trivy, Dependabot, and SHA-pinned Actions. Local govulncheck/gosec are clean. | Resolve or accept the moderate PostCSS advisory once Next ships a patched internal dependency; keep Trivy image scans in CI. |
| A07 Identification and Authentication Failures | `/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/reset-password` | TODO | Auth endpoints are rate-limited; refresh-token reuse detection revokes all sessions; password-reset tokens are no longer logged in plaintext. | Email verification, real reset-email delivery, per-account lockout, and optional CAPTCHA after abuse evidence. |
| A08 Software and Data Integrity Failures | GitHub Actions, Docker builds, third-party browser scripts | TODO | Actions are pinned to SHAs; image/filesystem scans run in CI; CSP nonces constrain inline script execution. | Decide whether to self-host or pin SRI for rolling New Relic and Google Cast scripts. |
| A09 Security Logging and Monitoring Failures | Auth failures, refresh reuse, admin/editor actions, CSP reports | TODO | CSP reports are collected; suspicious auth events are logged; refresh reuse is detectable in logs. | Add New Relic failed-auth alerts and append-only audit log for sensitive actions. |
| A10 Server-Side Request Forgery | Media uploads, station streams, metadata probing | Mitigated | Media upload completion validates image decode and pixel count; stream probing is owned by backend radio/metadata services rather than arbitrary frontend fetches. | Keep private-network egress assumptions in the external pen-test scope. |

## Trust boundaries

| Boundary | Crosses from | Crosses to | Control |
| --- | --- | --- | --- |
| Browser to frontend | Public/user browser | Next.js app/proxy | CSP, security headers, NextAuth session handling, locale-aware routing. |
| Frontend to backend API | Next.js/client fetches | Gin API | Bearer JWT on protected/editor/admin endpoints; public endpoints read-only. |
| Backend to Postgres | Store layer | Azure PostgreSQL | Parameterized queries; store-owned persistence; migration-managed schema. |
| Backend to object storage | Media handlers | Azure Blob Storage | Upload intents and completion validation; planned managed identity hardening. |
| Backend to external services | Billing, radio metadata, email future | Paddle, station streams, email provider | Paddle signature verification; station probing constrained to radio services; email provider still TODO. |

## Launch interpretation

Public launch requires zero **TODO** rows for auth, billing, and media-upload paths. Editor/admin public access additionally requires 2FA/WebAuthn, audit logging, and sudo-mode re-auth.
