# Feature Queue

Loosely prioritised ideas and deferred decisions. Not a roadmap — more a parking lot.

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
