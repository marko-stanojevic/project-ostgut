package radio

import (
	"context"
	"net/http"
	"strings"
	"time"
)

const metadataRouteProbeTimeout = 8 * time.Second

type MetadataRouteInput struct {
	StreamURL       string
	MetadataURLHint string
	Kind            string
	Container       string
	MetadataEnabled bool
	MetadataType    string
}

type MetadataRouteResult struct {
	Resolver    string
	MetadataURL *string
	CheckedAt   time.Time
	Kind        string
	Container   string
}

type MetadataRouter struct {
	client  *http.Client
	origins []string
}

func NewMetadataRouter(client *http.Client, origins []string) *MetadataRouter {
	if client == nil {
		client = &http.Client{Timeout: metadataRouteProbeTimeout}
	}
	return &MetadataRouter{
		client:  client,
		origins: append([]string(nil), origins...),
	}
}

func (r *MetadataRouter) Classify(ctx context.Context, input MetadataRouteInput) MetadataRouteResult {
	result := MetadataRouteResult{
		Resolver:  "none",
		CheckedAt: time.Now().UTC(),
		Kind:      strings.TrimSpace(input.Kind),
		Container: strings.TrimSpace(input.Container),
	}
	if !input.MetadataEnabled {
		return result
	}

	streamURL := strings.TrimSpace(input.StreamURL)
	if streamURL == "" {
		result.Resolver = "server"
		return result
	}

	if result.Kind == "" || result.Container == "" {
		classified := LightClassifyStreamURL(streamURL)
		if result.Kind == "" {
			result.Kind = strings.TrimSpace(classified.Kind)
		}
		if result.Container == "" {
			result.Container = strings.TrimSpace(classified.Container)
		}
	}
	if result.Kind == "" {
		result.Kind = "direct"
	}
	if result.Container == "" {
		result.Container = "none"
	}

	probeCtx, cancel := context.WithTimeout(ctx, metadataRouteProbeTimeout)
	defer cancel()

	clientMetadata := ProbeClientMetadataSupport(
		probeCtx,
		r.client,
		r.origins,
		streamURL,
		strings.TrimSpace(input.MetadataURLHint),
		result.Kind,
		result.Container,
		input.MetadataEnabled,
		input.MetadataType,
	)
	if !clientMetadata.CheckedAt.IsZero() {
		result.CheckedAt = clientMetadata.CheckedAt
	}

	hlsID3Supported := false
	if input.MetadataEnabled && strings.EqualFold(result.Kind, "hls") {
		hlsID3Supported = ProbeHLSID3Support(probeCtx, r.client, streamURL)
	}

	result.Resolver = ResolveMetadataResolverForStream(input.MetadataEnabled, result.Kind, clientMetadata.Supported, hlsID3Supported)
	if metadataURL := normalizeMetadataValue(clientMetadata.MetadataURL); metadataURL != nil {
		result.MetadataURL = metadataURL
	} else if strings.EqualFold(result.Resolver, "client") && strings.EqualFold(result.Kind, "hls") {
		result.MetadataURL = normalizeMetadataValue(streamURL)
	}

	return result
}
