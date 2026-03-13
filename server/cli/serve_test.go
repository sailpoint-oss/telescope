package cli

import (
	"log/slog"
	"testing"
)

func TestParseServeLogLevel(t *testing.T) {
	tests := []struct {
		name      string
		flagLevel string
		envLevel  string
		want      slog.Level
	}{
		{name: "default info", want: slog.LevelInfo},
		{name: "env debug", envLevel: "debug", want: slog.LevelDebug},
		{name: "env warn alias", envLevel: "warning", want: slog.LevelWarn},
		{name: "flag overrides env", flagLevel: "error", envLevel: "debug", want: slog.LevelError},
		{name: "invalid falls back to info", envLevel: "nope", want: slog.LevelInfo},
		{name: "flag whitespace", flagLevel: "  warn ", want: slog.LevelWarn},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseServeLogLevel(tt.flagLevel, tt.envLevel)
			if got != tt.want {
				t.Fatalf("parseServeLogLevel(%q,%q)=%v, want %v", tt.flagLevel, tt.envLevel, got, tt.want)
			}
		})
	}
}
