package handler

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

const adminSystemSyncStaleAfter = 12 * time.Hour

type adminSystemOverviewResponse struct {
	StatusChecks []adminSystemStatusCheck `json:"status_checks"`
	MetricGroups []adminSystemMetricGroup `json:"metric_groups"`
	GeneratedAt  string                   `json:"generated_at"`
}

type adminSystemStatusCheck struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	Status    string `json:"status"`
	Detail    string `json:"detail"`
	CheckedAt string `json:"checked_at"`
	Running   bool   `json:"running"`
}

type adminSystemMetricGroup struct {
	ID          string                      `json:"id"`
	Title       string                      `json:"title"`
	Description string                      `json:"description"`
	Metrics     []adminSystemOverviewMetric `json:"metrics"`
}

type adminSystemOverviewMetric struct {
	ID     string `json:"id"`
	Label  string `json:"label"`
	Value  int64  `json:"value"`
	Tone   string `json:"tone"`
	Detail string `json:"detail"`
	Unit   string `json:"unit,omitempty"`
}

// AdminOverview handles GET /admin/overview.
// It surfaces admin-owned system, access, billing, content pipeline, and media
// metrics. Station-level operational work lives in the editor overview.
func (h *Handler) AdminOverview(c *gin.Context) {
	ctx := c.Request.Context()

	users, err := h.admin.users.AdminSummary(ctx)
	if err != nil {
		h.log.Error("admin overview user summary", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	activeSessions, err := h.admin.refresh.CountActive(ctx)
	if err != nil {
		h.log.Error("admin overview active sessions", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	subscriptions, err := h.admin.subscriptions.AdminSummary(ctx)
	if err != nil {
		h.log.Error("admin overview subscription summary", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	stations, err := h.admin.stations.AdminSummary(ctx)
	if err != nil {
		h.log.Error("admin overview station summary", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	media, err := h.admin.media.AdminSummary(ctx)
	if err != nil {
		h.log.Error("admin overview media summary", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	now := time.Now().UTC()
	response := adminSystemOverviewResponse{
		StatusChecks: buildAdminSystemStatusChecks(stations, now),
		MetricGroups: []adminSystemMetricGroup{
			buildAdminUserAccessMetrics(users, activeSessions),
			buildAdminBillingMetrics(subscriptions),
			buildAdminContentPipelineMetrics(stations),
			buildAdminMediaMetrics(media),
		},
		GeneratedAt: now.Format(time.RFC3339),
	}

	c.JSON(http.StatusOK, response)
}

func buildAdminSystemStatusChecks(stations *store.StationAdminSummary, now time.Time) []adminSystemStatusCheck {
	checkedAt := now.Format(time.RFC3339)
	checks := []adminSystemStatusCheck{
		{ID: "api", Label: "API", Status: "operational", Detail: "Admin API is responding.", CheckedAt: checkedAt},
		{ID: "database", Label: "Database", Status: "operational", Detail: "Overview queries completed successfully.", CheckedAt: checkedAt},
	}

	checks = append(checks, adminSyncStatusCheck(stations.LastSyncedAt, now))
	return checks
}

func adminSyncStatusCheck(lastSyncedAt *time.Time, now time.Time) adminSystemStatusCheck {
	checkedAt := now.Format(time.RFC3339)
	if lastSyncedAt == nil {
		return adminSystemStatusCheck{ID: "catalog_sync", Label: "Catalog sync", Status: "attention", Detail: "No station sync has been recorded yet.", CheckedAt: checkedAt}
	}

	age := now.Sub(lastSyncedAt.UTC())
	if age > adminSystemSyncStaleAfter {
		return adminSystemStatusCheck{ID: "catalog_sync", Label: "Catalog sync", Status: "attention", Detail: fmt.Sprintf("Last successful station sync was %s ago.", formatAdminSystemDuration(age)), CheckedAt: checkedAt}
	}

	return adminSystemStatusCheck{ID: "catalog_sync", Label: "Catalog sync", Status: "operational", Detail: fmt.Sprintf("Last successful station sync was %s ago.", formatAdminSystemDuration(age)), CheckedAt: checkedAt}
}

func buildAdminUserAccessMetrics(users *store.UserAdminSummary, activeSessions int) adminSystemMetricGroup {
	return adminSystemMetricGroup{
		ID:          "users_access",
		Title:       "Users & access",
		Description: "Account volume, privileged roles, and active sessions.",
		Metrics: []adminSystemOverviewMetric{
			{ID: "total_users", Label: "Total users", Value: int64(users.Total), Tone: "neutral", Detail: "Registered accounts."},
			{ID: "new_users_7d", Label: "New users", Value: int64(users.NewLast7Days), Tone: "neutral", Detail: "Accounts created in the last 7 days."},
			{ID: "admins", Label: "Admins", Value: int64(users.Admins), Tone: adminToneForZero(users.Admins), Detail: "Users with full admin access."},
			{ID: "editors", Label: "Editors", Value: int64(users.Editors), Tone: "neutral", Detail: "Users who can manage the station catalog."},
			{ID: "active_sessions", Label: "Active sessions", Value: int64(activeSessions), Tone: "neutral", Detail: "Unrevoked refresh-token sessions."},
			{ID: "saved_player_state", Label: "Saved players", Value: int64(users.WithPlayerStation), Tone: "neutral", Detail: "Users with a persisted last station."},
		},
	}
}

func buildAdminBillingMetrics(summary *store.SubscriptionAdminSummary) adminSystemMetricGroup {
	return adminSystemMetricGroup{
		ID:          "billing",
		Title:       "Billing integrity",
		Description: "Subscription state and entitlement risk.",
		Metrics: []adminSystemOverviewMetric{
			{ID: "active_subscriptions", Label: "Active", Value: int64(summary.Active), Tone: "neutral", Detail: "Subscriptions currently active."},
			{ID: "trialing_subscriptions", Label: "Trialing", Value: int64(summary.Trialing), Tone: "neutral", Detail: "Users in trial state."},
			{ID: "past_due_subscriptions", Label: "Past due", Value: int64(summary.PastDue), Tone: adminToneForPositive(summary.PastDue), Detail: "Subscriptions needing billing attention."},
			{ID: "canceled_subscriptions", Label: "Canceled", Value: int64(summary.Canceled), Tone: "neutral", Detail: "Canceled subscriptions retained for account state."},
			{ID: "paused_subscriptions", Label: "Paused", Value: int64(summary.Paused), Tone: "neutral", Detail: "Paused subscriptions."},
			{ID: "total_subscriptions", Label: "Total records", Value: int64(summary.Total), Tone: "neutral", Detail: "Subscription rows tied to users."},
		},
	}
}

func buildAdminContentPipelineMetrics(summary *store.StationAdminSummary) adminSystemMetricGroup {
	return adminSystemMetricGroup{
		ID:          "content_pipeline",
		Title:       "Content pipeline",
		Description: "Catalog moderation pulse without duplicating editor station health.",
		Metrics: []adminSystemOverviewMetric{
			{ID: "pending_stations", Label: "Pending review", Value: int64(summary.Pending), Tone: adminToneForPositive(summary.Pending), Detail: "Active stations waiting for editorial decision."},
			{ID: "approved_stations", Label: "Approved", Value: int64(summary.Approved), Tone: "neutral", Detail: "Active stations visible to listeners."},
			{ID: "rejected_stations", Label: "Rejected", Value: int64(summary.Rejected), Tone: "neutral", Detail: "Active stations rejected from the catalog."},
			{ID: "changed_stations_7d", Label: "Changed", Value: int64(summary.ChangedLast7Days), Tone: "neutral", Detail: "Active stations updated in the last 7 days."},
			{ID: "total_stations", Label: "Total active", Value: int64(summary.Total), Tone: "neutral", Detail: "All active station records."},
		},
	}
}

func buildAdminMediaMetrics(summary *store.MediaAssetAdminSummary) adminSystemMetricGroup {
	return adminSystemMetricGroup{
		ID:          "media_storage",
		Title:       "Media & storage",
		Description: "Asset processing state and stored media footprint.",
		Metrics: []adminSystemOverviewMetric{
			{ID: "ready_assets", Label: "Ready assets", Value: int64(summary.Ready), Tone: "neutral", Detail: "Processed media assets."},
			{ID: "pending_assets", Label: "Pending assets", Value: int64(summary.Pending), Tone: adminToneForPositive(summary.Pending), Detail: "Assets waiting for processing completion."},
			{ID: "rejected_assets", Label: "Rejected assets", Value: int64(summary.Rejected), Tone: adminToneForPositive(summary.Rejected), Detail: "Assets rejected by validation or processing."},
			{ID: "total_assets", Label: "Total assets", Value: int64(summary.Total), Tone: "neutral", Detail: "All media asset records."},
			{ID: "storage_bytes", Label: "Stored media", Value: summary.Bytes, Tone: "neutral", Detail: "Total processed asset bytes recorded in Postgres.", Unit: "bytes"},
		},
	}
}

func adminToneForPositive(value int) string {
	if value > 0 {
		return "attention"
	}
	return "neutral"
}

func adminToneForZero(value int) string {
	if value == 0 {
		return "attention"
	}
	return "neutral"
}

func formatAdminSystemDuration(duration time.Duration) string {
	if duration < time.Minute {
		return "less than a minute"
	}
	if duration < time.Hour {
		minutes := int(duration.Minutes())
		if minutes == 1 {
			return "1 minute"
		}
		return fmt.Sprintf("%d minutes", minutes)
	}
	if duration < 48*time.Hour {
		hours := int(duration.Hours())
		if hours == 1 {
			return "1 hour"
		}
		return fmt.Sprintf("%d hours", hours)
	}
	days := int(duration.Hours() / 24)
	if days == 1 {
		return "1 day"
	}
	return fmt.Sprintf("%d days", days)
}
