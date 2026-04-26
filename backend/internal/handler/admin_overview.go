package handler

import (
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

const (
	adminOverviewProbeStaleAfter    = 7 * 24 * time.Hour
	adminOverviewMetadataStaleAfter = 7 * 24 * time.Hour
	adminOverviewSectionLimit       = 8
)

type adminOverviewResponse struct {
	Summary     adminOverviewSummary   `json:"summary"`
	Metrics     []adminOverviewMetric  `json:"metrics"`
	Sections    []adminOverviewSection `json:"sections"`
	GeneratedAt string                 `json:"generated_at"`
}

type adminOverviewSummary struct {
	ApprovedStations      int `json:"approved_stations"`
	FeaturedStations      int `json:"featured_stations"`
	StationsNeedingAction int `json:"stations_needing_action"`
	HealthyStations       int `json:"healthy_stations"`
	ActiveStreams         int `json:"active_streams"`
}

type adminOverviewMetric struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Value       int    `json:"value"`
	Severity    string `json:"severity"`
	Description string `json:"description"`
}

type adminOverviewSection struct {
	ID          string                       `json:"id"`
	Title       string                       `json:"title"`
	Description string                       `json:"description"`
	Severity    string                       `json:"severity"`
	Count       int                          `json:"count"`
	Stations    []adminOverviewStationHealth `json:"stations"`
}

type adminOverviewStationHealth struct {
	ID               string               `json:"id"`
	Name             string               `json:"name"`
	Logo             string               `json:"logo,omitempty"`
	Country          string               `json:"country"`
	City             string               `json:"city"`
	Featured         bool                 `json:"featured"`
	ReliabilityScore float64              `json:"reliability_score"`
	ActiveStreams    int                  `json:"active_streams"`
	Issues           []adminOverviewIssue `json:"issues"`
}

type adminOverviewIssue struct {
	Code     string `json:"code"`
	Label    string `json:"label"`
	Detail   string `json:"detail"`
	Severity string `json:"severity"`
}

type adminOverviewAccumulator struct {
	approvedStations      int
	featuredStations      int
	stationsNeedingAction int
	healthyStations       int
	activeStreams         int
	probeFailures         int
	metadataFailures      int
	metadataBlocked       int
	staleChecks           int
	lowReliability        int
	editorialGaps         int
	operations            []adminOverviewStationHealth
	metadata              []adminOverviewStationHealth
	editorial             []adminOverviewStationHealth
}

// AdminOverview handles GET /admin/overview.
// It summarizes approved-station health so the admin landing page can surface
// concrete operational and editorial actions instead of only moderation counts.
func (h *Handler) AdminOverview(c *gin.Context) {
	stations, err := h.admin.stations.ListAllByStatus(c.Request.Context(), "approved")
	if err != nil {
		h.log.Error("admin overview list approved", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	stationIDs := make([]string, 0, len(stations))
	for _, station := range stations {
		stationIDs = append(stationIDs, station.ID)
	}

	streamMap, err := h.admin.streams.ListByStationIDs(c.Request.Context(), stationIDs)
	if err != nil {
		h.log.Error("admin overview list streams", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	streamIDs := make([]string, 0)
	for _, streams := range streamMap {
		for _, stream := range streams {
			streamIDs = append(streamIDs, stream.ID)
		}
	}

	nowPlayingMap, err := h.admin.nowPlaying.ListByStreamIDs(c.Request.Context(), streamIDs)
	if err != nil {
		h.log.Error("admin overview list now playing", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	now := time.Now().UTC()
	acc := adminOverviewAccumulator{approvedStations: len(stations)}

	for _, station := range stations {
		if station.Featured {
			acc.featuredStations++
		}

		health := buildAdminOverviewStationHealth(station, streamMap[station.ID], nowPlayingMap, now)
		acc.activeStreams += health.ActiveStreams

		hasOperationalIssue := hasIssueCategory(health.Issues,
			"missing_stream_variants", "no_active_stream", "no_healthy_stream", "probe_failed", "stale_probe", "low_reliability")
		hasMetadataIssue := hasIssueCategory(health.Issues,
			"metadata_fetch_failed", "metadata_disabled", "metadata_resolver_none", "stale_metadata")
		hasEditorialIssue := hasIssueCategory(health.Issues,
			"missing_logo", "missing_overview")

		if len(health.Issues) == 0 {
			acc.healthyStations++
		} else {
			acc.stationsNeedingAction++
		}
		if hasOperationalIssue {
			acc.operations = append(acc.operations, health)
		}
		if hasMetadataIssue {
			acc.metadata = append(acc.metadata, health)
		}
		if hasEditorialIssue {
			acc.editorial = append(acc.editorial, health)
		}

		if hasIssueCategory(health.Issues, "probe_failed") {
			acc.probeFailures++
		}
		if hasIssueCategory(health.Issues, "metadata_fetch_failed") {
			acc.metadataFailures++
		}
		if hasIssueCategory(health.Issues, "metadata_disabled", "metadata_resolver_none") {
			acc.metadataBlocked++
		}
		if hasIssueCategory(health.Issues, "stale_probe", "stale_metadata") {
			acc.staleChecks++
		}
		if hasIssueCategory(health.Issues, "low_reliability") {
			acc.lowReliability++
		}
		if hasEditorialIssue {
			acc.editorialGaps++
		}
	}

	sortAdminOverviewStations(acc.operations)
	sortAdminOverviewStations(acc.metadata)
	sortAdminOverviewStations(acc.editorial)

	response := adminOverviewResponse{
		Summary: adminOverviewSummary{
			ApprovedStations:      acc.approvedStations,
			FeaturedStations:      acc.featuredStations,
			StationsNeedingAction: acc.stationsNeedingAction,
			HealthyStations:       acc.healthyStations,
			ActiveStreams:         acc.activeStreams,
		},
		Metrics: []adminOverviewMetric{
			{ID: "probe_failures", Label: "Probe failures", Value: acc.probeFailures, Severity: "critical", Description: "Approved stations with stream probe errors or no healthy stream."},
			{ID: "metadata_failures", Label: "Metadata failures", Value: acc.metadataFailures, Severity: "critical", Description: "Approved stations with stored metadata fetch errors."},
			{ID: "metadata_blocked", Label: "Metadata blocked", Value: acc.metadataBlocked, Severity: "warning", Description: "Approved stations with metadata disabled or resolver set to none."},
			{ID: "stale_checks", Label: "Stale checks", Value: acc.staleChecks, Severity: "warning", Description: "Approved stations whose probe or metadata routing checks are outdated or missing."},
			{ID: "low_reliability", Label: "Low reliability", Value: acc.lowReliability, Severity: "warning", Description: "Approved stations whose best active stream reliability is still below the healthy threshold."},
			{ID: "editorial_gaps", Label: "Editorial gaps", Value: acc.editorialGaps, Severity: "notice", Description: "Approved stations missing artwork or overview copy."},
		},
		Sections: orderAdminOverviewSections([]adminOverviewSection{
			{ID: "operations", Title: "Stream health", Description: "Stations with probe failures, unhealthy streams, or stale operational checks.", Severity: "critical", Count: len(acc.operations), Stations: limitAdminOverviewStations(acc.operations)},
			{ID: "metadata", Title: "Metadata health", Description: "Stations with metadata failures, disabled metadata, resolver gaps, or stale metadata checks.", Severity: "warning", Count: len(acc.metadata), Stations: limitAdminOverviewStations(acc.metadata)},
			{ID: "editorial", Title: "Editorial gaps", Description: "Approved stations that are live in the catalog but still missing key presentation details.", Severity: "notice", Count: len(acc.editorial), Stations: limitAdminOverviewStations(acc.editorial)},
		}),
		GeneratedAt: now.Format(time.RFC3339),
	}

	c.JSON(http.StatusOK, response)
}

func buildAdminOverviewStationHealth(
	station *store.Station,
	streams []*store.StationStream,
	nowPlayingMap map[string]*store.StreamNowPlaying,
	now time.Time,
) adminOverviewStationHealth {
	health := adminOverviewStationHealth{
		ID:               station.ID,
		Name:             station.Name,
		Logo:             station.Logo,
		Country:          station.Country,
		City:             station.City,
		Featured:         station.Featured,
		ReliabilityScore: station.ReliabilityScore,
		Issues:           make([]adminOverviewIssue, 0),
	}

	if strings.TrimSpace(station.Logo) == "" {
		health.Issues = append(health.Issues, adminOverviewIssue{Code: "missing_logo", Label: "Missing artwork", Detail: "Add station artwork so approved catalog entries feel complete.", Severity: "notice"})
	}
	if station.Overview == nil || strings.TrimSpace(*station.Overview) == "" {
		health.Issues = append(health.Issues, adminOverviewIssue{Code: "missing_overview", Label: "Missing overview", Detail: "Add editorial summary copy for the station detail page.", Severity: "notice"})
	}

	if len(streams) == 0 {
		health.Issues = append(health.Issues, adminOverviewIssue{Code: "missing_stream_variants", Label: "No managed streams", Detail: "This approved station has no station_streams row to probe or maintain.", Severity: "critical"})
		return health
	}

	activeStreams := 0
	healthyActiveStreams := 0
	hasProbeFailure := false
	hasMetadataFailure := false
	hasMetadataBlocked := false
	hasStaleProbe := false
	hasStaleMetadata := false

	for _, stream := range streams {
		if !stream.IsActive {
			continue
		}
		activeStreams++

		if stream.HealthScore >= 0.5 {
			healthyActiveStreams++
		}

		if stream.LastError != nil && strings.TrimSpace(*stream.LastError) != "" {
			hasProbeFailure = true
		}
		if stream.LastCheckedAt == nil || now.Sub(stream.LastCheckedAt.UTC()) > adminOverviewProbeStaleAfter {
			hasStaleProbe = true
		}

		if stream.MetadataEnabled {
			if strings.EqualFold(strings.TrimSpace(stream.MetadataResolver), "none") {
				hasMetadataBlocked = true
			}
			if stream.MetadataResolverCheckedAt == nil || now.Sub(stream.MetadataResolverCheckedAt.UTC()) > adminOverviewMetadataStaleAfter {
				hasStaleMetadata = true
			}
			if snapshot := nowPlayingMap[stream.ID]; snapshot != nil {
				if (snapshot.Error != nil && strings.TrimSpace(*snapshot.Error) != "") || (snapshot.ErrorCode != nil && strings.TrimSpace(*snapshot.ErrorCode) != "") {
					hasMetadataFailure = true
				}
			}
		} else {
			hasMetadataBlocked = true
		}
	}

	health.ActiveStreams = activeStreams

	if activeStreams == 0 {
		health.Issues = append(health.Issues, adminOverviewIssue{Code: "no_active_stream", Label: "No active stream", Detail: "All configured streams are inactive for this approved station.", Severity: "critical"})
	}
	if activeStreams > 0 && healthyActiveStreams == 0 {
		health.Issues = append(health.Issues, adminOverviewIssue{Code: "no_healthy_stream", Label: "No healthy stream", Detail: "None of the active streams currently look healthy enough for a reliable approved station.", Severity: "critical"})
	}
	if hasProbeFailure {
		health.Issues = append(health.Issues, adminOverviewIssue{Code: "probe_failed", Label: "Probe failed", Detail: "One or more active streams have a recent probe error.", Severity: "critical"})
	}
	if hasMetadataFailure {
		health.Issues = append(health.Issues, adminOverviewIssue{Code: "metadata_fetch_failed", Label: "Metadata failing", Detail: "A stored now-playing snapshot still carries a metadata error state.", Severity: "critical"})
	}
	if hasMetadataBlocked {
		health.Issues = append(health.Issues, adminOverviewIssue{Code: "metadata_blocked", Label: "Metadata blocked", Detail: "At least one active stream has metadata disabled or no usable resolver.", Severity: "warning"})
		if anyStreamHasMetadataDisabled(streams) {
			health.Issues = append(health.Issues, adminOverviewIssue{Code: "metadata_disabled", Label: "Metadata disabled", Detail: "Metadata is turned off on at least one active stream.", Severity: "warning"})
		}
		if anyStreamHasResolverNone(streams) {
			health.Issues = append(health.Issues, adminOverviewIssue{Code: "metadata_resolver_none", Label: "Resolver unavailable", Detail: "At least one active stream currently resolves metadata to none.", Severity: "warning"})
		}
	}
	if hasStaleProbe {
		health.Issues = append(health.Issues, adminOverviewIssue{Code: "stale_probe", Label: "Probe stale", Detail: "Operational probing has not run recently enough to trust the current stream health.", Severity: "warning"})
	}
	if hasStaleMetadata {
		health.Issues = append(health.Issues, adminOverviewIssue{Code: "stale_metadata", Label: "Metadata check stale", Detail: "Metadata routing has not been checked recently enough for this approved station.", Severity: "warning"})
	}
	if station.ReliabilityScore < 0.5 {
		health.Issues = append(health.Issues, adminOverviewIssue{Code: "low_reliability", Label: "Low reliability", Detail: "The best active stream still scores below the healthy reliability threshold.", Severity: "warning"})
	}

	return health
}

func anyStreamHasMetadataDisabled(streams []*store.StationStream) bool {
	for _, stream := range streams {
		if stream.IsActive && !stream.MetadataEnabled {
			return true
		}
	}
	return false
}

func anyStreamHasResolverNone(streams []*store.StationStream) bool {
	for _, stream := range streams {
		if stream.IsActive && strings.EqualFold(strings.TrimSpace(stream.MetadataResolver), "none") {
			return true
		}
	}
	return false
}

func hasIssueCategory(issues []adminOverviewIssue, codes ...string) bool {
	if len(issues) == 0 || len(codes) == 0 {
		return false
	}
	allowed := make(map[string]struct{}, len(codes))
	for _, code := range codes {
		allowed[code] = struct{}{}
	}
	for _, issue := range issues {
		if _, ok := allowed[issue.Code]; ok {
			return true
		}
	}
	return false
}

func limitAdminOverviewStations(stations []adminOverviewStationHealth) []adminOverviewStationHealth {
	if len(stations) <= adminOverviewSectionLimit {
		return stations
	}
	return stations[:adminOverviewSectionLimit]
}

func sortAdminOverviewStations(stations []adminOverviewStationHealth) {
	sort.SliceStable(stations, func(i, j int) bool {
		left := adminOverviewPriorityScore(stations[i])
		right := adminOverviewPriorityScore(stations[j])
		if left != right {
			return left > right
		}
		if stations[i].ReliabilityScore != stations[j].ReliabilityScore {
			return stations[i].ReliabilityScore < stations[j].ReliabilityScore
		}
		return strings.ToLower(stations[i].Name) < strings.ToLower(stations[j].Name)
	})
}

func adminOverviewPriorityScore(station adminOverviewStationHealth) int {
	score := 0
	for _, issue := range station.Issues {
		score += adminOverviewIssueWeight(issue.Severity)
	}
	if station.ActiveStreams == 0 {
		score += 3
	}
	if station.ReliabilityScore < 0.5 {
		score += 1
	}
	return score
}

func adminOverviewIssueWeight(severity string) int {
	switch severity {
	case "critical":
		return 5
	case "warning":
		return 3
	default:
		return 1
	}
}

func orderAdminOverviewSections(sections []adminOverviewSection) []adminOverviewSection {
	sort.SliceStable(sections, func(i, j int) bool {
		return adminOverviewIssueWeight(sections[i].Severity) > adminOverviewIssueWeight(sections[j].Severity)
	})
	return sections
}
