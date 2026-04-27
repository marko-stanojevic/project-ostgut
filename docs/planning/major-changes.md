# Major Changes

Append-only record of major project changes. Add entries in the order performed, with the oldest entry at the top and the newest entry at the bottom.

Each entry must start with the date, state what was added or changed, and explain why it was added. Keep entries concise and factual.

## Entries

- 2026-04-27 - **Added PostgreSQL pool observability**: Added periodic `pgxpool` stats reporting and New Relic custom metrics for connection pool pressure and acquire wait time. This was added to make database saturation visible in staging and production, so pool sizing and backend behavior can be tuned from measurements.
- 2026-04-27 - **Added frontend Web Vitals reporting to New Relic**: Added a client-side Web Vitals reporter that forwards metrics through the existing New Relic browser agent. This was added to connect real frontend performance signals to the existing observability pipeline.
- 2026-04-27 - **Enabled Next.js Cache Components and Partial Prerendering**: Enabled Cache Components in the Next.js app and moved cacheable public station reads behind server-only cache wrappers and Suspense boundaries. This was added to improve prerendering and response performance while keeping request-scoped data, such as CSP nonces and locale params, compatible with the Next.js runtime model.
- 2026-04-27 - **Reorganized the documentation tree by audience**: Moved flat top-level docs into architecture, operations, planning, editorial, and security sections, added a docs index, and renamed misleading files such as the pseudo-YAML tag reference and the station entry guide. This was added to make the documentation easier to navigate and to separate runbooks, technical reference, editorial guidance, and project backlogs.
- 2026-04-27 - **Rebuilt the admin overview around system ownership metrics**: Split the station-health overview onto the editor surface and added a new admin overview contract for system status, user access, billing, content pipeline, and media storage metrics. This was added so admins get platform-level insight without duplicating editor station operations.
