package metadata

import (
	"bufio"
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type icyBudget struct {
	timeout   time.Duration
	maxBlocks int
	delayed   bool
}

// icyBudgets returns the list of budgets fetchICYAdaptive will try in order.
//
//   - Runtime mode: a single budget reflecting cfg.DelayedICY.
//   - Probe mode:   fast first, then delayed (so we can detect delayed streams).
func icyBudgets(cfg Config, mode fetchMode) []icyBudget {
	if cfg.DelayedICY {
		return []icyBudget{{icyTimeoutDelayed, maxICYMetadataBlocksSlow, true}}
	}
	out := []icyBudget{{icyTimeoutFast, maxICYMetadataBlocksFast, false}}
	if mode == modeProbe {
		out = append(out, icyBudget{icyTimeoutDelayed, maxICYMetadataBlocksSlow, true})
	}
	return out
}

// shouldRetryWithDelayedBudget reports whether the prior fast-budget error is
// the kind of failure that an extended budget could plausibly fix.
func shouldRetryWithDelayedBudget(err error) bool {
	if err == nil {
		return true
	}
	return errors.Is(err, context.DeadlineExceeded) ||
		errors.Is(err, context.Canceled) ||
		errors.Is(err, ErrNoStreamTitle) ||
		errors.Is(err, ErrEmptyMetadata) ||
		errors.Is(err, ErrICYRead)
}

func (f *Fetcher) fetchICYAdaptive(ctx context.Context, streamURL string, cfg Config, mode fetchMode) (*NowPlaying, FetchEvidence, error) {
	budgets := icyBudgets(cfg, mode)
	var lastErr error

	for i, budget := range budgets {
		icyCtx, cancel := context.WithTimeout(ctx, budget.timeout)
		np, blocks, err := f.fetchICY(icyCtx, streamURL, budget.maxBlocks)
		cancel()
		if err == nil && np != nil && np.Title != "" {
			ev := FetchEvidence{
				DelayedICY: budget.delayed || blocks > maxICYMetadataBlocksFast,
				BlocksRead: blocks,
			}
			return np, ev, nil
		}
		lastErr = err

		if isICYProtocolError(err) {
			rawCtx, rawCancel := context.WithTimeout(ctx, budget.timeout)
			npRaw, rawBlocks, rawErr := f.fetchICYRaw(rawCtx, streamURL, budget.maxBlocks)
			rawCancel()
			if rawErr == nil && npRaw != nil && npRaw.Title != "" {
				ev := FetchEvidence{
					DelayedICY: budget.delayed || rawBlocks > maxICYMetadataBlocksFast,
					BlocksRead: rawBlocks,
				}
				return npRaw, ev, nil
			}
			lastErr = rawErr
		}

		if i == len(budgets)-1 || !shouldRetryWithDelayedBudget(lastErr) {
			break
		}
	}
	return nil, FetchEvidence{}, lastErr
}

// ---------------------------------------------------------------------------
// Strategy 1a — ICY via http.Client
// ---------------------------------------------------------------------------

func (f *Fetcher) fetchICY(ctx context.Context, streamURL string, maxBlocks int) (*NowPlaying, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, streamURL, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Icy-Metadata", "1")
	req.Header.Set("User-Agent", userAgent)

	resp, err := f.icyClient.Do(req)
	if err != nil {
		// net/http surfaces "ICY 200 OK" as a malformed-protocol error.
		// Translate to ErrICYProtocol so callers can fall back to fetchICYRaw.
		s := err.Error()
		if strings.Contains(s, `malformed HTTP version "ICY"`) ||
			strings.Contains(s, "malformed HTTP response") ||
			strings.Contains(s, "bad status line") {
			return nil, 0, fmt.Errorf("%w: %v", ErrICYProtocol, err)
		}
		return nil, 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, 0, fmt.Errorf("%w: %d", ErrUpstreamStatus, resp.StatusCode)
	}

	metaintStr := resp.Header.Get("Icy-Metaint")
	if metaintStr == "" {
		return nil, 0, ErrNoMetaint
	}
	metaint, err := strconv.Atoi(metaintStr)
	if err != nil || metaint <= 0 || metaint > maxMetaint {
		return nil, 0, fmt.Errorf("%w: %q", ErrInvalidMetaint, metaintStr)
	}

	return f.readICYBlock(resp.Body, metaint, streamURL, maxBlocks)
}

// ---------------------------------------------------------------------------
// Strategy 1b — ICY via raw TCP (handles "ICY 200 OK" status lines)
// ---------------------------------------------------------------------------

func (f *Fetcher) fetchICYRaw(ctx context.Context, streamURL string, maxBlocks int) (*NowPlaying, int, error) {
	u, err := url.Parse(streamURL)
	if err != nil {
		return nil, 0, fmt.Errorf("%w: %v", ErrParse, err)
	}

	host := u.Host
	if u.Port() == "" {
		if u.Scheme == "https" {
			host = u.Hostname() + ":443"
		} else {
			host = u.Hostname() + ":80"
		}
	}

	netConn, err := (&net.Dialer{}).DialContext(ctx, "tcp", host)
	if err != nil {
		return nil, 0, fmt.Errorf("dial: %w", err)
	}

	var conn net.Conn = netConn
	if u.Scheme == "https" {
		tlsConn := tls.Client(netConn, &tls.Config{
			ServerName: u.Hostname(),
			MinVersion: tls.VersionTLS12,
		})
		if err := tlsConn.HandshakeContext(ctx); err != nil {
			netConn.Close()
			return nil, 0, fmt.Errorf("tls handshake: %w", err)
		}
		conn = tlsConn
	}
	defer conn.Close()

	if deadline, ok := ctx.Deadline(); ok {
		_ = conn.SetDeadline(deadline)
	}

	// HTTP/1.0 + Connection: close — many ICY servers refuse keep-alive.
	if _, err := fmt.Fprintf(conn,
		"GET %s HTTP/1.0\r\nHost: %s\r\nIcy-Metadata: 1\r\nUser-Agent: %s\r\nConnection: close\r\n\r\n",
		u.RequestURI(), u.Hostname(), userAgent,
	); err != nil {
		return nil, 0, fmt.Errorf("write request: %w", err)
	}

	r := bufio.NewReader(conn)
	statusLine, err := r.ReadString('\n')
	if err != nil {
		return nil, 0, fmt.Errorf("read status line: %w", err)
	}
	statusLine = strings.TrimRight(statusLine, "\r\n")
	// Status line shape: "HTTP/1.x 200 OK" or "ICY 200 OK". Verify the
	// protocol prefix and the 200 token explicitly so e.g. "ICY 404 Not Found"
	// or a body fragment containing " 200 " is not misclassified as success.
	fields := strings.Fields(statusLine)
	if len(fields) < 2 {
		return nil, 0, fmt.Errorf("%w: malformed status line: %q", ErrICYProtocol, statusLine)
	}
	proto := fields[0]
	if !strings.HasPrefix(proto, "HTTP/") && proto != "ICY" {
		return nil, 0, fmt.Errorf("%w: unknown protocol: %q", ErrICYProtocol, statusLine)
	}
	if fields[1] != "200" {
		return nil, 0, fmt.Errorf("%w: %s", ErrUpstreamStatus, fields[1])
	}

	// Read response headers until blank line.
	var metaintStr string
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return nil, 0, fmt.Errorf("read headers: %w", err)
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			break
		}
		if idx := strings.IndexByte(line, ':'); idx != -1 {
			k := strings.ToLower(strings.TrimSpace(line[:idx]))
			v := strings.TrimSpace(line[idx+1:])
			if k == "icy-metaint" {
				metaintStr = v
			}
		}
	}

	if metaintStr == "" {
		return nil, 0, ErrNoMetaint
	}
	metaint, err := strconv.Atoi(metaintStr)
	if err != nil || metaint <= 0 || metaint > maxMetaint {
		return nil, 0, fmt.Errorf("%w: %q", ErrInvalidMetaint, metaintStr)
	}

	return f.readICYBlock(r, metaint, streamURL, maxBlocks)
}

// readICYBlock skips `metaint` audio bytes and scans up to maxBlocks metadata
// frames so preroll ads or empty blocks do not mask a later real track title.
func (f *Fetcher) readICYBlock(r io.Reader, metaint int, streamURL string, maxBlocks int) (*NowPlaying, int, error) {
	emptyBlocks := 0
	for attempt := 0; attempt < maxBlocks; attempt++ {
		if _, err := io.CopyN(io.Discard, r, int64(metaint)); err != nil {
			return nil, attempt, fmt.Errorf("%w: skip audio bytes: %v", ErrICYRead, err)
		}

		// 1-byte length field; actual block size = value × 16.
		var lenBuf [1]byte
		if _, err := io.ReadFull(r, lenBuf[:]); err != nil {
			return nil, attempt, fmt.Errorf("%w: read meta length byte: %v", ErrICYRead, err)
		}
		metaLen := int(lenBuf[0]) * 16
		if metaLen == 0 {
			emptyBlocks++
			continue
		}

		metaBuf := make([]byte, metaLen)
		if _, err := io.ReadFull(r, metaBuf); err != nil {
			return nil, attempt + 1, fmt.Errorf("%w: read metadata block: %v", ErrICYRead, err)
		}

		raw := strings.TrimRight(string(metaBuf), "\x00")
		title := normalizeMetadataTitle(extractICYField(raw, "StreamTitle"))
		if isPlaceholderTitle(title) {
			title = ""
		}
		if title == "" {
			emptyBlocks++
			continue
		}

		if emptyBlocks > 0 {
			f.log.Debug("metadata: icy preroll skipped",
				"url", streamURL,
				"empty_blocks", emptyBlocks,
				"title_at_block", attempt+1,
			)
		}
		np := &NowPlaying{
			Title:       title,
			Source:      TypeICY,
			MetadataURL: streamURL,
			FetchedAt:   time.Now(),
		}
		np.Artist, np.Song = splitArtistTitle(title)
		return np, attempt + 1, nil
	}

	if emptyBlocks > 0 {
		f.log.Debug("metadata: icy gave up after empty blocks",
			"url", streamURL,
			"empty_blocks", emptyBlocks,
			"max_blocks", maxBlocks,
		)
	}
	return nil, maxBlocks, fmt.Errorf("%w: %d blocks", ErrNoStreamTitle, maxBlocks)
}
