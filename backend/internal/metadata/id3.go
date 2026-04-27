package metadata

import (
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf16"
)

const maxID3ReadBytes = 128 * 1024

func (f *Fetcher) fetchID3(ctx context.Context, streamURL string) (*NowPlaying, error) {
	body, err := f.fetchInitialBytes(ctx, streamURL, maxID3ReadBytes)
	if err != nil {
		return nil, err
	}
	title, artist, song, ok := parseID3Metadata(body)
	if !ok || isPlaceholderTitle(title) {
		return nil, fmt.Errorf("%w: no id3 title", ErrEmptyMetadata)
	}
	if artist == "" || song == "" {
		splitArtist, splitSong := splitArtistTitle(title)
		if artist == "" {
			artist = splitArtist
		}
		if song == "" {
			song = splitSong
		}
	}
	return &NowPlaying{Title: title, Artist: artist, Song: song, Source: TypeID3, MetadataURL: streamURL, FetchedAt: time.Now()}, nil
}

func (f *Fetcher) fetchInitialBytes(ctx context.Context, streamURL string, limit int64) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, streamURL, nil)
	if err != nil {
		return nil, err
	}
	req.Close = true
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Range", fmt.Sprintf("bytes=0-%d", limit-1))
	req.Header.Set("Connection", "close")

	resp, err := f.jsonClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		return nil, fmt.Errorf("%w: initial bytes status %d", ErrUpstreamStatus, resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, limit))
	if err != nil {
		return nil, err
	}
	return body, nil
}

func parseID3Metadata(data []byte) (title, artist, song string, ok bool) {
	if len(data) < 10 || string(data[:3]) != "ID3" {
		return "", "", "", false
	}
	version := int(data[3])
	tagSize := readID3Synchsafe(data[6:10])
	if tagSize <= 0 {
		return "", "", "", false
	}
	end := 10 + tagSize
	if end > len(data) {
		end = len(data)
	}

	for offset := 10; offset < end; {
		frameID, frameSize, headerSize, nextOK := readID3FrameHeader(data[offset:end], version)
		if !nextOK || frameSize <= 0 || offset+headerSize+frameSize > end {
			break
		}
		frame := data[offset+headerSize : offset+headerSize+frameSize]
		switch frameID {
		case "TIT2", "TT2":
			if value := decodeID3TextFrame(frame); value != "" {
				title = value
			}
		case "TPE1", "TP1":
			if value := decodeID3TextFrame(frame); value != "" {
				artist = value
			}
		case "TXXX", "TXX":
			description, value := decodeID3UserTextFrame(frame)
			if value == "" {
				break
			}
			normalized := strings.ToLower(description)
			if title == "" && (strings.Contains(normalized, "title") || strings.Contains(normalized, "song") || strings.Contains(normalized, "stream")) {
				title = value
			}
			if artist == "" && strings.Contains(normalized, "artist") {
				artist = value
			}
		}
		offset += headerSize + frameSize
	}

	if title == "" && artist != "" && song != "" {
		title = artist + " - " + song
	}
	if title == "" && artist != "" {
		title = artist
	}
	title = normalizeMetadataTitle(title)
	return title, strings.TrimSpace(artist), strings.TrimSpace(song), title != ""
}

func readID3FrameHeader(data []byte, version int) (id string, size int, headerSize int, ok bool) {
	if version == 2 {
		if len(data) < 6 {
			return "", 0, 0, false
		}
		id = strings.TrimRight(string(data[:3]), "\x00")
		if strings.TrimSpace(id) == "" {
			return "", 0, 0, false
		}
		size = int(data[3])<<16 | int(data[4])<<8 | int(data[5])
		return id, size, 6, true
	}
	if len(data) < 10 {
		return "", 0, 0, false
	}
	id = strings.TrimRight(string(data[:4]), "\x00")
	if strings.TrimSpace(id) == "" {
		return "", 0, 0, false
	}
	if version == 4 {
		size = readID3Synchsafe(data[4:8])
	} else {
		size = int(binary.BigEndian.Uint32(data[4:8]))
	}
	return id, size, 10, true
}

func decodeID3TextFrame(frame []byte) string {
	if len(frame) <= 1 {
		return ""
	}
	return cleanTextValue(decodeID3Text(frame[0], frame[1:]))
}

func decodeID3UserTextFrame(frame []byte) (description, value string) {
	if len(frame) <= 1 {
		return "", ""
	}
	encoding := frame[0]
	body := frame[1:]
	separator := []byte{0}
	if encoding == 1 || encoding == 2 {
		separator = []byte{0, 0}
	}
	idx := indexBytes(body, separator)
	if idx == -1 {
		return "", cleanTextValue(decodeID3Text(encoding, body))
	}
	return cleanTextValue(decodeID3Text(encoding, body[:idx])), cleanTextValue(decodeID3Text(encoding, body[idx+len(separator):]))
}

func decodeID3Text(encoding byte, body []byte) string {
	switch encoding {
	case 1:
		return decodeUTF16(body, true)
	case 2:
		return decodeUTF16(body, false)
	case 3:
		return string(body)
	default:
		runes := make([]rune, 0, len(body))
		for _, b := range body {
			runes = append(runes, rune(b))
		}
		return string(runes)
	}
}

func decodeUTF16(body []byte, allowBOM bool) string {
	if len(body) < 2 {
		return ""
	}
	var order binary.ByteOrder = binary.BigEndian
	if allowBOM && len(body) >= 2 {
		switch {
		case body[0] == 0xff && body[1] == 0xfe:
			order = binary.LittleEndian
			body = body[2:]
		case body[0] == 0xfe && body[1] == 0xff:
			order = binary.BigEndian
			body = body[2:]
		}
	}
	units := make([]uint16, 0, len(body)/2)
	for i := 0; i+1 < len(body); i += 2 {
		units = append(units, order.Uint16(body[i:i+2]))
	}
	return string(utf16.Decode(units))
}

func readID3Synchsafe(data []byte) int {
	if len(data) < 4 {
		return 0
	}
	return int(data[0]&0x7f)<<21 | int(data[1]&0x7f)<<14 | int(data[2]&0x7f)<<7 | int(data[3]&0x7f)
}

func cleanTextValue(value string) string {
	value = strings.ReplaceAll(value, "\x00", "")
	return normalizeMetadataTitle(value)
}

func indexBytes(data []byte, needle []byte) int {
	if len(needle) == 0 || len(data) < len(needle) {
		return -1
	}
	for i := 0; i <= len(data)-len(needle); i++ {
		match := true
		for j := range needle {
			if data[i+j] != needle[j] {
				match = false
				break
			}
		}
		if match {
			return i
		}
	}
	return -1
}

func isID3Candidate(streamURL string) bool {
	parsed, err := url.Parse(strings.TrimSpace(streamURL))
	if err != nil || parsed == nil {
		return false
	}
	path := strings.ToLower(parsed.Path)
	return strings.HasSuffix(path, ".mp3") || strings.Contains(path, ".mp3/")
}
