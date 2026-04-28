package handler

import (
	"testing"

	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

func TestStationAllowsPersistedNowPlayingRequiresApprovedStation(t *testing.T) {
	if stationAllowsPersistedNowPlaying(nil) {
		t.Fatal("expected nil station to reject persisted now-playing")
	}

	if stationAllowsPersistedNowPlaying(&store.Station{Status: "pending"}) {
		t.Fatal("expected pending station to reject persisted now-playing")
	}

	if stationAllowsPersistedNowPlaying(&store.Station{Status: "rejected"}) {
		t.Fatal("expected rejected station to reject persisted now-playing")
	}

	if !stationAllowsPersistedNowPlaying(&store.Station{Status: "approved"}) {
		t.Fatal("expected approved station to allow persisted now-playing")
	}
}
