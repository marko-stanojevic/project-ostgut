package metadata

import (
	"context"
	"encoding/binary"
	"fmt"
	"net/url"
	"strings"
	"time"
)

const maxVorbisReadBytes = 256 * 1024

func (f *Fetcher) fetchVorbis(ctx context.Context, streamURL string) (*NowPlaying, error) {
	body, err := f.fetchInitialBytes(ctx, streamURL, maxVorbisReadBytes)
	if err != nil {
		return nil, err
	}
	title, artist, ok := parseVorbisMetadata(body)
	if !ok || isPlaceholderTitle(title) {
		return nil, fmt.Errorf("%w: no vorbis comments", ErrEmptyMetadata)
	}
	song := title
	if splitArtist, splitSong := splitArtistTitle(title); artist == "" && splitArtist != "" {
		artist = splitArtist
		song = splitSong
	}
	return &NowPlaying{Title: title, Artist: artist, Song: song, Source: TypeVorbis, MetadataURL: streamURL, FetchedAt: time.Now()}, nil
}

func parseVorbisMetadata(data []byte) (title, artist string, ok bool) {
	if len(data) == 0 {
		return "", "", false
	}
	if title, artist, ok = parseVorbisCommentBlock(data, []byte{0x03, 'v', 'o', 'r', 'b', 'i', 's'}); ok {
		return title, artist, true
	}
	return parseVorbisCommentBlock(data, []byte("OpusTags"))
}

func parseVorbisCommentBlock(data []byte, marker []byte) (title, artist string, ok bool) {
	idx := indexBytes(data, marker)
	if idx < 0 {
		return "", "", false
	}
	offset := idx + len(marker)
	if offset+4 > len(data) {
		return "", "", false
	}
	vendorLen := int(binary.LittleEndian.Uint32(data[offset : offset+4]))
	offset += 4 + vendorLen
	if vendorLen < 0 || offset+4 > len(data) {
		return "", "", false
	}
	count := int(binary.LittleEndian.Uint32(data[offset : offset+4]))
	offset += 4
	if count < 0 || count > 1024 {
		return "", "", false
	}

	for i := 0; i < count; i++ {
		if offset+4 > len(data) {
			break
		}
		entryLen := int(binary.LittleEndian.Uint32(data[offset : offset+4]))
		offset += 4
		if entryLen < 0 || offset+entryLen > len(data) {
			break
		}
		entry := string(data[offset : offset+entryLen])
		offset += entryLen
		key, value, found := strings.Cut(entry, "=")
		if !found {
			continue
		}
		switch strings.ToUpper(strings.TrimSpace(key)) {
		case "TITLE", "SONGTITLE", "NOWPLAYING", "STREAMTITLE":
			if title == "" {
				title = normalizeMetadataTitle(value)
			}
		case "ARTIST", "ALBUMARTIST", "PERFORMER":
			if artist == "" {
				artist = strings.TrimSpace(value)
			}
		}
	}
	if title == "" && artist != "" {
		title = artist
	}
	return title, artist, title != ""
}

func isVorbisCandidate(streamURL string) bool {
	parsed, err := url.Parse(strings.TrimSpace(streamURL))
	if err != nil || parsed == nil {
		return false
	}
	path := strings.ToLower(parsed.Path)
	return strings.HasSuffix(path, ".ogg") || strings.HasSuffix(path, ".oga") || strings.HasSuffix(path, ".opus") ||
		strings.Contains(path, ".ogg/") || strings.Contains(path, ".oga/") || strings.Contains(path, ".opus/")
}
