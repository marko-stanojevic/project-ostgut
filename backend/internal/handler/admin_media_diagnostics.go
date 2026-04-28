package handler

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// AdminMediaDiagnostics handles GET /admin/diagnostics/media.
// It surfaces media asset pipeline counts, per-kind storage breakdowns, and
// content-integrity coverage so admins can verify processing health at a glance.
func (h *Handler) AdminMediaDiagnostics(c *gin.Context) {
	now := time.Now().UTC()
	summary, err := h.admin.media.AdminDetailedSummary(c.Request.Context())
	if err != nil {
		h.log.Error("admin media diagnostics", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	processed := summary.Ready + summary.Rejected

	pipelineStatus := "operational"
	pipelineDetail := fmt.Sprintf("%d of %d assets ready.", summary.Ready, summary.Total)
	if summary.Pending > 0 {
		pipelineStatus = "attention"
		pipelineDetail = fmt.Sprintf("%d asset(s) pending processing.", summary.Pending)
	} else if summary.Total == 0 {
		pipelineDetail = "No media assets recorded yet."
	}

	rejectionStatus := "operational"
	rejectionDetail := "Rejection rate is within acceptable range."
	if processed > 0 {
		rate := float64(summary.Rejected) / float64(processed) * 100
		rejectionDetail = fmt.Sprintf("%.1f%% of processed assets rejected.", rate)
		if rate >= 5.0 {
			rejectionStatus = "attention"
		}
	} else {
		rejectionDetail = "No assets processed yet."
	}

	storageDetail := "No stored media yet."
	if summary.TotalBytes > 0 {
		storageDetail = fmt.Sprintf("Tracking %s of processed media.", formatMediaBytes(summary.TotalBytes))
	}

	successRate := "—"
	rejectionRate := "0%"
	if processed > 0 {
		successRate = fmt.Sprintf("%.1f%%", float64(summary.Ready)/float64(processed)*100)
		rejectionRate = fmt.Sprintf("%.1f%%", float64(summary.Rejected)/float64(processed)*100)
	}

	hashCoverageDetail := "No ready assets to verify."
	if summary.Ready > 0 {
		hashCoverageDetail = fmt.Sprintf("%d of %d ready assets have a verified content hash.", summary.HashCovered, summary.Ready)
	}

	rejectionRateTone := adminToneForPositive(summary.Rejected)
	if processed > 0 && float64(summary.Rejected)/float64(processed)*100 >= 5.0 {
		rejectionRateTone = "attention"
	}

	response := adminDiagnosticResponse{
		Title:       "Media & storage diagnostics",
		Description: "Asset processing pipeline health, per-kind storage breakdown, and content-integrity coverage.",
		StatusChecks: []adminSystemStatusCheck{
			{
				ID:        "asset_pipeline",
				Label:     "Asset pipeline",
				Status:    pipelineStatus,
				Detail:    pipelineDetail,
				CheckedAt: now.Format(time.RFC3339),
			},
			{
				ID:        "rejection_quality",
				Label:     "Rejection quality",
				Status:    rejectionStatus,
				Detail:    rejectionDetail,
				CheckedAt: now.Format(time.RFC3339),
			},
			{
				ID:        "storage_tracking",
				Label:     "Storage tracking",
				Status:    "operational",
				Detail:    storageDetail,
				CheckedAt: now.Format(time.RFC3339),
			},
		},
		Sections: []adminDiagnosticSection{
			{
				ID:          "pipeline",
				Title:       "Asset pipeline",
				Description: "Processing status counts and success rate across all media assets.",
				Items: []adminDiagnosticItem{
					adminDiagnosticItemValue("total", "Total assets", formatInt(int64(summary.Total)), "neutral", "All media asset rows."),
					adminDiagnosticItemValue("ready", "Ready", formatInt(int64(summary.Ready)), "neutral", "Successfully processed and available."),
					adminDiagnosticItemValue("pending", "Pending", formatInt(int64(summary.Pending)), adminToneForPositive(summary.Pending), "Awaiting upload completion or processing."),
					adminDiagnosticItemValue("rejected", "Rejected", formatInt(int64(summary.Rejected)), adminToneForPositive(summary.Rejected), "Failed validation or processing."),
					adminDiagnosticItemValue("success_rate", "Success rate", successRate, "neutral", "Ratio of ready to total processed (ready + rejected) assets."),
					adminDiagnosticItemValue("rejection_rate", "Rejection rate", rejectionRate, rejectionRateTone, "Ratio of rejected to total processed assets. Above 5% warrants investigation."),
					adminDiagnosticItemValue("latest_upload", "Latest upload", formatOptionalTime(summary.LatestCreatedAt), "neutral", "Most recently created asset record."),
					adminDiagnosticItemValue("latest_processed", "Latest processed", formatOptionalTime(summary.LatestReadyAt), "neutral", "Most recently transitioned-to-ready asset."),
				},
			},
			{
				ID:          "by_kind",
				Title:       "By kind",
				Description: "Asset counts and ready storage footprint broken down by asset kind.",
				Items: []adminDiagnosticItem{
					adminDiagnosticItemValue("avatar_count", "Avatar assets", formatInt(int64(summary.AvatarTotal)), "neutral", "User profile images across all statuses."),
					adminDiagnosticItemValue("avatar_storage", "Avatar storage", formatMediaBytes(summary.AvatarBytes), "neutral", "Bytes used by ready avatar assets."),
					adminDiagnosticItemValue("station_icon_count", "Station icon assets", formatInt(int64(summary.StationIconTotal)), "neutral", "Station artwork images across all statuses."),
					adminDiagnosticItemValue("station_icon_storage", "Station icon storage", formatMediaBytes(summary.StationIconBytes), "neutral", "Bytes used by ready station icon assets."),
				},
			},
			{
				ID:          "storage",
				Title:       "Storage footprint",
				Description: "Aggregate storage metrics for ready assets and content-integrity coverage.",
				Items: []adminDiagnosticItem{
					adminDiagnosticItemValue("total_stored", "Total stored", formatMediaBytes(summary.TotalBytes), "neutral", "Combined byte size of all ready assets."),
					adminDiagnosticItemValue("avg_size", "Average asset size", formatMediaBytes(summary.AvgReadyBytes), "neutral", "Mean byte size across ready assets."),
					adminDiagnosticItemValue("hash_coverage", "Content hash coverage", hashCoverageDetail, "neutral", "Ready assets with a verified SHA-256 content hash."),
				},
			},
		},
		GeneratedAt: now.Format(time.RFC3339),
	}

	c.JSON(http.StatusOK, response)
}

func formatMediaBytes(value int64) string {
	if value <= 0 {
		return "0 B"
	}
	return formatBytesInt(uint64(value))
}
