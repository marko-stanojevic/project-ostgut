package handler

import (
	"context"
	"fmt"
	"net/http"
	"runtime"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/radio"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

const (
	adminMetadataSnapshotFreshAfter = 5 * time.Minute
	adminJobStationSync             = "station-sync"
	adminJobStreamReprobe           = "stream-reprobe"
)

type adminDiagnosticResponse struct {
	Title        string                   `json:"title"`
	Description  string                   `json:"description"`
	StatusChecks []adminSystemStatusCheck `json:"status_checks"`
	Sections     []adminDiagnosticSection `json:"sections"`
	GeneratedAt  string                   `json:"generated_at"`
}

type adminDiagnosticSection struct {
	ID          string                `json:"id"`
	Title       string                `json:"title"`
	Description string                `json:"description"`
	Items       []adminDiagnosticItem `json:"items"`
}

type adminDiagnosticItem struct {
	ID     string `json:"id"`
	Label  string `json:"label"`
	Value  string `json:"value"`
	Tone   string `json:"tone"`
	Detail string `json:"detail"`
}

type adminJobTriggerResponse struct {
	JobID       string `json:"job_id"`
	Status      string `json:"status"`
	Message     string `json:"message"`
	TriggeredAt string `json:"triggered_at"`
}

// AdminAPIDiagnostics handles GET /admin/diagnostics/api.
func (h *Handler) AdminAPIDiagnostics(c *gin.Context) {
	now := time.Now().UTC()
	var memory runtime.MemStats
	runtime.ReadMemStats(&memory)

	response := adminDiagnosticResponse{
		Title:       "API diagnostics",
		Description: "Runtime process health, request-surface configuration, and instrumentation state.",
		StatusChecks: []adminSystemStatusCheck{
			{ID: "api", Label: "API", Status: "operational", Detail: "Admin API is responding.", CheckedAt: now.Format(time.RFC3339)},
		},
		Sections: []adminDiagnosticSection{
			{
				ID:          "runtime",
				Title:       "Runtime",
				Description: "Live Go process counters from this API instance.",
				Items: []adminDiagnosticItem{
					adminDiagnosticItemValue("uptime", "Uptime", formatAdminSystemDuration(now.Sub(h.startedAt)), "neutral", "Time since this handler instance was constructed."),
					adminDiagnosticItemValue("goroutines", "Goroutines", formatInt(int64(runtime.NumGoroutine())), "neutral", "Currently active goroutines in this API process."),
					adminDiagnosticItemValue("heap_alloc", "Heap allocated", formatBytesInt(memory.HeapAlloc), "neutral", "Bytes allocated on the Go heap."),
					adminDiagnosticItemValue("heap_in_use", "Heap in use", formatBytesInt(memory.HeapInuse), "neutral", "Heap spans currently in use."),
					adminDiagnosticItemValue("system_memory", "System memory", formatBytesInt(memory.Sys), "neutral", "Total memory obtained from the OS by the Go runtime."),
					adminDiagnosticItemValue("gc_cycles", "GC cycles", formatInt(int64(memory.NumGC)), "neutral", "Completed garbage collection cycles."),
				},
			},
			{
				ID:          "request_surface",
				Title:       "Request surface",
				Description: "Admin-relevant API configuration currently active in this process.",
				Items: []adminDiagnosticItem{
					adminDiagnosticItemValue("public_api_base", "Public API base", displayConfiguredValue(h.publicAPIBaseURL), adminToneForEmptyString(h.publicAPIBaseURL), "Canonical API base URL used in public responses."),
					adminDiagnosticItemValue("query_allowlist", "Public query allowlist", formatBool(h.enforcePublicQueryAllowlist), "neutral", "Whether public station/search endpoints reject unknown query parameters."),
					adminDiagnosticItemValue("metadata_probe_origins", "Browser probe origins", formatInt(int64(len(h.admin.browserProbeOrigins))), "neutral", "Configured origins used when testing browser-readable metadata support."),
				},
			},
		},
		GeneratedAt: now.Format(time.RFC3339),
	}

	c.JSON(http.StatusOK, response)
}

// AdminDatabaseDiagnostics handles GET /admin/diagnostics/database.
func (h *Handler) AdminDatabaseDiagnostics(c *gin.Context) {
	now := time.Now().UTC()
	diagnostics, err := h.admin.diagnostics.Database(c.Request.Context())
	if err != nil {
		h.log.Error("admin database diagnostics", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	poolPressure := "neutral"
	if diagnostics.MaxConnections > 0 && diagnostics.AcquiredConnections >= diagnostics.MaxConnections {
		poolPressure = "attention"
	}

	migrationTone := "neutral"
	migrationDetail := "Migrations are clean."
	if diagnostics.MigrationDirty {
		migrationTone = "attention"
		migrationDetail = "The migration table is dirty and needs manual inspection."
	}

	response := adminDiagnosticResponse{
		Title:       "Database diagnostics",
		Description: "PostgreSQL reachability, migration state, and connection-pool pressure.",
		StatusChecks: []adminSystemStatusCheck{
			{ID: "database", Label: "Database", Status: "operational", Detail: fmt.Sprintf("Ping completed in %s.", diagnostics.PingDuration.Round(time.Millisecond)), CheckedAt: now.Format(time.RFC3339)},
		},
		Sections: []adminDiagnosticSection{
			{
				ID:          "connection",
				Title:       "Connection",
				Description: "Current database identity and server process state.",
				Items: []adminDiagnosticItem{
					adminDiagnosticItemValue("database", "Database", diagnostics.DatabaseName, "neutral", "Connected database name."),
					adminDiagnosticItemValue("user", "Database user", diagnostics.DatabaseUser, "neutral", "Database role used by the API."),
					adminDiagnosticItemValue("server_started", "Server started", diagnostics.ServerStartedAt.Format(time.RFC3339), "neutral", "PostgreSQL postmaster start time."),
					adminDiagnosticItemValue("server_uptime", "Server uptime", formatAdminSystemDuration(now.Sub(diagnostics.ServerStartedAt.UTC())), "neutral", "How long the PostgreSQL server has been running."),
					adminDiagnosticItemValue("server_version", "Server version", summarizePostgresVersion(diagnostics.ServerVersion), "neutral", "PostgreSQL server version string."),
				},
			},
			{
				ID:          "pool",
				Title:       "Connection pool",
				Description: "Live pgxpool counters from this API instance.",
				Items: []adminDiagnosticItem{
					adminDiagnosticItemValue("acquired", "Acquired", formatInt(int64(diagnostics.AcquiredConnections)), poolPressure, "Connections currently checked out."),
					adminDiagnosticItemValue("idle", "Idle", formatInt(int64(diagnostics.IdleConnections)), "neutral", "Open idle connections available for reuse."),
					adminDiagnosticItemValue("total", "Total", formatInt(int64(diagnostics.TotalConnections)), "neutral", "Total open connections in the pool."),
					adminDiagnosticItemValue("max", "Max", formatInt(int64(diagnostics.MaxConnections)), "neutral", "Configured maximum pool size."),
					adminDiagnosticItemValue("constructing", "Constructing", formatInt(int64(diagnostics.ConstructingConns)), "neutral", "Connections currently being established."),
					adminDiagnosticItemValue("acquires", "Acquire count", formatInt(diagnostics.AcquireCount), "neutral", "Total successful pool acquisitions since process start."),
					adminDiagnosticItemValue("empty_acquires", "Empty acquires", formatInt(diagnostics.EmptyAcquire), adminToneForPositive64(diagnostics.EmptyAcquire), "Times callers had to wait because the pool had no immediately available connection."),
					adminDiagnosticItemValue("canceled_acquires", "Canceled acquires", formatInt(diagnostics.CanceledAcquire), adminToneForPositive64(diagnostics.CanceledAcquire), "Acquire attempts canceled before receiving a connection."),
					adminDiagnosticItemValue("acquire_wait", "Acquire wait", diagnostics.AcquireDuration.Round(time.Millisecond).String(), "neutral", "Total cumulative wait time for connection acquisition."),
				},
			},
			{
				ID:          "migrations",
				Title:       "Migrations",
				Description: "Schema migration state recorded by golang-migrate.",
				Items: []adminDiagnosticItem{
					adminDiagnosticItemValue("version", "Version", formatInt(int64(diagnostics.MigrationVersion)), migrationTone, migrationDetail),
					adminDiagnosticItemValue("dirty", "Dirty", formatBool(diagnostics.MigrationDirty), migrationTone, "Dirty migrations must be resolved before further schema changes."),
				},
			},
		},
		GeneratedAt: now.Format(time.RFC3339),
	}

	c.JSON(http.StatusOK, response)
}

// AdminJobsDiagnostics handles GET /admin/diagnostics/jobs.
func (h *Handler) AdminJobsDiagnostics(c *gin.Context) {
	ctx := c.Request.Context()
	now := time.Now().UTC()

	stations, err := h.admin.stations.AdminSummary(ctx)
	if err != nil {
		h.log.Error("admin jobs station summary", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	streams, err := h.admin.streams.AdminJobSummary(ctx, adminOverviewMetadataStaleAfter)
	if err != nil {
		h.log.Error("admin jobs stream summary", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	nowPlaying, err := h.admin.nowPlaying.AdminSummary(ctx, adminMetadataSnapshotFreshAfter)
	if err != nil {
		h.log.Error("admin jobs now playing summary", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	response := adminDiagnosticResponse{
		Title:       "Jobs diagnostics",
		Description: "Background worker cadence and freshness inferred from approved, listener-facing data they maintain.",
		StatusChecks: []adminSystemStatusCheck{
			stationSyncStatusCheck(stations.LastSyncedAt, now),
			streamProbeStatusCheck(streams, now),
			metadataStatusCheck(streams, now),
		},
		Sections: []adminDiagnosticSection{
			{
				ID:          "station_sync",
				Title:       "Station sync",
				Description: "Radio Browser ingestion runs on a fixed cadence and keeps imported stations pending by default.",
				Items: []adminDiagnosticItem{
					adminDiagnosticItemValue("cadence", "Cadence", radio.SyncInterval.String(), "neutral", "Expected station sync interval."),
					adminDiagnosticItemValue("last_success", "Last success", formatOptionalTime(stations.LastSyncedAt), adminToneForNilTime(stations.LastSyncedAt), "Latest station last_synced_at observed in the catalog."),
					adminDiagnosticItemValue("pending", "Pending stations", formatInt(int64(stations.Pending)), adminToneForPositive(stations.Pending), "Stations waiting for editorial review."),
					adminDiagnosticItemValue("changed_7d", "Changed in 7d", formatInt(int64(stations.ChangedLast7Days)), "neutral", "Active station rows updated in the last 7 days."),
				},
			},
			{
				ID:          "stream_probe",
				Title:       "Stream re-probe",
				Description: "The stream prober refreshes resolved URLs, format hints, health score, and metadata resolver routing for approved stations only.",
				Items: []adminDiagnosticItem{
					adminDiagnosticItemValue("cadence", "Cadence", radio.ReprobeInterval.String(), "neutral", "Expected stream re-probe interval."),
					adminDiagnosticItemValue("active_streams", "Approved active streams", formatInt(int64(streams.ActiveStreams)), "neutral", "Active station_streams rows on approved stations eligible for recurring probing."),
					adminDiagnosticItemValue("checked_streams", "Checked streams", formatInt(int64(streams.ProbeCheckedStreams)), "neutral", "Approved active streams with at least one probe timestamp."),
					adminDiagnosticItemValue("due_streams", "Due streams", formatInt(int64(streams.ProbeDueStreams)), adminToneForPositive(streams.ProbeDueStreams), "Approved active streams whose next scheduled probe time has arrived."),
					adminDiagnosticItemValue("latest_probe", "Latest probe", formatOptionalTime(streams.LastProbeCheckedAt), adminToneForNilTime(streams.LastProbeCheckedAt), "Most recent stream probe timestamp."),
					adminDiagnosticItemValue("oldest_probe", "Oldest probe", formatOptionalTime(streams.OldestProbeCheckedAt), adminToneForNilTime(streams.OldestProbeCheckedAt), "Oldest non-empty probe timestamp among approved active streams."),
				},
			},
			{
				ID:          "metadata",
				Title:       "Metadata polling",
				Description: "Server metadata polling is subscriber-driven; resolver maintenance follows approved active streams while snapshot freshness reflects recent listening activity and cache warming.",
				Items: []adminDiagnosticItem{
					adminDiagnosticItemValue("active_pollers", "Active pollers", formatInt(int64(h.station.metaPoller.ActiveStreamCount())), "neutral", "Streams currently held open by server-side metadata subscribers."),
					adminDiagnosticItemValue("metadata_enabled", "Metadata-enabled streams", formatInt(int64(streams.MetadataEnabledStreams)), "neutral", "Approved active streams configured for metadata."),
					adminDiagnosticItemValue("resolver_checked", "Resolver checked", formatInt(int64(streams.MetadataResolverChecked)), "neutral", "Approved metadata-enabled streams with resolver check evidence."),
					adminDiagnosticItemValue("resolver_stale", "Resolver stale", formatInt(int64(streams.MetadataResolverStale)), adminToneForPositive(streams.MetadataResolverStale), "Approved metadata-enabled streams without a recent resolver check."),
					adminDiagnosticItemValue("latest_resolver", "Latest resolver check", formatOptionalTime(streams.LastMetadataResolverCheckAt), adminToneForNilTime(streams.LastMetadataResolverCheckAt), "Most recent metadata resolver check timestamp."),
					adminDiagnosticItemValue("snapshots", "Snapshots", formatInt(int64(nowPlaying.Snapshots)), "neutral", "Rows in stream_now_playing."),
					adminDiagnosticItemValue("fresh_snapshots", "Fresh snapshots", formatInt(int64(nowPlaying.FreshSnapshots)), "neutral", "Snapshots fetched within the freshness window."),
					adminDiagnosticItemValue("errored_snapshots", "Errored snapshots", formatInt(int64(nowPlaying.ErroredSnapshots)), adminToneForPositive(nowPlaying.ErroredSnapshots), "Snapshots currently carrying a metadata error or error code."),
					adminDiagnosticItemValue("latest_snapshot", "Latest snapshot", formatOptionalTime(nowPlaying.LatestFetchedAt), "neutral", "Most recent now-playing fetch timestamp."),
				},
			},
		},
		GeneratedAt: now.Format(time.RFC3339),
	}

	c.JSON(http.StatusOK, response)
}

// AdminTriggerJob handles POST /admin/jobs/:jobID/trigger.
func (h *Handler) AdminTriggerJob(c *gin.Context) {
	jobID := strings.TrimSpace(c.Param("jobID"))
	triggeredAt := time.Now().UTC().Format(time.RFC3339)
	ctx := context.WithoutCancel(c.Request.Context())

	var started bool
	var message string
	switch jobID {
	case adminJobStationSync:
		if h.admin.stationSyncer == nil {
			h.log.Error("admin trigger job: station syncer not configured")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}
		started = h.admin.stationSyncer.Trigger(ctx)
		message = "Station sync started. Newly imported stations remain pending until editorial approval."
	case adminJobStreamReprobe:
		if h.admin.streamProber == nil {
			h.log.Error("admin trigger job: stream prober not configured")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}
		started = h.admin.streamProber.Trigger(ctx)
		message = "Stream re-probe started. Resolver and health evidence will update as streams complete."
	default:
		c.JSON(http.StatusNotFound, gin.H{"error": "unknown job"})
		return
	}

	status := "started"
	statusCode := http.StatusAccepted
	if !started {
		status = "already_running"
		statusCode = http.StatusOK
		message = "That job is already running."
	}

	c.JSON(statusCode, adminJobTriggerResponse{
		JobID:       jobID,
		Status:      status,
		Message:     message,
		TriggeredAt: triggeredAt,
	})
}

func stationSyncStatusCheck(lastSyncedAt *time.Time, now time.Time) adminSystemStatusCheck {
	checkedAt := now.Format(time.RFC3339)
	if lastSyncedAt == nil {
		return adminSystemStatusCheck{ID: "station_sync", Label: "Station sync", Status: "attention", Detail: "No station sync has been recorded yet.", CheckedAt: checkedAt}
	}

	age := now.Sub(lastSyncedAt.UTC())
	if age > adminSystemSyncStaleAfter {
		return adminSystemStatusCheck{ID: "station_sync", Label: "Station sync", Status: "attention", Detail: fmt.Sprintf("Last successful station sync was %s ago.", formatAdminSystemDuration(age)), CheckedAt: checkedAt}
	}

	return adminSystemStatusCheck{ID: "station_sync", Label: "Station sync", Status: "operational", Detail: fmt.Sprintf("Last successful station sync was %s ago.", formatAdminSystemDuration(age)), CheckedAt: checkedAt}
}

func streamProbeStatusCheck(summary *store.StationStreamJobSummary, now time.Time) adminSystemStatusCheck {
	if summary.ProbeDueStreams > 0 {
		return adminSystemStatusCheck{ID: "stream_probe", Label: "Stream probe", Status: "attention", Detail: fmt.Sprintf("%d approved active streams are due for probing.", summary.ProbeDueStreams), CheckedAt: now.Format(time.RFC3339)}
	}
	if summary.LastProbeCheckedAt == nil {
		return adminSystemStatusCheck{ID: "stream_probe", Label: "Stream probe", Status: "attention", Detail: "No stream probe timestamp has been recorded yet.", CheckedAt: now.Format(time.RFC3339)}
	}
	return adminSystemStatusCheck{ID: "stream_probe", Label: "Stream probe", Status: "operational", Detail: fmt.Sprintf("Latest probe was %s ago.", formatAdminSystemDuration(now.Sub(summary.LastProbeCheckedAt.UTC()))), CheckedAt: now.Format(time.RFC3339)}
}

func metadataStatusCheck(summary *store.StationStreamJobSummary, now time.Time) adminSystemStatusCheck {
	if summary.MetadataResolverStale > 0 {
		return adminSystemStatusCheck{ID: "metadata", Label: "Metadata", Status: "attention", Detail: fmt.Sprintf("%d metadata-enabled streams need a resolver check.", summary.MetadataResolverStale), CheckedAt: now.Format(time.RFC3339)}
	}
	if summary.MetadataEnabledStreams > 0 && summary.LastMetadataResolverCheckAt == nil {
		return adminSystemStatusCheck{ID: "metadata", Label: "Metadata", Status: "attention", Detail: "No metadata resolver check has been recorded yet.", CheckedAt: now.Format(time.RFC3339)}
	}
	return adminSystemStatusCheck{ID: "metadata", Label: "Metadata", Status: "operational", Detail: "Metadata resolver checks are current.", CheckedAt: now.Format(time.RFC3339)}
}

func adminDiagnosticItemValue(id, label, value, tone, detail string) adminDiagnosticItem {
	return adminDiagnosticItem{ID: id, Label: label, Value: value, Tone: tone, Detail: detail}
}

func adminToneForPositive64(value int64) string {
	if value > 0 {
		return "attention"
	}
	return "neutral"
}

func adminToneForNilTime(value *time.Time) string {
	if value == nil {
		return "attention"
	}
	return "neutral"
}

func adminToneForEmptyString(value string) string {
	if strings.TrimSpace(value) == "" {
		return "attention"
	}
	return "neutral"
}

func formatOptionalTime(value *time.Time) string {
	if value == nil {
		return "Not recorded"
	}
	return value.UTC().Format(time.RFC3339)
}

func formatBool(value bool) string {
	if value {
		return "Yes"
	}
	return "No"
}

func formatInt(value int64) string {
	return fmt.Sprintf("%d", value)
}

func formatBytesInt(value uint64) string {
	const unit = 1024
	if value < unit {
		return fmt.Sprintf("%d B", value)
	}
	divisor := uint64(unit)
	exponent := 0
	for next := value / unit; next >= unit; next /= unit {
		divisor *= unit
		exponent++
	}
	return fmt.Sprintf("%.1f %ciB", float64(value)/float64(divisor), "KMGTPE"[exponent])
}

func displayConfiguredValue(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "Not configured"
	}
	return trimmed
}

func summarizePostgresVersion(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "Unknown"
	}
	if index := strings.Index(trimmed, " on "); index > 0 {
		return trimmed[:index]
	}
	return trimmed
}
