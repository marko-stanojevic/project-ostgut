package handler

import (
	"testing"
	"time"

	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

func TestBuildStationStreamsAlwaysEnablesMetadata(t *testing.T) {
	h := &Handler{}

	streams, err := h.buildStationStreams(nil, []adminStreamRequest{{
		URL:             "https://somafm.example/groovesalad",
		Priority:        1,
		MetadataEnabled: boolPtr(false),
	}})
	if err != nil {
		t.Fatalf("build station streams: %v", err)
	}
	if len(streams) != 1 {
		t.Fatalf("expected one stream, got %d", len(streams))
	}
	if !streams[0].MetadataEnabled {
		t.Fatal("expected editor stream rebuild to keep metadata enabled")
	}
}

func boolPtr(value bool) *bool {
	return &value
}

func TestShouldRefreshMetadataRoutingForEditorRequiresEnabledActiveUnclassifiedStream(t *testing.T) {
	stream := &store.StationStream{
		IsActive:        true,
		MetadataEnabled: true,
	}
	if !shouldRefreshMetadataRoutingForEditor(stream) {
		t.Fatal("expected active metadata-enabled stream without resolver check to refresh")
	}

	stream.MetadataResolverCheckedAt = timePtr()
	if shouldRefreshMetadataRoutingForEditor(stream) {
		t.Fatal("expected already-classified stream to skip refresh")
	}
}

func timePtr() *time.Time {
	now := time.Now().UTC()
	return &now
}
