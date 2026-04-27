package handler

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

func TestBuildObjectURLPreservesQuery(t *testing.T) {
	got, err := buildObjectURL("https://example.blob.core.windows.net/uploads?sv=2025-01-01&sig=abc123", "avatars/user-1/asset-1/original")
	if err != nil {
		t.Fatalf("buildObjectURL returned error: %v", err)
	}

	want := "https://example.blob.core.windows.net/uploads/avatars/user-1/asset-1/original?sv=2025-01-01&sig=abc123"
	if got != want {
		t.Fatalf("unexpected url\nwant: %s\n got: %s", want, got)
	}
}

func TestMediaUploadTokenRoundTrip(t *testing.T) {
	h := &Handler{media: mediaHandlers{config: mediaConfig{uploadSecret: "test-secret"}}}
	expiresAt := time.Now().Add(15 * time.Minute).UTC()

	token, err := h.createMediaUploadToken("asset-123", "avatars/user-1/asset-123/original", expiresAt)
	if err != nil {
		t.Fatalf("createMediaUploadToken returned error: %v", err)
	}

	claims, err := h.parseMediaUploadToken(token)
	if err != nil {
		t.Fatalf("parseMediaUploadToken returned error: %v", err)
	}

	if claims.AssetID != "asset-123" {
		t.Fatalf("unexpected asset id: %s", claims.AssetID)
	}
	if claims.BlobKey != "avatars/user-1/asset-123/original" {
		t.Fatalf("unexpected blob key: %s", claims.BlobKey)
	}
}

func TestProcessUploadedAssetUploadsVariants(t *testing.T) {
	originalPayload := mustEncodePNG(t, 320, 200)
	putRequests := make(map[string]string)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			if r.URL.Path != "/container/avatars/user-1/asset-1/original" {
				t.Fatalf("unexpected GET path: %s", r.URL.Path)
			}
			if r.URL.RawQuery != "sig=test" {
				t.Fatalf("unexpected GET query: %s", r.URL.RawQuery)
			}
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write(originalPayload)
		case http.MethodPut:
			putRequests[r.URL.Path] = r.URL.RawQuery
			if got := r.Header.Get("Content-Type"); got != "image/png" {
				t.Fatalf("unexpected PUT content-type: %s", got)
			}
			if got := r.Header.Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
				t.Fatalf("unexpected cache-control: %s", got)
			}
			w.WriteHeader(http.StatusCreated)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}))
	defer server.Close()

	h := &Handler{media: mediaHandlers{config: mediaConfig{uploadBaseURL: server.URL + "/container?sig=test"}}}
	asset := &store.MediaAsset{
		ID:                 "asset-1",
		OwnerType:          store.MediaAssetOwnerUser,
		OwnerID:            "user-1",
		Kind:               store.MediaAssetKindAvatar,
		StorageKeyOriginal: "avatars/user-1/asset-1/original",
		MIMEType:           "image/png",
	}

	result, reason, err := h.processUploadedAsset(context.Background(), asset)
	if err != nil {
		t.Fatalf("processUploadedAsset returned error: %v", err)
	}
	if reason != "" {
		t.Fatalf("unexpected rejection reason: %s", reason)
	}
	if result.Width != 320 || result.Height != 200 {
		t.Fatalf("unexpected dimensions: %dx%d", result.Width, result.Height)
	}
	if result.ByteSize != int64(len(originalPayload)) {
		t.Fatalf("unexpected byte size: %d", result.ByteSize)
	}

	for _, variantPath := range []string{
		"/container/avatars/user-1/asset-1/64.png",
		"/container/avatars/user-1/asset-1/128.png",
		"/container/avatars/user-1/asset-1/256.png",
	} {
		query, ok := putRequests[variantPath]
		if !ok {
			t.Fatalf("expected PUT for %s", variantPath)
		}
		if query != "sig=test" {
			t.Fatalf("unexpected PUT query for %s: %s", variantPath, query)
		}
	}
}

func TestProcessUploadedAssetStripsEXIFFromAvatarVariants(t *testing.T) {
	exifPayload := []byte("Exif\x00\x00OSTGUT-test-camera-metadata")
	originalPayload := mustEncodeJPEGWithAPP1Segment(t, 320, 200, exifPayload)
	if !bytes.Contains(originalPayload, exifPayload) {
		t.Fatal("expected original payload to contain EXIF test marker")
	}

	putBodies := make(map[string][]byte)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write(originalPayload)
		case http.MethodPut:
			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatalf("read PUT body: %v", err)
			}
			putBodies[r.URL.Path] = body
			w.WriteHeader(http.StatusCreated)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}))
	defer server.Close()

	h := &Handler{media: mediaHandlers{config: mediaConfig{uploadBaseURL: server.URL + "/container"}}}
	asset := &store.MediaAsset{
		ID:                 "asset-exif",
		OwnerType:          store.MediaAssetOwnerUser,
		OwnerID:            "user-1",
		Kind:               store.MediaAssetKindAvatar,
		StorageKeyOriginal: "avatars/user-1/asset-exif/original",
		MIMEType:           "image/jpeg",
	}

	_, reason, err := h.processUploadedAsset(context.Background(), asset)
	if err != nil {
		t.Fatalf("processUploadedAsset returned error: %v", err)
	}
	if reason != "" {
		t.Fatalf("unexpected rejection reason: %s", reason)
	}

	variant := putBodies["/container/avatars/user-1/asset-exif/64.png"]
	if len(variant) == 0 {
		t.Fatal("expected processed avatar variant upload")
	}
	if _, err := png.Decode(bytes.NewReader(variant)); err != nil {
		t.Fatalf("variant is not a valid PNG: %v", err)
	}
	if bytes.Contains(variant, exifPayload) {
		t.Fatal("processed avatar variant retained EXIF payload")
	}
	if bytes.Contains(variant, []byte("Exif\x00\x00")) {
		t.Fatal("processed avatar variant retained EXIF header")
	}
	if !bytes.HasPrefix(variant, []byte("\x89PNG\r\n\x1a\n")) {
		t.Fatal("processed avatar variant missing PNG signature")
	}
}

func TestProcessUploadedAssetRejectsUnsupportedPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte("not-an-image"))
	}))
	defer server.Close()

	h := &Handler{media: mediaHandlers{config: mediaConfig{uploadBaseURL: server.URL + "/container"}}}
	asset := &store.MediaAsset{
		ID:                 "asset-2",
		OwnerType:          store.MediaAssetOwnerUser,
		OwnerID:            "user-1",
		Kind:               store.MediaAssetKindAvatar,
		StorageKeyOriginal: "avatars/user-1/asset-2/original",
		MIMEType:           "image/png",
	}

	_, reason, err := h.processUploadedAsset(context.Background(), asset)
	if err != nil {
		t.Fatalf("processUploadedAsset returned error: %v", err)
	}
	if reason == "" {
		t.Fatal("expected rejection reason")
	}
}

func mustEncodePNG(t *testing.T, width, height int) []byte {
	t.Helper()

	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{R: uint8((x * 255) / width), G: uint8((y * 255) / height), B: 180, A: 255})
		}
	}

	var output bytes.Buffer
	if err := png.Encode(&output, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}
	return output.Bytes()
}

func mustEncodeJPEGWithAPP1Segment(t *testing.T, width, height int, app1Payload []byte) []byte {
	t.Helper()

	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{R: 90, G: uint8((x * 255) / width), B: uint8((y * 255) / height), A: 255})
		}
	}

	var jpegBytes bytes.Buffer
	if err := jpeg.Encode(&jpegBytes, img, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatalf("encode jpeg: %v", err)
	}

	encoded := jpegBytes.Bytes()
	if len(encoded) < 2 || encoded[0] != 0xff || encoded[1] != 0xd8 {
		t.Fatal("encoded JPEG missing SOI marker")
	}
	if len(app1Payload) > 0xffff-2 {
		t.Fatal("APP1 payload too large")
	}

	segmentLen := len(app1Payload) + 2
	withAPP1 := make([]byte, 0, len(encoded)+4+len(app1Payload))
	withAPP1 = append(withAPP1, encoded[:2]...)
	withAPP1 = append(withAPP1, 0xff, 0xe1, byte(segmentLen>>8), byte(segmentLen))
	withAPP1 = append(withAPP1, app1Payload...)
	withAPP1 = append(withAPP1, encoded[2:]...)
	return withAPP1
}
