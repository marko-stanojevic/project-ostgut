package metadata

import "strings"

const (
	ResolverNone   = "none"
	ResolverServer = "server"
	ResolverClient = "client"

	DeliveryNone       = "none"
	DeliverySSE        = "sse"
	DeliveryClientPoll = "client-poll"
	DeliveryHLSID3     = "hls-id3"

	PressureNone       = "none"
	PressureClient     = "client"
	PressureServerLive = "server-live"

	PlanReasonDisabled              = "disabled"
	PlanReasonServerDefault         = "server-default"
	PlanReasonBrowserReadableStream = "browser-readable-stream"
	PlanReasonBrowserMetadataURL    = "browser-readable-metadata-endpoint"
	PlanReasonHLSID3                = "hls-id3"
	PlanReasonUnsupportedKind       = "unsupported-kind"
	PlanReasonSupplementalProvider  = "supplemental-provider"
)

type StreamPlanInput struct {
	Enabled     bool
	Type        string
	SourceHint  string
	MetadataURL string
	Resolver    string
	Kind        string
	Container   string
	StreamURL   string
	Provider    string
}

type StreamPlan struct {
	Resolver                 string `json:"resolver"`
	Delivery                 string `json:"delivery"`
	PreferredStrategy        string `json:"preferred_strategy"`
	SupportsClient           bool   `json:"supports_client"`
	SupportsServer           bool   `json:"supports_server"`
	SupportsServerSnapshot   bool   `json:"supports_server_snapshot"`
	RequiresClientConnectSrc bool   `json:"requires_client_connect_src"`
	PressureClass            string `json:"pressure_class"`
	Reason                   string `json:"reason"`
	SupplementalProvider     string `json:"supplemental_provider,omitempty"`
}

func BuildStreamPlan(in StreamPlanInput) StreamPlan {
	resolver := normalizeResolver(in.Enabled, in.Resolver)
	kind := strings.ToLower(strings.TrimSpace(in.Kind))
	container := strings.ToLower(strings.TrimSpace(in.Container))
	preferredStrategy := planPreferredStrategy(in.Type, in.SourceHint, in.MetadataURL)
	metadataURL := strings.TrimSpace(in.MetadataURL)
	streamURL := strings.TrimSpace(in.StreamURL)

	plan := StreamPlan{
		Resolver:                 resolver,
		Delivery:                 DeliveryNone,
		PreferredStrategy:        preferredStrategy,
		SupportsServerSnapshot:   in.Enabled,
		RequiresClientConnectSrc: false,
		PressureClass:            PressureNone,
		Reason:                   PlanReasonUnsupportedKind,
		SupplementalProvider:     normalizeProvider(in.Provider),
	}

	if !in.Enabled {
		plan.Reason = PlanReasonDisabled
		return plan
	}

	supportsServer := kind == "direct" || kind == "playlist"
	plan.SupportsServer = supportsServer

	switch resolver {
	case ResolverClient:
		plan.SupportsClient = true
		plan.PressureClass = PressureClient
		if kind == "hls" {
			plan.Delivery = DeliveryHLSID3
			plan.RequiresClientConnectSrc = false
			plan.Reason = PlanReasonHLSID3
			return plan
		}
		plan.Delivery = DeliveryClientPoll
		plan.RequiresClientConnectSrc = true
		if metadataURL != "" && !strings.EqualFold(metadataURL, streamURL) {
			plan.Reason = PlanReasonBrowserMetadataURL
		} else {
			plan.Reason = PlanReasonBrowserReadableStream
		}
		return plan
	case ResolverServer:
		if supportsServer {
			plan.Delivery = DeliverySSE
			plan.PressureClass = PressureServerLive
			if plan.SupplementalProvider != "" {
				plan.Reason = PlanReasonSupplementalProvider
			} else {
				plan.Reason = PlanReasonServerDefault
			}
			return plan
		}
	}

	if kind == "hls" {
		plan.Reason = PlanReasonHLSID3
	} else if kind == "dash" || container == "mpd" {
		plan.Reason = PlanReasonUnsupportedKind
	}
	return plan
}

func normalizeResolver(enabled bool, resolver string) string {
	if !enabled {
		return ResolverNone
	}
	switch strings.ToLower(strings.TrimSpace(resolver)) {
	case ResolverClient:
		return ResolverClient
	case ResolverNone:
		return ResolverNone
	default:
		return ResolverServer
	}
}

func planPreferredStrategy(metadataType, sourceHint, metadataURL string) string {
	if normalized := normalizeType(metadataType); normalized != "" && normalized != TypeAuto {
		return normalized
	}
	if normalized := normalizeType(sourceHint); normalized != "" && normalized != TypeAuto {
		return normalized
	}
	if hinted := hintedMetadataKind(metadataURL, sourceHint); hinted != "" {
		return hinted
	}
	return TypeAuto
}
