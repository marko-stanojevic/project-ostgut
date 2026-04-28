package handler

import "testing"

func TestBuildStationStreamsKeepsExplicitMetadataMode(t *testing.T) {
	h := &Handler{}

	streams, err := h.buildStationStreams([]adminStreamRequest{{
		URL:          "https://somafm.example/groovesalad",
		Priority:     1,
		MetadataMode: stringPtr("off"),
	}})
	if err != nil {
		t.Fatalf("build station streams: %v", err)
	}
	if len(streams) != 1 {
		t.Fatalf("expected one stream, got %d", len(streams))
	}
	if streams[0].MetadataMode != "off" {
		t.Fatalf("expected editor stream rebuild to preserve metadata mode off, got %q", streams[0].MetadataMode)
	}
}

func TestBuildStationStreamsDefaultsMetadataModeToAuto(t *testing.T) {
	h := &Handler{}

	streams, err := h.buildStationStreams([]adminStreamRequest{{
		URL:      "https://somafm.example/dronezone",
		Priority: 1,
	}})
	if err != nil {
		t.Fatalf("build station streams: %v", err)
	}
	if len(streams) != 1 {
		t.Fatalf("expected one stream, got %d", len(streams))
	}
	if streams[0].MetadataMode != "auto" {
		t.Fatalf("expected default metadata mode auto, got %q", streams[0].MetadataMode)
	}
}
