package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

type fakePlayerPreferencesStore struct {
	result *store.PlayerPreferencesWriteResult
	err    error
}

func (f *fakePlayerPreferencesStore) GetPlayerPreferences(context.Context, string) (*store.PlayerPreferences, error) {
	return &f.result.Preferences, nil
}

func (f *fakePlayerPreferencesStore) UpdatePlayerPreferences(context.Context, string, store.PlayerPreferences) (*store.PlayerPreferencesWriteResult, error) {
	return f.result, f.err
}

func TestUpdatePlayerPreferencesReturnsPersistedStateOnStaleWrite(t *testing.T) {
	gin.SetMode(gin.TestMode)

	persistedUpdatedAt := time.Date(2026, 4, 21, 10, 30, 0, 0, time.UTC)
	h := &Handler{
		player: playerHandlers{
			users: &fakePlayerPreferencesStore{
				result: &store.PlayerPreferencesWriteResult{
					Applied: false,
					Preferences: store.PlayerPreferences{
						Volume: 0.72,
						Station: &store.PlayerStation{
							ID:        "station-current",
							Name:      "Current Station",
							StreamURL: "https://example.com/live",
						},
						UpdatedAt: persistedUpdatedAt,
					},
				},
			},
		},
		log: slog.New(slog.NewTextHandler(bytes.NewBuffer(nil), nil)),
	}

	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("user_id", "user-123")
		c.Next()
	})
	router.PUT("/users/me/player-preferences", h.UpdatePlayerPreferences)

	body := []byte(`{"volume":0.4,"updatedAt":"2026-04-21T09:00:00Z"}`)
	req := httptest.NewRequest(http.MethodPut, "/users/me/player-preferences", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var resp struct {
		Message   string               `json:"message"`
		Stale     bool                 `json:"stale"`
		Volume    float64              `json:"volume"`
		Station   *store.PlayerStation `json:"station"`
		UpdatedAt string               `json:"updatedAt"`
	}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if !resp.Stale {
		t.Fatalf("expected stale=true")
	}
	if resp.Message != "stale player preferences ignored" {
		t.Fatalf("unexpected message: %q", resp.Message)
	}
	if resp.Volume != 0.72 {
		t.Fatalf("expected persisted volume, got %v", resp.Volume)
	}
	if resp.Station == nil || resp.Station.ID != "station-current" {
		t.Fatalf("expected persisted station in response, got %#v", resp.Station)
	}
	if resp.UpdatedAt != persistedUpdatedAt.Format(time.RFC3339Nano) {
		t.Fatalf("expected persisted updatedAt %q, got %q", persistedUpdatedAt.Format(time.RFC3339Nano), resp.UpdatedAt)
	}
}
