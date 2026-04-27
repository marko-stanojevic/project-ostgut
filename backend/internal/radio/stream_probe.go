package radio

import (
	"bufio"
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"
)

const streamProbeUserAgent = "OSTGUT/1.0 (radio@worksfine.app)"
const maxProbeRedirects = 5
const maxProbeHostChanges = 2

type ProbeFailureCode string

const (
	ProbeFailureInvalidURL                ProbeFailureCode = "invalid_url"
	ProbeFailureUnsupportedScheme         ProbeFailureCode = "unsupported_scheme"
	ProbeFailureDisallowedHost            ProbeFailureCode = "disallowed_host"
	ProbeFailureTooManyRedirects          ProbeFailureCode = "too_many_redirects"
	ProbeFailureRedirectUnsupportedScheme ProbeFailureCode = "redirect_unsupported_scheme"
	ProbeFailureTooManyHostChanges        ProbeFailureCode = "too_many_host_changes"
	ProbeFailureTimeout                   ProbeFailureCode = "timeout"
	ProbeFailureRequestFailed             ProbeFailureCode = "request_failed"
	ProbeFailureHTTPStatus                ProbeFailureCode = "http_status"
	ProbeFailurePlaylistDepthExceeded     ProbeFailureCode = "playlist_depth_exceeded"
	ProbeFailurePlaylistEmpty             ProbeFailureCode = "playlist_empty"
	ProbeFailurePlaylistReadFailed        ProbeFailureCode = "playlist_read_failed"
)

type ProbeError struct {
	Code ProbeFailureCode
	Err  error
}

func (e ProbeError) Error() string {
	if e.Err == nil {
		return string(e.Code)
	}
	return e.Err.Error()
}

func (e ProbeError) Unwrap() error {
	return e.Err
}

func probeFailure(code ProbeFailureCode, format string, args ...any) error {
	return ProbeError{Code: code, Err: fmt.Errorf(format, args...)}
}

func probeFailureCode(err error) ProbeFailureCode {
	var probeErr ProbeError
	if errors.As(err, &probeErr) && probeErr.Code != "" {
		return probeErr.Code
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return ProbeFailureTimeout
	}
	return ProbeFailureRequestFailed
}

type StreamProbeResult struct {
	URL                    string
	ResolvedURL            string
	Kind                   string
	Container              string
	Transport              string
	MimeType               string
	Codec                  string
	Bitrate                int
	BitDepth               int
	SampleRateHz           int
	SampleRateConfidence   string
	Channels               int
	LoudnessIntegratedLUFS *float64
	LoudnessPeakDBFS       *float64
	LoudnessSampleDuration float64
	LoudnessMeasuredAt     *time.Time
	LoudnessStatus         string
	LastError              *string
	LastErrorCode          string
	LastCheckedAt          time.Time
}

type StreamProbeOptions struct {
	IncludeLoudness bool
}

func LightClassifyStreamURL(rawURL string) StreamProbeResult {
	now := time.Now().UTC()
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		msg := err.Error()
		return StreamProbeResult{
			URL:            strings.TrimSpace(rawURL),
			ResolvedURL:    strings.TrimSpace(rawURL),
			Kind:           "direct",
			Container:      "none",
			Transport:      "http",
			LoudnessStatus: "unknown",
			LastError:      &msg,
			LastErrorCode:  string(ProbeFailureInvalidURL),
			LastCheckedAt:  now,
		}
	}

	kind, container := classifyPath(u.Path)
	transport := "http"
	if strings.EqualFold(u.Scheme, "https") {
		transport = "https"
	}

	return StreamProbeResult{
		URL:            strings.TrimSpace(rawURL),
		ResolvedURL:    strings.TrimSpace(rawURL),
		Kind:           kind,
		Container:      container,
		Transport:      transport,
		Codec:          codecFromPath(u.Path),
		LoudnessStatus: "unknown",
		LastCheckedAt:  now,
	}
}

func ProbeStream(ctx context.Context, client *http.Client, rawURL string) StreamProbeResult {
	return ProbeStreamWithOptions(ctx, client, rawURL, StreamProbeOptions{
		IncludeLoudness: true,
	})
}

func ProbeStreamWithOptions(ctx context.Context, client *http.Client, rawURL string, opts StreamProbeOptions) StreamProbeResult {
	base := LightClassifyStreamURL(rawURL)
	base.LastCheckedAt = time.Now().UTC()

	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || u.Scheme == "" || u.Host == "" {
		msg := "stream URL must be a valid absolute URL"
		base.LastError = &msg
		base.LastErrorCode = string(ProbeFailureInvalidURL)
		return base
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		msg := "stream URL must use http or https"
		base.LastError = &msg
		base.LastErrorCode = string(ProbeFailureUnsupportedScheme)
		return base
	}
	if isDisallowedProbeURL(u) {
		msg := "stream URL points to a disallowed host"
		base.LastError = &msg
		base.LastErrorCode = string(ProbeFailureDisallowedHost)
		return base
	}

	if client == nil {
		client = &http.Client{Timeout: 8 * time.Second}
	}
	safeClient := *client
	safeClient.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) >= maxProbeRedirects {
			return probeFailure(ProbeFailureTooManyRedirects, "too many redirects")
		}
		if req == nil || req.URL == nil {
			return ProbeError{Code: ProbeFailureInvalidURL, Err: errors.New("invalid redirect URL")}
		}
		if req.URL.Scheme != "http" && req.URL.Scheme != "https" {
			return probeFailure(ProbeFailureRedirectUnsupportedScheme, "redirect uses unsupported scheme")
		}
		if isDisallowedProbeURL(req.URL) {
			return probeFailure(ProbeFailureDisallowedHost, "redirect target is disallowed")
		}
		if redirectHostChangeCount(via, req.URL) > maxProbeHostChanges {
			return probeFailure(ProbeFailureTooManyHostChanges, "too many redirect host changes")
		}
		return nil
	}

	resolved, err := probeRecursive(ctx, &safeClient, strings.TrimSpace(rawURL), 0, opts)
	if err != nil {
		msg := err.Error()
		base.LastError = &msg
		base.LastErrorCode = string(probeFailureCode(err))
		return base
	}
	return resolved
}

func probeRecursive(ctx context.Context, client *http.Client, target string, depth int, opts StreamProbeOptions) (StreamProbeResult, error) {
	const maxDepth = 3
	if depth > maxDepth {
		return StreamProbeResult{}, probeFailure(ProbeFailurePlaylistDepthExceeded, "playlist resolution depth exceeded")
	}
	targetURL, err := url.Parse(strings.TrimSpace(target))
	if err != nil || targetURL == nil {
		return StreamProbeResult{}, probeFailure(ProbeFailureInvalidURL, "invalid probe URL")
	}
	if isDisallowedProbeURL(targetURL) {
		return StreamProbeResult{}, probeFailure(ProbeFailureDisallowedHost, "probe URL target is disallowed")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return StreamProbeResult{}, ProbeError{Code: ProbeFailureInvalidURL, Err: fmt.Errorf("build request: %w", err)}
	}
	// Radio endpoints often keep streaming bytes forever and can confuse
	// keep-alive reuse; force one-shot probe connections.
	req.Close = true
	req.Header.Set("User-Agent", streamProbeUserAgent)
	req.Header.Set("Range", "bytes=0-65535")
	req.Header.Set("Icy-Metadata", "1")
	req.Header.Set("Connection", "close")

	resp, err := client.Do(req)
	if err != nil {
		code := ProbeFailureRequestFailed
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) {
			code = ProbeFailureTimeout
		} else {
			var probeErr ProbeError
			if errors.As(err, &probeErr) {
				code = probeErr.Code
			}
		}
		return StreamProbeResult{}, ProbeError{Code: code, Err: fmt.Errorf("probe request failed: %w", err)}
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		return StreamProbeResult{}, probeFailure(ProbeFailureHTTPStatus, "probe status %d", resp.StatusCode)
	}

	finalURL := target
	if resp.Request != nil && resp.Request.URL != nil {
		finalURL = resp.Request.URL.String()
	}
	finalParsed, _ := url.Parse(finalURL)
	if finalParsed == nil || isDisallowedProbeURL(finalParsed) {
		return StreamProbeResult{}, probeFailure(ProbeFailureDisallowedHost, "resolved URL target is disallowed")
	}
	kindByPath, containerByPath := classifyPath(finalParsed.Path)

	contentType := strings.ToLower(strings.TrimSpace(resp.Header.Get("Content-Type")))
	contentType = strings.TrimSpace(strings.Split(contentType, ";")[0])
	kindByType, containerByType := classifyContentType(contentType)

	kind := kindByType
	container := containerByType
	if kind == "" {
		kind = kindByPath
		container = containerByPath
	}
	if kind == "" {
		kind = "direct"
		container = "none"
	}

	transport := "http"
	if strings.EqualFold(finalParsed.Scheme, "https") {
		transport = "https"
	}
	if resp.Header.Get("Icy-Metaint") != "" || resp.Header.Get("Icy-Name") != "" {
		transport = "icy"
	}

	codec := codecFromContentType(contentType)
	if codec == "" {
		codec = codecFromPath(finalParsed.Path)
	}
	bitrate := parseBitrateHeader(resp.Header.Get("Icy-Br"))

	result := StreamProbeResult{
		URL:                  target,
		ResolvedURL:          finalURL,
		Kind:                 kind,
		Container:            container,
		Transport:            transport,
		MimeType:             contentType,
		Codec:                codec,
		Bitrate:              bitrate,
		SampleRateConfidence: "unknown",
		LoudnessStatus:       "unknown",
		LastCheckedAt:        time.Now().UTC(),
	}

	if kind != "playlist" {
		probeBytes, readErr := io.ReadAll(io.LimitReader(resp.Body, 128*1024))
		if readErr == nil && len(probeBytes) > 0 {
			if isLikelyFLAC(codec, contentType, finalURL) {
				if sr, bd, ch, ok := parseFLACStreamInfo(probeBytes); ok {
					result.SampleRateHz = sr
					result.SampleRateConfidence = "parsed_streaminfo"
					result.BitDepth = bd
					result.Channels = ch
				}
			}
			if c, br, sr, ch, ok := parseMPEGAudioInfo(probeBytes); ok {
				if result.Codec == "" {
					result.Codec = c
				}
				if result.Bitrate <= 0 && br > 0 {
					result.Bitrate = br
				}
				if result.SampleRateHz <= 0 && sr > 0 {
					result.SampleRateHz = sr
					result.SampleRateConfidence = "parsed_frame"
				}
				if result.Channels <= 0 && ch > 0 {
					result.Channels = ch
				}
			}
			if opts.IncludeLoudness {
				loudness := MeasureSampleLoudness(ctx, probeBytes, result.Bitrate)
				result.LoudnessIntegratedLUFS = loudness.IntegratedLUFS
				result.LoudnessPeakDBFS = loudness.PeakDBFS
				result.LoudnessSampleDuration = loudness.SampleDuration
				result.LoudnessMeasuredAt = loudness.MeasuredAt
				result.LoudnessStatus = loudness.Status
			}
		}
		return result, nil
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return result, ProbeError{Code: ProbeFailurePlaylistReadFailed, Err: fmt.Errorf("read playlist body: %w", err)}
	}

	var nested string
	switch container {
	case "pls":
		nested = firstPLSEntry(string(body), finalParsed)
	default:
		nested = firstM3UEntry(string(body), finalParsed)
	}
	if nested == "" {
		return result, probeFailure(ProbeFailurePlaylistEmpty, "playlist contains no playable URL")
	}

	next, err := probeRecursive(ctx, client, nested, depth+1, opts)
	if err != nil {
		return result, err
	}
	next.URL = target
	return next, nil
}

func classifyPath(p string) (kind string, container string) {
	ext := strings.ToLower(path.Ext(strings.TrimSpace(p)))
	switch ext {
	case ".m3u8":
		return "hls", "m3u8"
	case ".mpd":
		return "dash", "mpd"
	case ".m3u":
		return "playlist", "m3u"
	case ".pls":
		return "playlist", "pls"
	default:
		return "direct", "none"
	}
}

func classifyContentType(ct string) (kind string, container string) {
	switch {
	case strings.Contains(ct, "application/vnd.apple.mpegurl"), strings.Contains(ct, "application/x-mpegurl"):
		return "hls", "m3u8"
	case strings.Contains(ct, "application/dash+xml"):
		return "dash", "mpd"
	case strings.Contains(ct, "audio/x-scpls"), strings.Contains(ct, "application/pls+xml"):
		return "playlist", "pls"
	case strings.Contains(ct, "audio/x-mpegurl"):
		return "playlist", "m3u"
	default:
		return "", ""
	}
}

func codecFromContentType(ct string) string {
	switch {
	case strings.Contains(ct, "audio/mpeg"):
		return "MP3"
	case strings.Contains(ct, "aac"), strings.Contains(ct, "aacp"):
		return "AAC"
	case strings.Contains(ct, "flac"):
		return "FLAC"
	case strings.Contains(ct, "opus"):
		return "OPUS"
	case strings.Contains(ct, "ogg") || strings.Contains(ct, "vorbis"):
		return "OGG"
	default:
		return ""
	}
}

func codecFromPath(p string) string {
	ext := strings.ToLower(path.Ext(strings.TrimSpace(p)))
	switch ext {
	case ".mp3":
		return "MP3"
	case ".aac", ".aacp":
		return "AAC"
	case ".flac":
		return "FLAC"
	case ".opus":
		return "OPUS"
	case ".ogg", ".oga":
		return "OGG"
	default:
		return ""
	}
}

func parseBitrateHeader(raw string) int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v < 0 {
		return 0
	}
	return v
}

func isLikelyFLAC(codec, mimeType, streamURL string) bool {
	lc := strings.ToLower(strings.TrimSpace(codec))
	if strings.Contains(lc, "flac") {
		return true
	}
	lm := strings.ToLower(strings.TrimSpace(mimeType))
	if strings.Contains(lm, "flac") {
		return true
	}
	return strings.Contains(strings.ToLower(strings.TrimSpace(streamURL)), "flac")
}

func parseFLACStreamInfo(data []byte) (sampleRateHz int, bitDepth int, channels int, ok bool) {
	start := bytes.Index(data, []byte("fLaC"))
	if start < 0 || len(data[start:]) < 4 {
		return 0, 0, 0, false
	}

	i := start + 4
	for i+4 <= len(data) {
		header := data[i]
		blockType := header & 0x7F
		length := int(data[i+1])<<16 | int(data[i+2])<<8 | int(data[i+3])
		i += 4
		if length < 0 || i+length > len(data) {
			return 0, 0, 0, false
		}
		block := data[i : i+length]
		i += length

		if blockType != 0 { // STREAMINFO
			continue
		}
		if len(block) < 18 {
			return 0, 0, 0, false
		}

		// STREAMINFO bytes 10..17 pack:
		// sample rate (20 bits), channels-1 (3 bits), bits per sample-1 (5 bits), total samples (36 bits)
		packed := binary.BigEndian.Uint64(block[10:18])
		sr := int((packed >> 44) & 0xFFFFF)
		ch := int((packed>>41)&0x7) + 1
		bd := int((packed>>36)&0x1F) + 1
		if sr <= 0 || ch <= 0 || bd <= 0 {
			return 0, 0, 0, false
		}
		return sr, bd, ch, true
	}
	return 0, 0, 0, false
}

func parseMPEGAudioInfo(data []byte) (codec string, bitrate int, sampleRateHz int, channels int, ok bool) {
	// Skip ID3v2 tag when present (common on MP3 streams).
	start := 0
	if len(data) >= 10 && string(data[:3]) == "ID3" {
		size := int(data[6]&0x7F)<<21 | int(data[7]&0x7F)<<14 | int(data[8]&0x7F)<<7 | int(data[9]&0x7F)
		start = 10 + size
		if start >= len(data) {
			start = 0
		}
	}

	for i := start; i+7 <= len(data); i++ {
		if c, br, sr, ch, ok := parseADTSAt(data, i); ok {
			return c, br, sr, ch, true
		}
		if c, br, sr, ch, ok := parseMP3At(data, i); ok {
			return c, br, sr, ch, true
		}
	}
	return "", 0, 0, 0, false
}

func parseADTSAt(data []byte, i int) (codec string, bitrate int, sampleRateHz int, channels int, ok bool) {
	if i+7 > len(data) {
		return "", 0, 0, 0, false
	}
	b0 := data[i]
	b1 := data[i+1]
	b2 := data[i+2]
	b3 := data[i+3]
	b4 := data[i+4]
	b5 := data[i+5]

	// ADTS syncword (12 bits) + layer must be 00.
	if b0 != 0xFF || (b1&0xF0) != 0xF0 || (b1&0x06) != 0x00 {
		return "", 0, 0, 0, false
	}

	sampleRateTable := []int{96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350}
	sampleIdx := int((b2 >> 2) & 0x0F)
	if sampleIdx < 0 || sampleIdx >= len(sampleRateTable) {
		return "", 0, 0, 0, false
	}
	sr := sampleRateTable[sampleIdx]

	channelCfg := int((b2&0x01)<<2) | int((b3>>6)&0x03)
	ch := channelCfg
	if ch <= 0 {
		ch = 0
	}

	frameLen := int(b3&0x03)<<11 | int(b4)<<3 | int((b5>>5)&0x07)
	if frameLen <= 0 {
		return "", 0, 0, 0, false
	}

	// Confirm next frame when available to reduce false positives.
	next := i + frameLen
	if next+1 < len(data) {
		if data[next] != 0xFF || (data[next+1]&0xF0) != 0xF0 {
			return "", 0, 0, 0, false
		}
	}

	return "AAC", 0, sr, ch, true
}

func parseMP3At(data []byte, i int) (codec string, bitrate int, sampleRateHz int, channels int, ok bool) {
	if i+4 > len(data) {
		return "", 0, 0, 0, false
	}
	b0 := data[i]
	b1 := data[i+1]
	b2 := data[i+2]
	b3 := data[i+3]

	// MPEG audio frame sync (11 bits).
	if b0 != 0xFF || (b1&0xE0) != 0xE0 {
		return "", 0, 0, 0, false
	}

	versionID := int((b1 >> 3) & 0x03) // 3=MPEG1,2=MPEG2,0=MPEG2.5
	layerID := int((b1 >> 1) & 0x03)   // 1=Layer III,2=Layer II,3=Layer I
	if versionID == 1 || layerID == 0 {
		return "", 0, 0, 0, false
	}

	bitrateIdx := int((b2 >> 4) & 0x0F)
	sampleIdx := int((b2 >> 2) & 0x03)
	padding := int((b2 >> 1) & 0x01)
	if bitrateIdx == 0 || bitrateIdx == 0x0F || sampleIdx == 0x03 {
		return "", 0, 0, 0, false
	}

	sr := mp3SampleRate(versionID, sampleIdx)
	br := mp3BitrateKbps(versionID, layerID, bitrateIdx)
	if sr <= 0 || br <= 0 {
		return "", 0, 0, 0, false
	}

	chMode := int((b3 >> 6) & 0x03)
	ch := 2
	if chMode == 0x03 {
		ch = 1
	}

	frameLen := mp3FrameLength(versionID, layerID, br, sr, padding)
	if frameLen <= 0 {
		return "", 0, 0, 0, false
	}

	// Confirm next frame when available to reduce false positives.
	next := i + frameLen
	if next+1 < len(data) {
		if data[next] != 0xFF || (data[next+1]&0xE0) != 0xE0 {
			return "", 0, 0, 0, false
		}
	}

	return "MP3", br, sr, ch, true
}

func mp3SampleRate(versionID, sampleIdx int) int {
	table := map[int][]int{
		3: {44100, 48000, 32000}, // MPEG1
		2: {22050, 24000, 16000}, // MPEG2
		0: {11025, 12000, 8000},  // MPEG2.5
	}
	row, ok := table[versionID]
	if !ok || sampleIdx < 0 || sampleIdx >= len(row) {
		return 0
	}
	return row[sampleIdx]
}

func mp3BitrateKbps(versionID, layerID, bitrateIdx int) int {
	mpeg1Layer1 := []int{0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448}
	mpeg1Layer2 := []int{0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384}
	mpeg1Layer3 := []int{0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320}
	mpeg2Layer1 := []int{0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256}
	mpeg2Layer23 := []int{0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160}

	if bitrateIdx <= 0 || bitrateIdx >= 15 {
		return 0
	}
	if versionID == 3 {
		switch layerID {
		case 3:
			return mpeg1Layer1[bitrateIdx]
		case 2:
			return mpeg1Layer2[bitrateIdx]
		case 1:
			return mpeg1Layer3[bitrateIdx]
		}
		return 0
	}
	switch layerID {
	case 3:
		return mpeg2Layer1[bitrateIdx]
	case 2, 1:
		return mpeg2Layer23[bitrateIdx]
	default:
		return 0
	}
}

func mp3FrameLength(versionID, layerID, bitrateKbps, sampleRateHz, padding int) int {
	if bitrateKbps <= 0 || sampleRateHz <= 0 {
		return 0
	}
	if layerID == 3 {
		return ((12 * bitrateKbps * 1000 / sampleRateHz) + padding) * 4
	}
	if layerID == 1 && versionID != 3 {
		return (72 * bitrateKbps * 1000 / sampleRateHz) + padding
	}
	return (144 * bitrateKbps * 1000 / sampleRateHz) + padding
}

func firstPLSEntry(body string, base *url.URL) string {
	scanner := bufio.NewScanner(strings.NewReader(body))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		lower := strings.ToLower(line)
		if !strings.HasPrefix(lower, "file") {
			continue
		}
		idx := strings.IndexByte(line, '=')
		if idx == -1 {
			continue
		}
		raw := strings.TrimSpace(line[idx+1:])
		if abs := absolutePlaylistEntry(raw, base); abs != "" {
			return abs
		}
	}
	return ""
}

func firstM3UEntry(body string, base *url.URL) string {
	scanner := bufio.NewScanner(strings.NewReader(body))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if abs := absolutePlaylistEntry(line, base); abs != "" {
			return abs
		}
	}
	return ""
}

func absolutePlaylistEntry(raw string, base *url.URL) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	if parsed.Scheme == "http" || parsed.Scheme == "https" {
		if isDisallowedProbeURL(parsed) {
			return ""
		}
		return parsed.String()
	}
	if base != nil {
		resolved := base.ResolveReference(parsed)
		if resolved.Scheme == "http" || resolved.Scheme == "https" {
			if isDisallowedProbeURL(resolved) {
				return ""
			}
			return resolved.String()
		}
	}
	return ""
}

func redirectHostChangeCount(via []*http.Request, next *url.URL) int {
	if len(via) == 0 || via[0] == nil || via[0].URL == nil || next == nil {
		return 0
	}

	prevHost := strings.ToLower(via[0].URL.Hostname())
	count := 0
	for i := 1; i < len(via); i++ {
		if via[i] == nil || via[i].URL == nil {
			continue
		}
		host := strings.ToLower(via[i].URL.Hostname())
		if host != "" && prevHost != "" && host != prevHost {
			count++
		}
		prevHost = host
	}
	nextHost := strings.ToLower(next.Hostname())
	if nextHost != "" && prevHost != "" && nextHost != prevHost {
		count++
	}
	return count
}

func isDisallowedProbeURL(u *url.URL) bool {
	if u == nil {
		return true
	}
	host := strings.ToLower(strings.TrimSpace(u.Hostname()))
	if host == "" {
		return true
	}
	if host == "localhost" || strings.HasSuffix(host, ".localhost") || strings.HasSuffix(host, ".local") {
		return true
	}

	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}

	return ip.IsLoopback() ||
		ip.IsPrivate() ||
		ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() ||
		ip.IsMulticast() ||
		ip.IsUnspecified()
}
