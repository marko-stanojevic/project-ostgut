package handler

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/middleware"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

// GetSubscription returns the current user's subscription details.
func (h *Handler) GetSubscription(c *gin.Context) {
	sub, err := h.subStore.GetByUserID(c.Request.Context(), middleware.GetUserID(c))
	if errors.Is(err, store.ErrNotFound) {
		// User predates the subscriptions table — return a default free/trialing state.
		c.JSON(http.StatusOK, gin.H{"plan": "free", "status": "trialing"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load subscription"})
		return
	}

	resp := gin.H{
		"plan":   sub.Plan,
		"status": sub.Status,
	}
	if sub.TrialEndsAt != nil {
		resp["trial_ends_at"] = sub.TrialEndsAt.Format(time.RFC3339)
	}
	if sub.CurrentPeriodEndsAt != nil {
		resp["current_period_ends_at"] = sub.CurrentPeriodEndsAt.Format(time.RFC3339)
	}
	if sub.PaddleCustomerID != nil {
		resp["paddle_customer_id"] = *sub.PaddleCustomerID
	}

	c.JSON(http.StatusOK, resp)
}

// GetCheckoutConfig returns the Paddle client token and price ID so the
// frontend can open an overlay checkout without exposing server-side secrets.
func (h *Handler) GetCheckoutConfig(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"client_token": h.paddleClientToken,
		"price_id":     h.paddlePriceID,
	})
}

// paddleWebhookEvent is the minimal shape of a Paddle webhook payload.
type paddleWebhookEvent struct {
	EventType string          `json:"event_type"`
	Data      json.RawMessage `json:"data"`
}

type paddleSubData struct {
	ID             string  `json:"id"`
	CustomerID     string  `json:"customer_id"`
	Status         string  `json:"status"`
	Items          []struct {
		Price struct {
			ID          string `json:"id"`
			ProductID   string `json:"product_id"`
			Description string `json:"description"`
		} `json:"price"`
	} `json:"items"`
	CurrentBillingPeriod *struct {
		EndsAt string `json:"ends_at"`
	} `json:"current_billing_period"`
	CustomData *struct {
		UserID string `json:"user_id"`
	} `json:"custom_data"`
}

// PaddleWebhook handles incoming Paddle webhook events.
// Signature verification uses the raw body + HMAC-SHA256.
func (h *Handler) PaddleWebhook(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot read body"})
		return
	}

	// Verify signature when secret is configured.
	if h.paddleWebhookSecret != "" {
		sig := c.GetHeader("Paddle-Signature")
		if !verifyPaddleSignature(body, sig, h.paddleWebhookSecret) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid signature"})
			return
		}
	}

	var event paddleWebhookEvent
	if err := json.Unmarshal(body, &event); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}

	switch event.EventType {
	case "subscription.created", "subscription.updated", "subscription.activated",
		"subscription.past_due", "subscription.paused", "subscription.canceled":

		var sub paddleSubData
		if err := json.Unmarshal(event.Data, &sub); err != nil {
			h.log.Error("paddle: failed to parse subscription data", "error", err)
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid subscription data"})
			return
		}

		if sub.CustomData == nil || sub.CustomData.UserID == "" {
			h.log.Warn("paddle: webhook missing user_id in custom_data", "event", event.EventType, "paddle_sub_id", sub.ID)
			c.JSON(http.StatusOK, gin.H{"ok": true})
			return
		}

		plan := "free"
		if len(sub.Items) > 0 {
			plan = "pro"
		}

		var periodEndsAt *time.Time
		if sub.CurrentBillingPeriod != nil {
			t, err := time.Parse(time.RFC3339, sub.CurrentBillingPeriod.EndsAt)
			if err == nil {
				periodEndsAt = &t
			}
		}

		if err := h.subStore.Upsert(
			c.Request.Context(),
			sub.CustomData.UserID,
			plan,
			sub.Status,
			sub.CustomerID,
			sub.ID,
			periodEndsAt,
		); err != nil {
			h.log.Error("paddle: failed to upsert subscription", "error", err, "user_id", sub.CustomData.UserID)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "db error"})
			return
		}

		h.log.Info("paddle: subscription upserted", "event", event.EventType, "user_id", sub.CustomData.UserID, "plan", plan, "status", sub.Status)
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// verifyPaddleSignature checks the Paddle-Signature header value.
// Format: "ts=<timestamp>;h1=<hex-hmac>"
func verifyPaddleSignature(body []byte, header, secret string) bool {
	// Parse ts= and h1= parts.
	var ts, h1 string
	for _, part := range splitSemicolon(header) {
		if len(part) > 3 && part[:3] == "ts=" {
			ts = part[3:]
		}
		if len(part) > 3 && part[:3] == "h1=" {
			h1 = part[3:]
		}
	}
	if ts == "" || h1 == "" {
		return false
	}

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(ts + ":"))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(h1))
}

func splitSemicolon(s string) []string {
	var parts []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == ';' {
			parts = append(parts, s[start:i])
			start = i + 1
		}
	}
	parts = append(parts, s[start:])
	return parts
}
