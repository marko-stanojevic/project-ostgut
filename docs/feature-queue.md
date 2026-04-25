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

This is no longer just a stateless poll endpoint. The current implementation is hybrid:

- `GET /stations/:id/now-playing` serves the cached snapshot from `stream_now_playing`
- `GET /stations/:id/now-playing/stream` provides SSE updates for streams whose persisted resolver is `server`
- the backend runs one poll loop per active server-resolved stream with subscribers, then fans one upstream fetch out to all listeners
- stale server snapshots can trigger a one-shot async refresh when the read endpoint is hit without an active SSE loop

### When to revisit

When multi-replica fan-out becomes important. The current in-process poller works well on a single backend instance, but cross-replica coordination will need shared pub/sub if server-resolved SSE traffic grows.

### Remaining scale step

Server-Sent Events are already the push path. The next step, if needed, is making that fan-out replica-aware instead of per-process.

**User benefit:** instant server-side metadata updates without each client polling upstream separately.

**Infrastructure delta:**

- Cross-replica SSE fan-out still needs lightweight pub/sub — Redis pub/sub or Azure Service Bus would work.
- `min_replicas` should be raised to 1 in production for stable long-lived SSE connections.
- If server-side metadata traffic grows, the cadence policy may need to move from fixed fast/slow polling to change-aware backoff.

### WebSocket — skip it

Only worth it if the client also needs to send messages on the same connection. "Now playing" is read-only, so WebSocket adds complexity with no benefit over SSE.
