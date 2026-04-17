package config

import (
	"strings"
	"testing"
)

func TestValidateGeneration(t *testing.T) {
	cases := []struct {
		name       string
		section    OpenAPIGenerationSection
		wantErr    bool
		wantSubstr string
	}{
		{
			name:    "disabled skips validation",
			section: OpenAPIGenerationSection{Enabled: false, WriteMode: "bogus"},
		},
		{
			name: "writeSourceMap requires output",
			section: OpenAPIGenerationSection{
				Enabled:        true,
				WriteSourceMap: true,
			},
			wantErr:    true,
			wantSubstr: "writeSourceMap",
		},
		{
			name: "writeMode onSave requires output",
			section: OpenAPIGenerationSection{
				Enabled:   true,
				WriteMode: "onSave",
			},
			wantErr:    true,
			wantSubstr: "onSave",
		},
		{
			name: "unknown writeMode rejected",
			section: OpenAPIGenerationSection{
				Enabled:   true,
				Output:    "openapi.yaml",
				WriteMode: "soon",
			},
			wantErr:    true,
			wantSubstr: "writeMode",
		},
		{
			name: "valid config",
			section: OpenAPIGenerationSection{
				Enabled:   true,
				Output:    "openapi.yaml",
				WriteMode: "onSave",
			},
		},
		{
			name: "negative debounce rejected",
			section: OpenAPIGenerationSection{
				Enabled:    true,
				Output:     "openapi.yaml",
				DebounceMs: -1,
			},
			wantErr:    true,
			wantSubstr: "debounceMs",
		},
		{
			name: "triggerMode validated",
			section: OpenAPIGenerationSection{
				Enabled:     true,
				Output:      "openapi.yaml",
				TriggerMode: "sometimes",
			},
			wantErr:    true,
			wantSubstr: "triggerMode",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			cfg := &Config{}
			cfg.Generation.OpenAPI = c.section
			err := cfg.validateGeneration()
			if c.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				if c.wantSubstr != "" && !strings.Contains(err.Error(), c.wantSubstr) {
					t.Errorf("error %q missing substring %q", err, c.wantSubstr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}
