package metadata

import (
	"encoding/json"
	"testing"
)

func TestParseNPRComposerConfig(t *testing.T) {
	cfg, err := parseNPRComposerConfig(json.RawMessage(`{"ucs":"wbgo"}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.UCS != "wbgo" {
		t.Fatalf("ucs = %q; want wbgo", cfg.UCS)
	}
}

func TestSelectNPRComposerTrackPrefersNowPlaying(t *testing.T) {
	payload := nprComposerResponse{
		Playlist: []struct {
			Playlist []nprComposerTrack `json:"playlist"`
		}{
			{Playlist: []nprComposerTrack{
				{TrackName: "Older Track", ArtistName: "Older Artist"},
				{NowPlaying: true, TrackName: "Melodie Au Crepuscle", ArtistName: "Hot Club of the Americas"},
			}},
		},
	}

	track := selectNPRComposerTrack(payload)
	if track == nil {
		t.Fatal("expected selected track")
	}
	if track.TrackName != "Melodie Au Crepuscle" || track.ArtistName != "Hot Club of the Americas" {
		t.Fatalf("unexpected track: %+v", *track)
	}
}

func TestSelectNPRComposerTrackFallsBackToLatestNonEmpty(t *testing.T) {
	payload := nprComposerResponse{
		Playlist: []struct {
			Playlist []nprComposerTrack `json:"playlist"`
		}{
			{Playlist: []nprComposerTrack{
				{TrackName: ""},
				{TrackName: "Latest Track", ArtistName: "Latest Artist"},
			}},
		},
	}

	track := selectNPRComposerTrack(payload)
	if track == nil {
		t.Fatal("expected selected track")
	}
	if track.TrackName != "Latest Track" {
		t.Fatalf("track = %q; want Latest Track", track.TrackName)
	}
}

func TestParseNTSLiveConfig(t *testing.T) {
	cfg, err := parseNTSLiveConfig(json.RawMessage(`{"channel":"2"}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Channel != "2" {
		t.Fatalf("channel = %q; want 2", cfg.Channel)
	}
}

func TestParseNTSLiveConfigRejectsUnknownChannel(t *testing.T) {
	if _, err := parseNTSLiveConfig(json.RawMessage(`{"channel":"3"}`)); err == nil {
		t.Fatal("expected invalid channel error")
	}
}

func TestStripNTSProviderBranding(t *testing.T) {
	got := stripNTSProviderBranding("NTS 1 - Floating Points (R)", "1")
	if got != "Floating Points" {
		t.Fatalf("title = %q; want Floating Points", got)
	}
}
