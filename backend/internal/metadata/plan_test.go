package metadata

import "testing"

func TestBuildStreamPlanClientDirectReadable(t *testing.T) {
	plan := BuildStreamPlan(StreamPlanInput{
		Enabled:   true,
		Resolver:  ResolverClient,
		Kind:      "direct",
		Container: "none",
		Type:      TypeAuto,
		StreamURL: "https://radio.example/stream",
	})

	if plan.Delivery != DeliveryClientPoll {
		t.Fatalf("expected client-poll delivery, got %q", plan.Delivery)
	}
	if !plan.SupportsClient || plan.SupportsServer != true {
		t.Fatalf("expected client=true server=true, got client=%t server=%t", plan.SupportsClient, plan.SupportsServer)
	}
	if !plan.RequiresClientConnectSrc {
		t.Fatalf("expected connect-src requirement for direct client metadata")
	}
	if plan.Reason != PlanReasonBrowserReadableStream {
		t.Fatalf("expected browser-readable-stream reason, got %q", plan.Reason)
	}
}

func TestBuildStreamPlanClientHLSID3(t *testing.T) {
	plan := BuildStreamPlan(StreamPlanInput{
		Enabled:   true,
		Resolver:  ResolverClient,
		Kind:      "hls",
		Container: "m3u8",
		Type:      TypeHLS,
	})

	if plan.Delivery != DeliveryHLSID3 {
		t.Fatalf("expected hls-id3 delivery, got %q", plan.Delivery)
	}
	if plan.RequiresClientConnectSrc {
		t.Fatalf("did not expect connect-src requirement for HLS ID3 path")
	}
	if plan.Reason != PlanReasonHLSID3 {
		t.Fatalf("expected hls-id3 reason, got %q", plan.Reason)
	}
}

func TestBuildStreamPlanServerDefault(t *testing.T) {
	plan := BuildStreamPlan(StreamPlanInput{
		Enabled:   true,
		Resolver:  ResolverServer,
		Kind:      "direct",
		Container: "none",
		Type:      TypeAuto,
	})

	if plan.Delivery != DeliverySSE {
		t.Fatalf("expected sse delivery, got %q", plan.Delivery)
	}
	if plan.PressureClass != PressureServerLive {
		t.Fatalf("expected server-live pressure, got %q", plan.PressureClass)
	}
	if plan.Reason != PlanReasonServerDefault {
		t.Fatalf("expected server-default reason, got %q", plan.Reason)
	}
}

func TestBuildStreamPlanSupplementalProvider(t *testing.T) {
	plan := BuildStreamPlan(StreamPlanInput{
		Enabled:  true,
		Resolver: ResolverServer,
		Kind:     "direct",
		Provider: ProviderNPRComposer,
	})

	if plan.Delivery != DeliverySSE {
		t.Fatalf("expected sse delivery, got %q", plan.Delivery)
	}
	if plan.Reason != PlanReasonSupplementalProvider {
		t.Fatalf("expected supplemental-provider reason, got %q", plan.Reason)
	}
	if plan.SupplementalProvider != ProviderNPRComposer {
		t.Fatalf("expected supplemental provider %q, got %q", ProviderNPRComposer, plan.SupplementalProvider)
	}
}

func TestBuildStreamPlanDisabled(t *testing.T) {
	plan := BuildStreamPlan(StreamPlanInput{Enabled: false, Resolver: ResolverClient, Kind: "direct"})
	if plan.Resolver != ResolverNone {
		t.Fatalf("expected none resolver, got %q", plan.Resolver)
	}
	if plan.Reason != PlanReasonDisabled {
		t.Fatalf("expected disabled reason, got %q", plan.Reason)
	}
}

func TestBuildStreamPlanDirectResolverNoneUsesMetadataUnavailableReason(t *testing.T) {
	plan := BuildStreamPlan(StreamPlanInput{
		Enabled:   true,
		Resolver:  ResolverNone,
		Kind:      "direct",
		Container: "none",
		Type:      TypeAuto,
	})

	if plan.Delivery != DeliveryNone {
		t.Fatalf("expected none delivery, got %q", plan.Delivery)
	}
	if plan.Reason != PlanReasonMetadataUnavailable {
		t.Fatalf("expected metadata-unavailable reason, got %q", plan.Reason)
	}
}

func TestBuildStreamPlanUnknownResolverUsesUnclassifiedReason(t *testing.T) {
	plan := BuildStreamPlan(StreamPlanInput{
		Enabled:   true,
		Resolver:  ResolverUnknown,
		Kind:      "direct",
		Container: "none",
		Type:      TypeAuto,
	})

	if plan.Delivery != DeliveryNone {
		t.Fatalf("expected none delivery, got %q", plan.Delivery)
	}
	if plan.Reason != PlanReasonUnclassified {
		t.Fatalf("expected unclassified reason, got %q", plan.Reason)
	}
}
