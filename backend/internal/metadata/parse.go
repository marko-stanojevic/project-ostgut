package metadata

import "strings"

// extractICYField parses a named value from an ICY metadata string.
//
// ICY format: Key1='value1';Key2='value2';
//
// The spec has no escape mechanism for embedded single quotes. We treat
// `';` (single-quote immediately followed by semicolon) as the only authoritative
// terminator — this handles values like `O'Brien - Untitled` correctly, where
// a naive "first single quote" parser would truncate at the apostrophe.
//
// When the field has no trailing `';` (last field on a server that omits it),
// we fall back to scanning forward for the next `Key=` start; if none, take
// to end-of-string and trim a single trailing quote.
func extractICYField(meta, key string) string {
	prefix := key + "='"
	for i := 0; i < len(meta); {
		idx := strings.Index(meta[i:], prefix)
		if idx == -1 {
			return ""
		}
		start := i + idx + len(prefix)

		// Strict terminator: `';`
		if end := strings.Index(meta[start:], "';"); end != -1 {
			return meta[start : start+end]
		}

		// No `';` — accept this match if no other key follows; otherwise look
		// for a token that looks like a new ICY key starting (`;Key=`).
		rest := meta[start:]
		if next := indexOfNextICYKey(rest); next != -1 {
			val := strings.TrimRight(rest[:next], "'")
			return val
		}
		// End-of-string: strip one trailing quote, if any.
		return strings.TrimRight(rest, "'")
	}
	return ""
}

// indexOfNextICYKey finds the offset within s where a new ICY field begins,
// signalled by a `;` followed by an identifier and `='`. Returns -1 if none.
func indexOfNextICYKey(s string) int {
	off := 0
	for {
		i := strings.Index(s[off:], ";")
		if i == -1 {
			return -1
		}
		k := off + i + 1
		// Identifier characters: ASCII letters, digits, '_', '-'.
		j := k
		for j < len(s) && isICYKeyByte(s[j]) {
			j++
		}
		if j > k && j+1 < len(s) && s[j] == '=' && s[j+1] == '\'' {
			return off + i
		}
		off = k
	}
}

func isICYKeyByte(b byte) bool {
	switch {
	case b >= 'A' && b <= 'Z':
		return true
	case b >= 'a' && b <= 'z':
		return true
	case b >= '0' && b <= '9':
		return true
	case b == '_' || b == '-':
		return true
	}
	return false
}

// normalizeMetadataTitle strips trailing separator garbage that some servers
// emit (e.g. "Artist - Song -"). Operates in O(n) with no inner re-scan.
func normalizeMetadataTitle(s string) string {
	s = strings.TrimSpace(s)
	for len(s) > 0 {
		switch {
		case strings.HasSuffix(s, " -"):
			s = strings.TrimRight(s[:len(s)-2], " ")
		case strings.HasSuffix(s, " –"):
			s = strings.TrimRight(s[:len(s)-len(" –")], " ")
		case strings.HasSuffix(s, " —"):
			s = strings.TrimRight(s[:len(s)-len(" —")], " ")
		default:
			return s
		}
	}
	return s
}

// splitArtistTitle splits "Artist - Title" into its components. Returns
// ("", fullTitle) when no recognised delimiter is found.
func splitArtistTitle(s string) (artist, song string) {
	s = normalizeMetadataTitle(s)
	if a, t, ok := parseQuotedBylineTitle(s); ok {
		return a, t
	}
	for _, sep := range []string{" - ", " – ", " — "} {
		if idx := strings.Index(s, sep); idx != -1 {
			return strings.TrimSpace(s[:idx]), strings.TrimSpace(s[idx+len(sep):])
		}
	}
	return "", s
}

// parseQuotedBylineTitle handles the WFMU/RBN shape:
//
//	"Some Song" by Some Artist on Some Show on Some Station
//
// The closing quote must be immediately followed by " by " — otherwise the
// leading quote is treated as part of the title (e.g. apostrophe contractions
// like 'Cause I Said So fall through to the dash-split path).
func parseQuotedBylineTitle(s string) (artist, song string, ok bool) {
	for _, quote := range []string{`"`, "“", "'"} {
		if !strings.HasPrefix(s, quote) {
			continue
		}
		rest := s[len(quote):]
		end := strings.Index(rest, quote)
		if end == -1 {
			continue
		}
		song = strings.TrimSpace(rest[:end])
		if song == "" {
			continue
		}

		byline := strings.TrimSpace(rest[end+len(quote):])
		if len(byline) < 3 || !strings.EqualFold(byline[:3], "by ") {
			continue
		}

		artist = strings.TrimSpace(byline[3:])
		if idx := strings.Index(strings.ToLower(artist), " on "); idx != -1 {
			artist = strings.TrimSpace(artist[:idx])
		}
		if artist == "" {
			continue
		}
		return artist, song, true
	}
	return "", "", false
}

// stripHTML removes HTML tags and decodes a small set of common entities.
func stripHTML(s string) string {
	var b strings.Builder
	inTag := false
	for _, r := range s {
		switch {
		case r == '<':
			inTag = true
		case r == '>':
			inTag = false
		case !inTag:
			b.WriteRune(r)
		}
	}
	result := strings.NewReplacer(
		"&amp;", "&",
		"&lt;", "<",
		"&gt;", ">",
		"&quot;", `"`,
		"&#039;", "'",
	).Replace(b.String())
	return strings.TrimSpace(result)
}

// placeholderTitles is the canonical list of strings servers emit to mean
// "no metadata". Comparison is case-insensitive and strips wrapping quotes.
var placeholderTitles = []string{
	"", "-", "--", "---", ".", "..", "n/a", "na", "null", "undefined", "unknown",
}

// isPlaceholderTitle reports whether a title is a known no-op string.
func isPlaceholderTitle(s string) bool {
	s = strings.TrimSpace(s)
	s = strings.Trim(s, `"'“”`)
	s = strings.TrimSpace(s)
	for _, p := range placeholderTitles {
		if strings.EqualFold(s, p) {
			return true
		}
	}
	return false
}
