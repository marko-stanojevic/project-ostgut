package store

import (
	"reflect"
	"testing"
)

func TestDeriveSearchTags(t *testing.T) {
	got := deriveSearchTags(
		[]string{"Jazz", "Ambient", "jazz"},
		[]string{"Deep House", "ambient", "leftfield"},
		[]string{"Curated", "curated"},
		[]string{"Hosted", "live"},
		[]string{"Warm", "warm"},
	)

	want := []string{"jazz", "ambient", "deep house", "leftfield", "curated", "hosted", "live", "warm"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("deriveSearchTags() mismatch\nwant: %#v\n got: %#v", want, got)
	}
}

func TestNormalizeTagValues(t *testing.T) {
	got := normalizeTagValues([]string{"  Jazz  ", "", "JAZZ", " Leftfield "})
	want := []string{"jazz", "leftfield"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("normalizeTagValues() mismatch\nwant: %#v\n got: %#v", want, got)
	}
}