package radio

import "testing"

func TestParseLoudnormOutput(t *testing.T) {
	stdout := `[Parsed_loudnorm_0 @ 0x123]
{
  "input_i" : "-19.4",
  "input_tp" : "-1.2"
}`

	lufs, peak, ok := parseLoudnormOutput(stdout)
	if !ok {
		t.Fatalf("expected parser to succeed")
	}
	if lufs == nil || *lufs != -19.4 {
		t.Fatalf("expected integrated LUFS -19.4, got %#v", lufs)
	}
	if peak == nil || *peak != -1.2 {
		t.Fatalf("expected peak -1.2, got %#v", peak)
	}
}
