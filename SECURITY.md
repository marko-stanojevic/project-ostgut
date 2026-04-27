# Security policy

> **Status: placeholder.** The product is under active development. No
> permanent public domains or disclosure inbox exist yet, and this
> repository is private. This file reserves the path and structure so
> it can be populated before public launch.
>
> Tracking item: [`docs/planning/pending-security-issues.md`](docs/planning/pending-security-issues.md)
> §4.2 — replace placeholders before going public.

## Reporting a vulnerability

Until a public disclosure inbox exists, route any pre-launch security
findings to the project owner through the channel you already use to
coordinate with the team. Do **not** open issues or PRs that describe
exploitable behavior on a public mirror.

When reporting, please include:

- A description of the issue and its impact
- Steps to reproduce (proof-of-concept code, request payloads, etc.)
- The affected endpoint, page, or component

## Scope (to be finalized at launch)

In scope (once domains are published):

- The web application (TBD domain)
- The public API (TBD domain)
- The mobile web experience
- The OAuth handshake between the frontend and backend
- The media upload and signed-URL flow

Out of scope:

- Denial-of-service attacks against any environment
- Social engineering
- Physical attacks against infrastructure providers
- Issues in third-party services unless caused by our integration
- Findings from automated scanners without a working proof-of-concept
- Pre-production / staging environments unless they would also affect
  production

## Safe harbor

Standard good-faith research safe-harbor language will be added when
this policy is published.

## Coordinated disclosure

We ask for **90 days** between report and public disclosure for most
issues, with extensions negotiated for complex fixes.

## Hall of fame

Reserved.
