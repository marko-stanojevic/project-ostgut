package radio

import (
	"bytes"
	"context"
	"encoding/json"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

const minLoudnessProbeBytes = 24 * 1024

type LoudnessMeasurement struct {
	IntegratedLUFS *float64
	PeakDBFS       *float64
	SampleDuration float64
	MeasuredAt     *time.Time
	Status         string
}

func MeasureSampleLoudness(ctx context.Context, sample []byte, bitrateKbps int) LoudnessMeasurement {
	if len(sample) < minLoudnessProbeBytes {
		return LoudnessMeasurement{
			SampleDuration: estimateSampleDurationSeconds(len(sample), bitrateKbps),
			Status:         "insufficient_sample",
		}
	}
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		return LoudnessMeasurement{
			SampleDuration: estimateSampleDurationSeconds(len(sample), bitrateKbps),
			Status:         "unavailable",
		}
	}

	cmd := exec.CommandContext(
		ctx,
		"ffmpeg",
		"-hide_banner",
		"-nostdin",
		"-i", "pipe:0",
		"-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
		"-f", "null",
		"-",
	)
	cmd.Stdin = bytes.NewReader(sample)

	var stderr bytes.Buffer
	cmd.Stdout = nil
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return LoudnessMeasurement{
			SampleDuration: estimateSampleDurationSeconds(len(sample), bitrateKbps),
			Status:         "failed",
		}
	}

	integratedLUFS, peakDBFS, ok := parseLoudnormOutput(stderr.String())
	if !ok {
		return LoudnessMeasurement{
			SampleDuration: estimateSampleDurationSeconds(len(sample), bitrateKbps),
			Status:         "failed",
		}
	}

	measuredAt := time.Now().UTC()
	return LoudnessMeasurement{
		IntegratedLUFS: integratedLUFS,
		PeakDBFS:       peakDBFS,
		SampleDuration: estimateSampleDurationSeconds(len(sample), bitrateKbps),
		MeasuredAt:     &measuredAt,
		Status:         "measured",
	}
}

func estimateSampleDurationSeconds(bytesRead int, bitrateKbps int) float64 {
	if bytesRead <= 0 || bitrateKbps <= 0 {
		return 0
	}
	return float64(bytesRead*8) / float64(bitrateKbps*1000)
}

func parseLoudnormOutput(output string) (integratedLUFS *float64, peakDBFS *float64, ok bool) {
	start := strings.Index(output, "{")
	end := strings.LastIndex(output, "}")
	if start < 0 || end <= start {
		return nil, nil, false
	}

	var payload struct {
		InputI  string `json:"input_i"`
		InputTP string `json:"input_tp"`
	}
	if err := json.Unmarshal([]byte(output[start:end+1]), &payload); err != nil {
		return nil, nil, false
	}

	lufs, err := strconv.ParseFloat(strings.TrimSpace(payload.InputI), 64)
	if err != nil {
		return nil, nil, false
	}
	peak, err := strconv.ParseFloat(strings.TrimSpace(payload.InputTP), 64)
	if err != nil {
		return nil, nil, false
	}
	return &lufs, &peak, true
}
