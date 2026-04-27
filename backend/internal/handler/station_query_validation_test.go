package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestUnknownQueryParamsReturnsSortedUnknownKeys(t *testing.T) {
	values := url.Values{
		"limit":     []string{"20"},
		"surprise":  []string{"1"},
		"q":         []string{"nts"},
		"unexpected": []string{"true"},
	}

	got := unknownQueryParams(values, publicStationSearchQueryParams)
	if len(got) != 2 {
		t.Fatalf("expected 2 unknown params, got %#v", got)
	}
	if got[0] != "surprise" || got[1] != "unexpected" {
		t.Fatalf("unexpected unknown params: %#v", got)
	}
}

func TestListStationsRejectsUnknownQueryParamsWhenAllowlistEnforced(t *testing.T) {
	gin.SetMode(gin.TestMode)

	h := &Handler{enforcePublicQueryAllowlist: true}
	router := gin.New()
	router.GET("/stations", h.ListStations)

	req := httptest.NewRequest(http.MethodGet, "/stations?featured=true&debug=1", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", w.Code)
	}

	var body map[string]string
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body["error"] != "unknown query parameter: debug" {
		t.Fatalf("unexpected error: %q", body["error"])
	}
}

func TestSearchStationsRejectsUnknownQueryParamsWhenAllowlistEnforced(t *testing.T) {
	gin.SetMode(gin.TestMode)

	h := &Handler{enforcePublicQueryAllowlist: true}
	router := gin.New()
	router.GET("/search", h.SearchStations)

	req := httptest.NewRequest(http.MethodGet, "/search?q=nts&foo=bar", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", w.Code)
	}

	var body map[string]string
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body["error"] != "unknown query parameter: foo" {
		t.Fatalf("unexpected error: %q", body["error"])
	}
}