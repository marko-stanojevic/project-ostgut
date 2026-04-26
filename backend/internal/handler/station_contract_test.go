package handler

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

func TestToStationResponsePublishesEditorialReviewNotInternalNotes(t *testing.T) {
	station := &store.Station{
		ID:              "station-1",
		Name:            "NTS 1",
		GenreTags:       []string{"jazz"},
		SubgenreTags:    []string{"free jazz"},
		SearchTags:      []string{"jazz", "free jazz", "curated"},
		StyleTags:       []string{"curated"},
		FormatTags:      []string{"hosted"},
		TextureTags:     []string{"warm"},
		Country:         "UK",
		City:            "London",
		Language:        "en",
		EditorialReview: stringPtr("A precise, adventurous station."),
		InternalNotes:   stringPtr("Do not expose this."),
	}

	resp := toStationResponse(station, nil)
	if resp.EditorialReview == nil || *resp.EditorialReview != "A precise, adventurous station." {
		t.Fatalf("expected editorial review in response, got %#v", resp.EditorialReview)
	}
	if len(resp.SearchTags) != 3 {
		t.Fatalf("expected explicit search tags in response, got %#v", resp.SearchTags)
	}

	body, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal response: %v", err)
	}

	jsonText := string(body)
	if !strings.Contains(jsonText, "editorial_review") {
		t.Fatalf("expected editorial_review in public json: %s", jsonText)
	}
	if strings.Contains(jsonText, "internal_notes") {
		t.Fatalf("internal_notes leaked into public json: %s", jsonText)
	}
}

func stringPtr(value string) *string {
	return &value
}
