// Package radio handles station ingestion from Radio Browser API and applies
// the curation layer that makes OSTGUT feel premium.
package radio

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

const (
	// radioBrowserBase is the community-run open radio directory.
	radioBrowserBase = "https://de1.api.radio-browser.info/json"

	// minBitrate filters out low-quality streams.
	minBitrate = 64

	// minVotes is a proxy for reliability — stations with few votes are often dead.
	minVotes = 5

	// batchSize controls how many stations we fetch per request.
	batchSize = 500

	// syncInterval is how often the background goroutine re-syncs.
	SyncInterval = 6 * time.Hour
)

// radioBrowserStation is the raw shape returned by Radio Browser API.
type radioBrowserStation struct {
	StationUUID   string `json:"stationuuid"`
	Name          string `json:"name"`
	URL           string `json:"url_resolved"`
	Homepage      string `json:"homepage"`
	Favicon       string `json:"favicon"`
	Tags          string `json:"tags"` // comma-separated
	Country       string `json:"country"`
	State         string `json:"state"`
	Language      string `json:"language"`
	LanguageCodes string `json:"languagecodes"`
	Codec         string `json:"codec"`
	Bitrate       int    `json:"bitrate"`
	Votes         int    `json:"votes"`
	ClickCount    int    `json:"clickcount"`
	LastCheckOK   int    `json:"lastcheckok"` // 1 = OK, 0 = down
}

// Syncer fetches stations from Radio Browser and writes them to the store.
type Syncer struct {
	store       *store.StationStore
	streamStore *store.StationStreamStore
	log         *slog.Logger
	client      *http.Client // Radio Browser API requests
	probeClient *http.Client // stream probing — shorter timeout
}

// NewSyncer creates a Syncer.
func NewSyncer(s *store.StationStore, streamStore *store.StationStreamStore, log *slog.Logger) *Syncer {
	return &Syncer{
		store:       s,
		streamStore: streamStore,
		log:         log,
		client:      &http.Client{Timeout: 30 * time.Second},
		probeClient: &http.Client{Timeout: 8 * time.Second},
	}
}

// Run blocks, syncing immediately then on SyncInterval.
func (s *Syncer) Run(ctx context.Context) {
	s.sync(ctx)
	ticker := time.NewTicker(SyncInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			s.sync(ctx)
		case <-ctx.Done():
			return
		}
	}
}

func (s *Syncer) sync(ctx context.Context) {
	s.log.Info("radio: starting station sync")
	start := time.Now()

	stations, err := s.fetch(ctx)
	if err != nil {
		s.log.Error("radio: fetch failed", "error", err)
		return
	}

	curated := curate(stations)
	s.log.Info("radio: curation complete", "fetched", len(stations), "curated", len(curated))

	var saved int
	for _, st := range curated {
		stationID, err := s.store.Upsert(ctx, st)
		if err != nil {
			s.log.Warn("radio: upsert failed", "station", st.Name, "error", err)
			continue
		}

		probe := LightClassifyStreamURL(st.StreamURL)
		// Playlist containers (m3u, pls) must be resolved to find the actual
		// audio URL. We also probe opaque direct URLs (no known extension/codec)
		// to classify HLS/audio by content-type instead of filename suffix.
		if shouldProbeIngestionStream(probe) {
			probeCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
			probe = ProbeStream(probeCtx, s.probeClient, st.StreamURL)
			cancel()
		}
		err = s.streamStore.UpsertPrimaryForStation(ctx, stationID, store.StationStreamInput{
			URL:                    probe.URL,
			ResolvedURL:            probe.ResolvedURL,
			Kind:                   probe.Kind,
			Container:              probe.Container,
			Transport:              probe.Transport,
			MimeType:               probe.MimeType,
			Codec:                  probe.Codec,
			Bitrate:                probe.Bitrate,
			BitDepth:               probe.BitDepth,
			SampleRateHz:           probe.SampleRateHz,
			SampleRateConfidence:   probe.SampleRateConfidence,
			Channels:               probe.Channels,
			Priority:               1,
			IsActive:               true,
			LoudnessIntegratedLUFS: probe.LoudnessIntegratedLUFS,
			LoudnessPeakDBFS:       probe.LoudnessPeakDBFS,
			LoudnessSampleDuration: probe.LoudnessSampleDuration,
			LoudnessMeasuredAt:     probe.LoudnessMeasuredAt,
			LoudnessStatus:         probe.LoudnessStatus,
			MetadataEnabled:        true,
			MetadataType:           "auto",
			HealthScore:            clamp(st.ReliabilityScore, 0, 1),
			LastCheckedAt:          &probe.LastCheckedAt,
			LastError:              probe.LastError,
		})
		if err != nil {
			s.log.Warn("radio: stream upsert failed", "station", st.Name, "error", err)
		}
		saved++
	}

	s.log.Info("radio: sync done", "saved", saved, "duration", time.Since(start).Round(time.Second))
}

func shouldProbeIngestionStream(p StreamProbeResult) bool {
	if p.Kind == "playlist" {
		return true
	}
	return p.Kind == "direct" && p.Container == "none" && strings.TrimSpace(p.Codec) == ""
}

// fetch retrieves stations from Radio Browser, paginating until exhausted.
func (s *Syncer) fetch(ctx context.Context) ([]radioBrowserStation, error) {
	var all []radioBrowserStation
	offset := 0

	for {
		url := fmt.Sprintf(
			"%s/stations/search?limit=%d&offset=%d&order=votes&reverse=true&hidebroken=true",
			radioBrowserBase, batchSize, offset,
		)

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("User-Agent", "OSTGUT/1.0 (radio@worksfine.app)")

		resp, err := s.client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("radio browser request: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("radio browser returned %d", resp.StatusCode)
		}

		var batch []radioBrowserStation
		if err := json.NewDecoder(resp.Body).Decode(&batch); err != nil {
			return nil, fmt.Errorf("decode: %w", err)
		}

		all = append(all, batch...)

		// Stop when we get a partial page (last page) or have enough.
		if len(batch) < batchSize || len(all) >= 10_000 {
			break
		}
		offset += batchSize
	}

	return all, nil
}

// curate applies curation rules and converts to store.Station.
// Rules (in order):
//  1. Stream URL must be non-empty
//  2. Last check must be OK
//  3. Bitrate >= minBitrate
//  4. Votes >= minVotes
//  5. Reliability score computed from votes + clicks
func curate(raw []radioBrowserStation) []*store.Station {
	var out []*store.Station

	for _, r := range raw {
		// Hard filters
		if r.URL == "" {
			continue
		}
		if r.LastCheckOK != 1 {
			continue
		}
		if r.Bitrate < minBitrate {
			continue
		}
		if r.Votes < minVotes {
			continue
		}

		name := strings.TrimSpace(r.Name)
		if name == "" {
			continue
		}

		// Parse tags
		tags := parseTags(r.Tags)

		// Derive genres from tags; Upsert merges them into tags on write
		genres := matchGenres(tags)

		// Reliability score: normalised votes weighted 70%, clicks 30%
		// Both capped at 10 000 to avoid outlier domination.
		votesNorm := clamp(float64(r.Votes)/10_000, 0, 1)
		clicksNorm := clamp(float64(r.ClickCount)/10_000, 0, 1)
		reliability := votesNorm*0.7 + clicksNorm*0.3

		out = append(out, &store.Station{
			ExternalID:       r.StationUUID,
			Name:             name,
			StreamURL:        r.URL,
			Homepage:         r.Homepage,
			Logo:             r.Favicon,
			Genres:           genres,
			Language:         primaryLanguage(r.Language, r.LanguageCodes),
			Country:          r.Country,
			City:             strings.TrimSpace(r.State),
			Tags:             tags,
			Votes:            r.Votes,
			ClickCount:       r.ClickCount,
			ReliabilityScore: reliability,
			IsActive:         true,
		})
	}

	return out
}

func parseTags(raw string) []string {
	var tags []string
	for _, t := range strings.Split(raw, ",") {
		t = strings.ToLower(strings.TrimSpace(t))
		if t != "" {
			tags = append(tags, t)
		}
	}
	return tags
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		v = strings.TrimSpace(v)
		if v != "" {
			return v
		}
	}
	return ""
}

func firstPositive(values ...int) int {
	for _, v := range values {
		if v > 0 {
			return v
		}
	}
	return 0
}

// genreKeywords maps common radio tags to a canonical genre name.
var genreKeywords = []struct {
	keyword string
	genre   string
}{
	{"jazz", "Jazz"},
	{"classical", "Classical"},
	{"classic rock", "Classic Rock"},
	{"rock", "Rock"},
	{"pop", "Pop"},
	{"electronic", "Electronic"},
	{"dance", "Dance"},
	{"house", "House"},
	{"techno", "Techno"},
	{"ambient", "Ambient"},
	{"lofi", "Lo-Fi"},
	{"lo-fi", "Lo-Fi"},
	{"hip hop", "Hip-Hop"},
	{"hiphop", "Hip-Hop"},
	{"r&b", "R&B"},
	{"soul", "Soul"},
	{"blues", "Blues"},
	{"country", "Country"},
	{"folk", "Folk"},
	{"reggae", "Reggae"},
	{"latin", "Latin"},
	{"news", "News"},
	{"talk", "Talk"},
	{"sports", "Sports"},
	{"world", "World"},
	{"metal", "Metal"},
	{"punk", "Punk"},
	{"alternative", "Alternative"},
	{"indie", "Indie"},
}

func matchGenres(tags []string) []string {
	combined := strings.ToLower(strings.Join(tags, " "))
	var genres []string
	for _, g := range genreKeywords {
		if strings.Contains(combined, g.keyword) {
			genres = append(genres, g.genre)
		}
	}
	if len(genres) == 0 {
		return []string{"World"}
	}
	return genres
}

func primaryLanguage(language, codes string) string {
	if language != "" {
		parts := strings.Split(language, ",")
		return strings.TrimSpace(parts[0])
	}
	if codes != "" {
		parts := strings.Split(codes, ",")
		return strings.TrimSpace(parts[0])
	}
	return ""
}

func clamp(v, min, max float64) float64 {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}
