package handler

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestAdminOverviewSectionEmptyStationsMarshalAsArray(t *testing.T) {
	section := adminOverviewSection{
		ID:          "editorial",
		Title:       "Editorial gaps",
		Description: "No stations need editorial work.",
		Severity:    "notice",
		Count:       0,
		Stations:    limitAdminOverviewStations(nil),
	}

	payload, err := json.Marshal(section)
	if err != nil {
		t.Fatalf("marshal section: %v", err)
	}

	encoded := string(payload)
	if !strings.Contains(encoded, `"stations":[]`) {
		t.Fatalf("expected stations to marshal as empty array, got %s", encoded)
	}
	if strings.Contains(encoded, `"stations":null`) {
		t.Fatalf("expected stations not to marshal as null, got %s", encoded)
	}
}
