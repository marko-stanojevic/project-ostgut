package metadata

import "strings"

// Config describes the persisted metadata configuration for a stream.
// Probe-time behavior (delayed-ICY detection) is NOT carried here — it is
// implicit in the choice of Fetch vs Probe.
type Config struct {
	Enabled     bool
	Type        string // auto | icy | icecast | shoutcast
	SourceHint  string // last successful source, if known
	MetadataURL string // exact successful metadata endpoint, if known
	DelayedICY  bool   // stream has previously needed the extended ICY budget
}

func normalizeType(raw string) string {
	v := strings.ToLower(strings.TrimSpace(raw))
	switch v {
	case "", TypeAuto:
		return TypeAuto
	case TypeICY, TypeIcecast, TypeShoutcast:
		return v
	default:
		return TypeAuto
	}
}
