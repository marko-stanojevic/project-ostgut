# bougie.fm Feature Backlog (Marketing)

This file is the single source of truth for product features that should later be turned into marketing copy, landing page sections, launch notes, and social teasers.

## How to use this file

- Keep feature names short and customer-facing.
- Add a one-line value statement (benefit, not implementation detail).
- Track status so marketing can prep upcoming releases early.
- Add proof points when available (metrics, testimonials, screenshots).

## Status Legend

- now: live in product
- next: in active development
- later: planned / validated idea
- explore: idea needs discovery

## Core Listening Experience

| Feature | Status | Value Statement | Proof / Notes |
| --- | --- | --- | --- |
| Curated Station Library | now | Skip the noise with handpicked stations instead of endless directory clutter. | Keep emphasizing editorial quality over quantity. |
| Global Sticky Player | now | Keep listening while navigating anywhere in the app. | Player persists across route changes. |
| Last Station Resume | now | Return and pick up exactly where your listening left off. | Local + account sync behavior implemented. |
| Personalized Volume Memory | now | Your preferred listening level follows your sessions. | Local + account sync behavior implemented. |
| Live Now Playing Metadata | now | See what is currently on air in real time. | Great for “discover by song” stories. |
| Quick Explore Search | now | Find stations fast by genre, place, and vibe. | Search UX in protected explore flow. |

## Quality + Reliability

| Feature | Status | Value Statement | Proof / Notes |
| --- | --- | --- | --- |
| Reliability-Scored Streams | now | Spend more time listening and less time hitting broken streams. | Reliability score already present on station model. |
| Curated Popular / Featured Feeds | now | Instantly jump into trusted picks and trending favorites. | Featured and popular sorting available. |
| Metadata-Aware Station Health | next | Better now-playing quality with smarter metadata fallbacks. | Station metadata config exists; keep improving match rate. |
| Stream Error Recovery UX | next | Fewer dead ends with clearer retries and graceful fallback behavior. | Add specific user-facing states for failures. |

## Premium Product Story

| Feature | Status | Value Statement | Proof / Notes |
| --- | --- | --- | --- |
| The Listening Room (Ad-light Premium Feel) | now | A calm, focused listening space designed for taste over noise. | Core brand pillar. |
| Pro Subscription (Paddle Billing) | now | Unlock premium listening with simple subscription management. | Billing stack already in production path. |
| Editorial Collections | next | Discover stations through curated themes and seasonal programming. | Candidate for homepage storytelling modules. |
| Staff Picks Narrative Cards | later | Learn why each station matters through editorial context. | Strong for retention and social sharing. |

## Retention + Personalization

| Feature | Status | Value Statement | Proof / Notes |
| --- | --- | --- | --- |
| Cross-Device Player Preferences | next | Your listening setup feels familiar on every signed-in device. | Backend-synced preferences endpoint added. |
| Favorites / Saved Stations | later | Build your personal listening shelf in one tap. | Future protected endpoint + UI. |
| Smart Continue Listening Rail | later | Resume your recent stations instantly from home. | Requires recent history model. |
| Daypart Recommendations | explore | Get context-aware suggestions for morning, focus, or late-night sessions. | Needs recommendation logic validation. |

## Growth + Marketing Surface

| Feature | Status | Value Statement | Proof / Notes |
| --- | --- | --- | --- |
| Public Shareable Station Pages | later | Turn every station into a discoverable, SEO-friendly entry point. | Strong organic growth lever. |
| Curator Spotlights | explore | Build trust by highlighting the people behind the curation. | Content + editorial workflow needed. |
| Weekly Listening Digest Email | explore | Bring listeners back with personalized highlights and new picks. | Depends on event tracking + email flow. |
| Launch Event Collections | later | Create campaign-ready seasonal collections for promos and partnerships. | Useful for coordinated marketing pushes. |

## Feature Request Intake Template

Use this when adding a new candidate feature:

- Feature Name:
- Status: now | next | later | explore
- Audience: who benefits most
- Value Statement: one sentence in customer language
- Proof Needed: what evidence validates this
- Dependencies: backend, frontend, infra, content
- Launch Asset Ideas: screenshot, short demo, changelog note, hero copy
