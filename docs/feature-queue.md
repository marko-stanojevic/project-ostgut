# Feature Queue

Loosely prioritised ideas and deferred decisions. Not a roadmap — more a parking lot.

---

## PlayerContext — separate concerns (Separation of Concerns refactor)

Currently `PlayerContext.tsx` owns three distinct responsibilities in one file:

1. **Playback state** — `AudioElement`, play/pause/stop/volume, queue
2. **localStorage persistence** — reading and writing `player:v1` on every change, cross-tab `storage` events
3. **Backend sync** — `GET /users/me/player-preferences` on mount, debounced `PUT` on every preference change

This violates the Separation of Concerns principle. The file is already long and any future change to persistence or sync logic risks breaking playback.

### Target structure

```
src/
  context/
    PlayerContext.tsx          # owns playback state only; imports hooks below
  hooks/
    usePlayerStorage.ts        # reads/writes localStorage; listens for cross-tab StorageEvent
    usePlayerSync.ts           # GET on mount + debounced PUT; depends on session.accessToken
```

### Refactor steps

1. **Extract `usePlayerStorage`**
   - Move `readPersistedPlayerState`, `toPersistedSnapshot`, `PLAYER_STORAGE_KEY`, the write `useEffect`, and the `storage` event `useEffect` into `hooks/usePlayerStorage.ts`.
   - Hook signature: `usePlayerStorage(volume, station, updatedAt): { onExternalUpdate }` where `onExternalUpdate` is a callback `PlayerContext` passes in to handle cross-tab updates.

2. **Extract `usePlayerSync`**
   - Move the remote hydration `useEffect` and the debounced PUT `useEffect` into `hooks/usePlayerSync.ts`.
   - Hook signature: `usePlayerSync({ volume, station, updatedAt, accessToken, onRemoteUpdate })`.
   - `onRemoteUpdate` is a callback with the resolved remote state so `PlayerContext` can apply it.

3. **Slim down `PlayerContext`**
   - `PlayerProvider` calls both hooks, passes state down as args, and wires the callbacks back to its own setters.
   - All audio element creation and event wiring stays in `PlayerContext`.
   - No `fetch` calls and no `localStorage` calls remain in `PlayerContext.tsx`.

### Constraints

- The public `PlayerContextValue` interface does not change — no consumer components need updating.
- `didHydrateRemoteRef` moves into `usePlayerSync` (it is internal to the sync hook).
- `prefsUpdatedAt` and `touchPreferences()` stay in `PlayerContext` as they drive both hooks.
- All type definitions (`Station`, `PlayerState`, `PersistedPlayerState`, `PlayerPreferencesPayload`) should move to `src/types/player.ts` so they can be shared across the three files without circular imports.

### When to do this

When the next change touches `PlayerContext` — not worth a standalone PR, but the hooks should be in place before adding new persistence fields (e.g. equaliser, playback history).

---

## Now Playing — push vs poll

Currently implemented as a stateless `GET /stations/:id/now-playing` endpoint with a 30 s server-side cache. Good enough for the current scale; track changes every few minutes so the UX difference is invisible.

### When to revisit

When concurrent listeners per station become measurable and the redundant poll traffic shows up in logs, or if sub-10 s "now playing" accuracy becomes a product requirement.

### The SSE path (preferred if push is needed)

Server-Sent Events over HTTP/2 — unidirectional, no protocol upgrade, native browser support, dead simple reconnect. The backend holds the stream open and pushes a JSON event whenever the track changes.

**User benefit:** instant "now playing" updates without any poll overhead. Background tabs get free updates without burning requests.

**Infrastructure delta:**

- Backend needs a broadcaster — a goroutine that fetches metadata on a ticker and fans out to all connected SSE clients for that station.
- Replicas can no longer be fully stateless. A user connected to replica A won't get pushes from replica B. Needs a lightweight pub/sub between replicas — Redis pub/sub or Azure Service Bus would work.
- `min_replicas` should be raised to 1 in production (connections drop on cold start; clients need reconnect logic regardless).
- No changes to the database or frontend auth flow.

### WebSocket — skip it

Only worth it if the client also needs to send messages on the same connection. "Now playing" is read-only, so WebSocket adds complexity with no benefit over SSE.
