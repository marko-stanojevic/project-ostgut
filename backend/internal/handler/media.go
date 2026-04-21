package handler

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/color"
	stddraw "image/draw"
	_ "image/jpeg"
	"image/png"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore/to"
	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob/blob"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob/bloberror"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/middleware"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

const (
	maxAvatarBytes      int64 = 5 * 1024 * 1024
	maxStationIconBytes int64 = 10 * 1024 * 1024
	maxSniffBytes             = 512
)

var allowedMediaMIMETypes = map[string]struct{}{
	"image/jpeg": {},
	"image/png":  {},
	"image/webp": {},
}

type createUploadIntentRequest struct {
	Kind          string `json:"kind" binding:"required"`
	OwnerID       string `json:"ownerId"`
	ContentType   string `json:"contentType" binding:"required"`
	ContentLength int64  `json:"contentLength" binding:"required"`
}

type completeUploadRequest struct {
	AssetID string `json:"assetId" binding:"required"`
	BlobKey string `json:"blobKey" binding:"required"`
}

type processedMediaResult struct {
	Variants    map[string]string
	MIMEType    string
	Width       int
	Height      int
	ByteSize    int64
	ContentHash string
}

type mediaUploadClaims struct {
	AssetID string `json:"asset_id"`
	BlobKey string `json:"blob_key"`
	jwt.RegisteredClaims
}

func (h *Handler) mediaResponse(asset *store.MediaAsset) gin.H {
	variants := resolveMediaVariantURLs(asset, h.media.config.uploadBaseURL)
	if variants == nil {
		variants = map[string]string{}
	}

	resp := gin.H{
		"id":                   asset.ID,
		"owner_type":           asset.OwnerType,
		"owner_id":             asset.OwnerID,
		"kind":                 asset.Kind,
		"storage_key_original": asset.StorageKeyOriginal,
		"original_url":         resolveMediaObjectURL(asset.StorageKeyOriginal, h.media.config.uploadBaseURL),
		"variants":             variants,
		"mime_type":            asset.MIMEType,
		"status":               asset.Status,
	}

	if asset.Width != nil {
		resp["width"] = *asset.Width
	}
	if asset.Height != nil {
		resp["height"] = *asset.Height
	}
	if asset.ByteSize != nil {
		resp["byte_size"] = *asset.ByteSize
	}
	if asset.ContentHash != nil {
		resp["content_hash"] = *asset.ContentHash
	}
	if asset.RejectionReason != nil {
		resp["rejection_reason"] = *asset.RejectionReason
	}

	return resp
}

// CreateUploadIntent handles POST /media/upload-intent.
func (h *Handler) CreateUploadIntent(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req createUploadIntentRequest
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	req.Kind = strings.TrimSpace(req.Kind)
	req.OwnerID = strings.TrimSpace(req.OwnerID)
	req.ContentType = strings.ToLower(strings.TrimSpace(req.ContentType))

	if _, ok := allowedMediaMIMETypes[req.ContentType]; !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported content type"})
		return
	}
	if req.ContentLength <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "contentLength must be greater than 0"})
		return
	}

	ownerType := ""
	ownerID := ""
	maxBytes := maxAvatarBytes

	switch req.Kind {
	case store.MediaAssetKindAvatar:
		ownerType = store.MediaAssetOwnerUser
		ownerID = userID
		maxBytes = maxAvatarBytes
	case store.MediaAssetKindStationIcon:
		isAdmin, err := h.media.users.IsAdmin(c.Request.Context(), userID)
		if err != nil {
			h.log.Error("check admin for media upload intent", "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}
		if !isAdmin {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		if req.OwnerID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ownerId is required for station_icon"})
			return
		}
		if _, err := h.media.stations.GetByIDAdmin(c.Request.Context(), req.OwnerID); errors.Is(err, store.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "station not found"})
			return
		} else if err != nil {
			h.log.Error("get station for media upload intent", "station_id", req.OwnerID, "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}
		ownerType = store.MediaAssetOwnerStation
		ownerID = req.OwnerID
		maxBytes = maxStationIconBytes
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid kind"})
		return
	}

	if req.ContentLength > maxBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("file too large (max %d bytes)", maxBytes)})
		return
	}

	asset, err := h.media.assets.CreatePending(c.Request.Context(), store.CreateMediaAssetParams{
		OwnerType: ownerType,
		OwnerID:   ownerID,
		Kind:      req.Kind,
		MIMEType:  req.ContentType,
	})
	if err != nil {
		h.log.Error("create media upload intent", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	storageKey := buildOriginalStorageKey(asset)
	if err := h.media.assets.UpdateStorageKeyOriginal(c.Request.Context(), asset.ID, storageKey); err != nil {
		h.log.Error("update media storage key", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	asset.StorageKeyOriginal = storageKey

	expiresAt := time.Now().Add(15 * time.Minute).UTC()
	token, err := h.createMediaUploadToken(asset.ID, storageKey, expiresAt)
	if err != nil {
		h.log.Error("create media upload token", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	uploadURL := requestBaseURL(c) + "/media/upload/" + asset.ID + "?token=" + url.QueryEscape(token)

	c.JSON(http.StatusOK, gin.H{
		"assetId":   asset.ID,
		"uploadUrl": uploadURL,
		"blobKey":   storageKey,
		"expiresAt": expiresAt,
		"constraints": gin.H{
			"maxBytes":         maxBytes,
			"allowedMimeTypes": []string{"image/jpeg", "image/png", "image/webp"},
		},
	})
}

// CompleteUpload handles POST /media/complete.
func (h *Handler) CompleteUpload(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req completeUploadRequest
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	asset, err := h.media.assets.GetByID(c.Request.Context(), req.AssetID)
	if errors.Is(err, store.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
		return
	}
	if err != nil {
		h.log.Error("get media asset for complete", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	if err := h.authorizeMediaAssetAccess(c, userID, asset); err != nil {
		if errors.Is(err, errForbiddenMediaAsset) {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		h.log.Error("authorize media asset complete", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	if req.BlobKey != asset.StorageKeyOriginal {
		c.JSON(http.StatusBadRequest, gin.H{"error": "blobKey does not match asset"})
		return
	}

	if asset.Status == store.MediaAssetStatusPending {
		processed, reason, err := h.processUploadedAsset(c.Request.Context(), asset)
		if err != nil {
			h.log.Error("process media asset", "asset_id", asset.ID, "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}

		if reason != "" {
			if err := h.media.assets.MarkRejected(c.Request.Context(), asset.ID, reason); err != nil {
				h.log.Error("mark media asset rejected", "asset_id", asset.ID, "error", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
				return
			}

			rejectedAsset, getErr := h.media.assets.GetByID(c.Request.Context(), asset.ID)
			if getErr != nil {
				h.log.Error("get rejected media asset", "asset_id", asset.ID, "error", getErr)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
				return
			}

			c.JSON(http.StatusOK, gin.H{"status": rejectedAsset.Status, "asset": h.mediaResponse(rejectedAsset)})
			return
		}

		hash := processed.ContentHash
		if err := h.media.assets.MarkReady(c.Request.Context(), asset.ID, store.MarkMediaAssetReadyParams{
			Variants:    processed.Variants,
			MIMEType:    processed.MIMEType,
			Width:       processed.Width,
			Height:      processed.Height,
			ByteSize:    processed.ByteSize,
			ContentHash: &hash,
		}); err != nil {
			h.log.Error("mark media asset ready", "asset_id", asset.ID, "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}

		updatedAsset, getErr := h.media.assets.GetByID(c.Request.Context(), asset.ID)
		if getErr != nil {
			h.log.Error("get ready media asset", "asset_id", asset.ID, "error", getErr)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}

		h.linkOwnerAsset(c, updatedAsset)
		c.JSON(http.StatusOK, gin.H{"status": updatedAsset.Status, "asset": h.mediaResponse(updatedAsset)})
		return
	}

	if asset.Status == store.MediaAssetStatusReady {
		h.linkOwnerAsset(c, asset)
		c.JSON(http.StatusOK, gin.H{"status": asset.Status, "asset": h.mediaResponse(asset)})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": asset.Status, "asset": h.mediaResponse(asset)})
}

// GetMedia handles GET /media/:id.
func (h *Handler) GetMedia(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	asset, err := h.media.assets.GetByID(c.Request.Context(), c.Param("id"))
	if errors.Is(err, store.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
		return
	}
	if err != nil {
		h.log.Error("get media asset", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	if err := h.authorizeMediaAssetAccess(c, userID, asset); err != nil {
		if errors.Is(err, errForbiddenMediaAsset) {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		h.log.Error("authorize media asset", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusOK, h.mediaResponse(asset))
}

// UploadMediaObject handles PUT /media/upload/:id.
func (h *Handler) UploadMediaObject(c *gin.Context) {
	if h.media.config.uploadBaseURL == "" && !h.hasManagedIdentityMediaStorage() {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "media upload storage is not configured"})
		return
	}

	claims, err := h.parseMediaUploadToken(c.Query("token"))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid upload token"})
		return
	}

	assetID := c.Param("id")
	if claims.AssetID != assetID {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid upload token"})
		return
	}

	asset, err := h.media.assets.GetByID(c.Request.Context(), assetID)
	if errors.Is(err, store.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
		return
	}
	if err != nil {
		h.log.Error("get media asset for upload", "asset_id", assetID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	if asset.Status != store.MediaAssetStatusPending || claims.BlobKey != asset.StorageKeyOriginal {
		c.JSON(http.StatusBadRequest, gin.H{"error": "upload is no longer valid"})
		return
	}

	maxBytes := maxUploadBytesForKind(asset.Kind)
	payload, err := io.ReadAll(io.LimitReader(c.Request.Body, maxBytes+1))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid upload body"})
		return
	}
	if len(payload) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "empty upload body"})
		return
	}
	if int64(len(payload)) > maxBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("file too large (max %d bytes)", maxBytes)})
		return
	}

	detectedMIMEType := detectMIMEType(payload)
	if _, ok := allowedMediaMIMETypes[detectedMIMEType]; !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported image format"})
		return
	}
	if asset.MIMEType != "" && asset.MIMEType != detectedMIMEType {
		c.JSON(http.StatusBadRequest, gin.H{"error": "uploaded content type does not match intent"})
		return
	}

	if _, _, err := image.DecodeConfig(bytes.NewReader(payload)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid image payload"})
		return
	}

	if err := h.putMediaObject(c.Request.Context(), asset.StorageKeyOriginal, payload, detectedMIMEType); err != nil {
		h.log.Error("store uploaded media object", "asset_id", assetID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.Status(http.StatusNoContent)
}

var errForbiddenMediaAsset = errors.New("forbidden media asset")

func (h *Handler) authorizeMediaAssetAccess(c *gin.Context, userID string, asset *store.MediaAsset) error {
	switch asset.OwnerType {
	case store.MediaAssetOwnerUser:
		if asset.OwnerID != userID {
			return errForbiddenMediaAsset
		}
		return nil
	case store.MediaAssetOwnerStation:
		isAdmin, err := h.media.users.IsAdmin(c.Request.Context(), userID)
		if err != nil {
			return err
		}
		if !isAdmin {
			return errForbiddenMediaAsset
		}
		return nil
	default:
		return errForbiddenMediaAsset
	}
}

func buildOriginalStorageKey(asset *store.MediaAsset) string {
	if asset.Kind == store.MediaAssetKindAvatar {
		return path.Join("avatars", asset.OwnerID, asset.ID, "original")
	}
	return path.Join("stations", asset.OwnerID, asset.ID, "original")
}

func (h *Handler) linkOwnerAsset(c *gin.Context, asset *store.MediaAsset) {
	var err error
	switch asset.Kind {
	case store.MediaAssetKindAvatar:
		err = h.media.assets.SetUserAvatarAsset(c.Request.Context(), asset.OwnerID, asset.ID)
	case store.MediaAssetKindStationIcon:
		err = h.media.assets.SetStationIconAsset(c.Request.Context(), asset.OwnerID, asset.ID)
		if err == nil {
			// Resolve the best available variant URL and write it directly to logo.
			for _, size := range []string{"png_512", "png_192", "png_96", "original"} {
				if key, ok := asset.Variants[size]; ok && key != "" {
					iconURL := resolveMediaObjectURL(key, h.media.config.uploadBaseURL)
					if iconURL != "" {
						if uerr := h.media.stations.UpdateLogo(c.Request.Context(), asset.OwnerID, iconURL); uerr != nil {
							h.log.Error("update station logo after icon upload", "station_id", asset.OwnerID, "error", uerr)
						}
					}
					break
				}
			}
		}
	default:
		return
	}
	if err != nil && !errors.Is(err, store.ErrNotFound) {
		h.log.Error("link owner media asset", "asset_id", asset.ID, "error", err)
	}
}

func maxUploadBytesForKind(kind string) int64 {
	if kind == store.MediaAssetKindStationIcon {
		return maxStationIconBytes
	}
	return maxAvatarBytes
}

func buildVariantKeys(asset *store.MediaAsset) map[string]string {
	variants := map[string]string{
		"original": asset.StorageKeyOriginal,
	}

	if asset.Kind == store.MediaAssetKindAvatar {
		for _, size := range []string{"64", "128", "256"} {
			variants["png_"+size] = path.Join("avatars", asset.OwnerID, asset.ID, size+".png")
		}
		return variants
	}

	for _, size := range []string{"96", "192", "512"} {
		variants["png_"+size] = path.Join("stations", asset.OwnerID, asset.ID, size+".png")
	}
	return variants
}

func variantSizesForKind(kind string) []int {
	if kind == store.MediaAssetKindAvatar {
		return []int{64, 128, 256}
	}
	return []int{96, 192, 512}
}

func buildObjectURL(baseURL, objectKey string) (string, error) {
	parsed, err := url.Parse(baseURL)
	if err != nil {
		return "", fmt.Errorf("parse base media url: %w", err)
	}

	joinedPath := path.Join(parsed.Path, objectKey)
	if parsed.Host != "" {
		joinedPath = "/" + strings.TrimLeft(joinedPath, "/")
	}
	parsed.Path = joinedPath

	return parsed.String(), nil
}

func resolveMediaObjectURL(objectKey, baseURL string) string {
	if objectKey == "" {
		return ""
	}
	if baseURL == "" {
		return objectKey
	}
	resolved, err := buildObjectURL(baseURL, objectKey)
	if err != nil {
		return objectKey
	}
	return resolved
}

func resolveMediaVariantURLs(asset *store.MediaAsset, baseURL string) map[string]string {
	if len(asset.Variants) == 0 {
		return map[string]string{}
	}
	resolved := make(map[string]string, len(asset.Variants))
	for key, objectKey := range asset.Variants {
		resolved[key] = resolveMediaObjectURL(objectKey, baseURL)
	}
	return resolved
}

func requestBaseURL(c *gin.Context) string {
	scheme := c.Request.Header.Get("X-Forwarded-Proto")
	if scheme == "" {
		if c.Request.TLS != nil {
			scheme = "https"
		} else {
			scheme = "http"
		}
	}
	host := c.Request.Header.Get("X-Forwarded-Host")
	if host == "" {
		host = c.Request.Host
	}
	return scheme + "://" + host
}

func (h *Handler) createMediaUploadToken(assetID, blobKey string, expiresAt time.Time) (string, error) {
	claims := mediaUploadClaims{
		AssetID: assetID,
		BlobKey: blobKey,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(time.Now().UTC()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.media.config.uploadSecret))
}

func (h *Handler) parseMediaUploadToken(raw string) (*mediaUploadClaims, error) {
	if raw == "" {
		return nil, errors.New("missing upload token")
	}
	claims := &mediaUploadClaims{}
	token, err := jwt.ParseWithClaims(raw, claims, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(h.media.config.uploadSecret), nil
	})
	if err != nil || !token.Valid {
		return nil, errors.New("invalid upload token")
	}
	return claims, nil
}

func decodeImageDimensions(payload []byte) (int, int, error) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(payload))
	if err != nil {
		return 0, 0, err
	}
	return cfg.Width, cfg.Height, nil
}

func decodeImage(payload []byte) (image.Image, error) {
	img, _, err := image.Decode(bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	return img, nil
}

func detectMIMEType(payload []byte) string {
	sniffLen := maxSniffBytes
	if len(payload) < sniffLen {
		sniffLen = len(payload)
	}
	return strings.ToLower(http.DetectContentType(payload[:sniffLen]))
}

func cropToSquare(src image.Image) image.Image {
	bounds := src.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	size := width
	if height < size {
		size = height
	}
	offsetX := bounds.Min.X + (width-size)/2
	offsetY := bounds.Min.Y + (height-size)/2
	return imagingClone(src, image.Rect(0, 0, size, size), image.Point{X: offsetX, Y: offsetY})
}

func imagingClone(src image.Image, dstRect image.Rectangle, srcPoint image.Point) image.Image {
	dst := image.NewNRGBA(dstRect)
	stddraw.Draw(dst, dstRect, src, srcPoint, stddraw.Src)
	return dst
}

func resizeSquare(src image.Image, size int) image.Image {
	dst := image.NewNRGBA(image.Rect(0, 0, size, size))
	xdraw.CatmullRom.Scale(dst, dst.Bounds(), src, src.Bounds(), xdraw.Over, nil)
	return dst
}

func containOnSquareCanvas(src image.Image, size int) image.Image {
	bounds := src.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	if width <= 0 || height <= 0 {
		return image.NewNRGBA(image.Rect(0, 0, size, size))
	}

	canvas := image.NewNRGBA(image.Rect(0, 0, size, size))
	stddraw.Draw(canvas, canvas.Bounds(), &image.Uniform{C: color.Transparent}, image.Point{}, stddraw.Src)

	var targetWidth int
	var targetHeight int
	if width >= height {
		targetWidth = size
		targetHeight = maxInt(1, height*size/width)
	} else {
		targetHeight = size
		targetWidth = maxInt(1, width*size/height)
	}

	resized := image.NewNRGBA(image.Rect(0, 0, targetWidth, targetHeight))
	xdraw.CatmullRom.Scale(resized, resized.Bounds(), src, src.Bounds(), xdraw.Over, nil)

	offset := image.Point{
		X: (size - targetWidth) / 2,
		Y: (size - targetHeight) / 2,
	}
	stddraw.Draw(canvas, image.Rectangle{Min: offset, Max: offset.Add(resized.Bounds().Size())}, resized, image.Point{}, stddraw.Over)

	return canvas
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func encodePNGImage(img image.Image) ([]byte, error) {
	var output bytes.Buffer
	if err := png.Encode(&output, img); err != nil {
		return nil, fmt.Errorf("encode png: %w", err)
	}
	return output.Bytes(), nil
}

func buildVariantImages(src image.Image, asset *store.MediaAsset) (map[string][]byte, error) {
	variantImages := make(map[string][]byte)
	for _, size := range variantSizesForKind(asset.Kind) {
		var transformed image.Image
		if asset.Kind == store.MediaAssetKindAvatar {
			transformed = resizeSquare(cropToSquare(src), size)
		} else {
			transformed = containOnSquareCanvas(src, size)
		}

		encoded, err := encodePNGImage(transformed)
		if err != nil {
			return nil, err
		}
		variantImages[fmt.Sprintf("png_%d", size)] = encoded
	}

	return variantImages, nil
}

func (h *Handler) putMediaObject(ctx context.Context, objectKey string, payload []byte, contentType string) error {
	if h.hasManagedIdentityMediaStorage() {
		return h.putMediaObjectWithManagedIdentity(ctx, objectKey, payload, contentType)
	}
	return h.putMediaObjectWithBaseURL(ctx, objectKey, payload, contentType)
}

func (h *Handler) putMediaObjectWithBaseURL(ctx context.Context, objectKey string, payload []byte, contentType string) error {
	objectURL, err := buildObjectURL(h.media.config.uploadBaseURL, objectKey)
	if err != nil {
		return err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPut, objectURL, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("build upload request: %w", err)
	}
	request.Header.Set("Content-Type", contentType)
	request.Header.Set("Cache-Control", "public, max-age=31536000, immutable")
	if strings.Contains(request.URL.Host, "blob.core.windows.net") {
		request.Header.Set("x-ms-blob-type", "BlockBlob")
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(request)
	if err != nil {
		return fmt.Errorf("upload media object: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("upload media object: unexpected status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	return nil
}

func (h *Handler) putMediaObjectWithManagedIdentity(ctx context.Context, objectKey string, payload []byte, contentType string) error {
	client, err := h.mediaBlobStorageClient()
	if err != nil {
		return err
	}

	cacheControl := "public, max-age=31536000, immutable"
	_, err = client.UploadBuffer(ctx, h.media.config.storageContainer, objectKey, payload, &azblob.UploadBufferOptions{
		HTTPHeaders: &blob.HTTPHeaders{
			BlobContentType:  to.Ptr(contentType),
			BlobCacheControl: to.Ptr(cacheControl),
		},
	})
	if err != nil {
		return fmt.Errorf("upload media object via managed identity: %w", err)
	}

	return nil
}

func (h *Handler) processUploadedAsset(ctx context.Context, asset *store.MediaAsset) (*processedMediaResult, string, error) {
	if h.media.config.uploadBaseURL == "" && !h.hasManagedIdentityMediaStorage() {
		return nil, "", errors.New("MEDIA_UPLOAD_BASE_URL is not configured")
	}

	maxBytes := maxUploadBytesForKind(asset.Kind)
	payload, found, err := h.readMediaObject(ctx, asset.StorageKeyOriginal, maxBytes)
	if err != nil {
		return nil, "", err
	}
	if !found {
		return nil, "uploaded object not found", nil
	}

	if int64(len(payload)) > maxBytes {
		return nil, fmt.Sprintf("file exceeds max size of %d bytes", maxBytes), nil
	}

	detectedMIMEType := detectMIMEType(payload)
	if _, ok := allowedMediaMIMETypes[detectedMIMEType]; !ok {
		return nil, "unsupported image format", nil
	}

	if asset.MIMEType != "" && asset.MIMEType != detectedMIMEType {
		return nil, "uploaded content type does not match intent", nil
	}

	width, height, err := decodeImageDimensions(payload)
	if err != nil {
		return nil, "invalid image payload", nil
	}

	decodedImage, err := decodeImage(payload)
	if err != nil {
		return nil, "invalid image payload", nil
	}

	sum := sha256.Sum256(payload)
	contentHash := hex.EncodeToString(sum[:])
	variants := buildVariantKeys(asset)
	variantImages, err := buildVariantImages(decodedImage, asset)
	if err != nil {
		return nil, "", fmt.Errorf("build variant images: %w", err)
	}

	for variantName, encoded := range variantImages {
		objectKey, ok := variants[variantName]
		if !ok {
			return nil, "", fmt.Errorf("missing object key for variant %s", variantName)
		}
		if err := h.putMediaObject(ctx, objectKey, encoded, "image/png"); err != nil {
			return nil, "", err
		}
	}

	return &processedMediaResult{
		Variants:    variants,
		MIMEType:    detectedMIMEType,
		Width:       width,
		Height:      height,
		ByteSize:    int64(len(payload)),
		ContentHash: contentHash,
	}, "", nil
}

func (h *Handler) hasManagedIdentityMediaStorage() bool {
	return h.media.config.storageAccount != "" && h.media.config.storageContainer != ""
}

func (h *Handler) mediaBlobStorageClient() (*azblob.Client, error) {
	if !h.hasManagedIdentityMediaStorage() {
		return nil, errors.New("media storage account/container is not configured")
	}

	h.mediaBlobClientMu.Lock()
	defer h.mediaBlobClientMu.Unlock()

	if h.mediaBlobClient != nil {
		return h.mediaBlobClient, nil
	}

	serviceURL := fmt.Sprintf("https://%s.blob.core.windows.net/", h.media.config.storageAccount)

	var client *azblob.Client
	if h.media.config.storageAccountKey != "" {
		// Local dev: shared key auth — no managed identity or az login required.
		sharedKey, err := azblob.NewSharedKeyCredential(h.media.config.storageAccount, h.media.config.storageAccountKey)
		if err != nil {
			return nil, fmt.Errorf("create shared key credential: %w", err)
		}
		client, err = azblob.NewClientWithSharedKeyCredential(serviceURL, sharedKey, nil)
		if err != nil {
			h.log.Error("create blob client (shared key)", "service_url", serviceURL, "error", err)
			return nil, fmt.Errorf("create blob client: %w", err)
		}
	} else {
		// Staging/production: DefaultAzureCredential covers managed identity on
		// Azure and az login for local development without an account key.
		// The managed identity client ID is picked up automatically from
		// AZURE_CLIENT_ID, which the infra sets on the container app.
		cred, err := azidentity.NewDefaultAzureCredential(nil)
		if err != nil {
			h.log.Error("create azure credential", "error", err)
			return nil, fmt.Errorf("create azure credential: %w", err)
		}
		client, err = azblob.NewClient(serviceURL, cred, nil)
		if err != nil {
			h.log.Error("create blob client", "service_url", serviceURL, "error", err)
			return nil, fmt.Errorf("create blob client: %w", err)
		}
	}

	h.mediaBlobClient = client
	return h.mediaBlobClient, nil
}

func (h *Handler) readMediaObject(ctx context.Context, objectKey string, maxBytes int64) ([]byte, bool, error) {
	if h.hasManagedIdentityMediaStorage() {
		return h.readMediaObjectWithManagedIdentity(ctx, objectKey, maxBytes)
	}
	return h.readMediaObjectWithBaseURL(ctx, objectKey, maxBytes)
}

func (h *Handler) readMediaObjectWithManagedIdentity(ctx context.Context, objectKey string, maxBytes int64) ([]byte, bool, error) {
	client, err := h.mediaBlobStorageClient()
	if err != nil {
		return nil, false, err
	}

	resp, err := client.DownloadStream(ctx, h.media.config.storageContainer, objectKey, nil)
	if err != nil {
		if bloberror.HasCode(err, bloberror.BlobNotFound) {
			return nil, false, nil
		}
		return nil, false, fmt.Errorf("download media object via managed identity: %w", err)
	}
	defer resp.Body.Close()

	payload, err := io.ReadAll(io.LimitReader(resp.Body, maxBytes+1))
	if err != nil {
		return nil, false, fmt.Errorf("read uploaded object: %w", err)
	}

	return payload, true, nil
}

func (h *Handler) readMediaObjectWithBaseURL(ctx context.Context, objectKey string, maxBytes int64) ([]byte, bool, error) {
	objectURL, err := buildObjectURL(h.media.config.uploadBaseURL, objectKey)
	if err != nil {
		return nil, false, err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, objectURL, nil)
	if err != nil {
		return nil, false, fmt.Errorf("build object request: %w", err)
	}

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(request)
	if err != nil {
		return nil, false, fmt.Errorf("download media object: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		if resp.StatusCode == http.StatusNotFound {
			return nil, false, nil
		}
		return nil, false, fmt.Errorf("download media object: unexpected status %d", resp.StatusCode)
	}

	payload, err := io.ReadAll(io.LimitReader(resp.Body, maxBytes+1))
	if err != nil {
		return nil, false, fmt.Errorf("read uploaded object: %w", err)
	}

	return payload, true, nil
}
