package config_test

import (
	"testing"

	"github.com/sailpoint-oss/telescope/server/config"
)

// --- HasCustomRules ---

func TestHasCustomRules(t *testing.T) {
	tests := []struct {
		name string
		cfg  config.Config
		want bool
	}{
		{
			name: "no rules anywhere",
			cfg:  config.Config{},
			want: false,
		},
		{
			name: "openapi rules present",
			cfg: config.Config{
				OpenAPI: config.OpenAPIConfig{
					Rules: []config.RuleRef{{Rule: "custom.ts"}},
				},
			},
			want: true,
		},
		{
			name: "additional validation rules present",
			cfg: config.Config{
				AdditionalValidation: map[string]config.ValidationGroup{
					"extra": {Rules: []config.RuleRef{{Rule: "extra.ts"}}},
				},
			},
			want: true,
		},
		{
			name: "additional validation with empty rules",
			cfg: config.Config{
				AdditionalValidation: map[string]config.ValidationGroup{
					"empty": {Patterns: []string{"*.yaml"}},
				},
			},
			want: false,
		},
		{
			name: "both openapi and additional",
			cfg: config.Config{
				OpenAPI: config.OpenAPIConfig{
					Rules: []config.RuleRef{{Rule: "a.ts"}},
				},
				AdditionalValidation: map[string]config.ValidationGroup{
					"b": {Rules: []config.RuleRef{{Rule: "b.ts"}}},
				},
			},
			want: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.cfg.HasCustomRules(); got != tt.want {
				t.Errorf("HasCustomRules() = %v, want %v", got, tt.want)
			}
		})
	}
}

// --- EffectiveGuidelinesBaseURL ---

func TestEffectiveGuidelinesBaseURL(t *testing.T) {
	tests := []struct {
		name    string
		cfg     *config.Config
		wantEnd string // suffix the result must end with
	}{
		{
			name:    "nil config falls back to barrelman default",
			cfg:     nil,
			wantEnd: "/",
		},
		{
			name:    "empty string falls back",
			cfg:     &config.Config{GuidelinesBaseURL: ""},
			wantEnd: "/",
		},
		{
			name:    "whitespace-only falls back",
			cfg:     &config.Config{GuidelinesBaseURL: "   "},
			wantEnd: "/",
		},
		{
			name:    "custom URL with trailing slash",
			cfg:     &config.Config{GuidelinesBaseURL: "https://example.com/docs/"},
			wantEnd: "https://example.com/docs/",
		},
		{
			name:    "custom URL without trailing slash gets one",
			cfg:     &config.Config{GuidelinesBaseURL: "https://example.com/docs"},
			wantEnd: "https://example.com/docs/",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.cfg.EffectiveGuidelinesBaseURL()
			if got == "" {
				t.Fatal("EffectiveGuidelinesBaseURL() returned empty string")
			}
			if got[len(got)-1] != '/' {
				t.Errorf("result %q does not end with /", got)
			}
			if tt.wantEnd != "/" && got != tt.wantEnd {
				t.Errorf("got %q, want %q", got, tt.wantEnd)
			}
		})
	}
}

// --- EffectiveConcurrency ---

func TestEffectiveConcurrency(t *testing.T) {
	tests := []struct {
		name string
		cfg  *config.ContractTestsConfig
		want int
	}{
		{name: "nil config", cfg: nil, want: 2},
		{name: "zero value", cfg: &config.ContractTestsConfig{}, want: 2},
		{name: "negative value", cfg: &config.ContractTestsConfig{Concurrency: -1}, want: 2},
		{name: "explicit 1", cfg: &config.ContractTestsConfig{Concurrency: 1}, want: 1},
		{name: "explicit 8", cfg: &config.ContractTestsConfig{Concurrency: 8}, want: 8},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.cfg.EffectiveConcurrency(); got != tt.want {
				t.Errorf("EffectiveConcurrency() = %d, want %d", got, tt.want)
			}
		})
	}
}

// --- EffectiveEnvFiles ---

func TestEffectiveEnvFiles(t *testing.T) {
	defaults := []string{".env", ".env.local"}

	tests := []struct {
		name string
		cfg  *config.ContractTestsConfig
		want []string
	}{
		{name: "nil config", cfg: nil, want: defaults},
		{name: "empty list", cfg: &config.ContractTestsConfig{EnvFiles: []string{}}, want: defaults},
		{name: "whitespace-only entries", cfg: &config.ContractTestsConfig{EnvFiles: []string{"  ", "\t"}}, want: defaults},
		{name: "custom files", cfg: &config.ContractTestsConfig{EnvFiles: []string{".env.staging"}}, want: []string{".env.staging"}},
		{
			name: "mixed valid and whitespace",
			cfg:  &config.ContractTestsConfig{EnvFiles: []string{"  ", ".env.prod", " "}},
			want: []string{".env.prod"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.cfg.EffectiveEnvFiles()
			if len(got) != len(tt.want) {
				t.Fatalf("len = %d, want %d: %v", len(got), len(tt.want), got)
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Errorf("[%d] = %q, want %q", i, got[i], tt.want[i])
				}
			}
		})
	}
}

// --- EffectiveContractBaseURL ---

func TestEffectiveContractBaseURL(t *testing.T) {
	tests := []struct {
		name     string
		cfg      *config.ContractTestsConfig
		explicit string
		want     string
	}{
		{name: "nil config no explicit", cfg: nil, explicit: "", want: "http://localhost:8080"},
		{name: "explicit overrides all", cfg: &config.ContractTestsConfig{DefaultBaseURL: "https://cfg.example.com"}, explicit: "https://arg.example.com", want: "https://arg.example.com"},
		{name: "config default used", cfg: &config.ContractTestsConfig{DefaultBaseURL: "https://cfg.example.com"}, explicit: "", want: "https://cfg.example.com"},
		{name: "whitespace explicit ignored", cfg: &config.ContractTestsConfig{DefaultBaseURL: "https://cfg.example.com"}, explicit: "  ", want: "https://cfg.example.com"},
		{name: "whitespace config default ignored", cfg: &config.ContractTestsConfig{DefaultBaseURL: "  "}, explicit: "", want: "http://localhost:8080"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.cfg.EffectiveContractBaseURL(tt.explicit); got != tt.want {
				t.Errorf("EffectiveContractBaseURL(%q) = %q, want %q", tt.explicit, got, tt.want)
			}
		})
	}
}

// --- CredentialEnvHintString ---

func TestCredentialEnvHintString_Cases(t *testing.T) {
	tests := []struct {
		name string
		src  config.CredentialSource
		want string
	}{
		{
			name: "all empty",
			src:  config.CredentialSource{},
			want: "",
		},
		{
			name: "single key",
			src:  config.CredentialSource{APIKeyEnv: "MY_API_KEY"},
			want: "credential env keys in .telescope/config.yaml for this scheme: MY_API_KEY",
		},
		{
			name: "multiple keys",
			src: config.CredentialSource{
				UsernameEnv:     "USER",
				PasswordEnv:     "PASS",
				ClientIDEnv:     "CID",
				ClientSecretEnv: "CSEC",
			},
			want: "credential env keys in .telescope/config.yaml for this scheme: USER, PASS, CID, CSEC",
		},
		{
			name: "whitespace-only values ignored",
			src:  config.CredentialSource{APIKeyEnv: "  ", AccessTokenEnv: "TOKEN"},
			want: "credential env keys in .telescope/config.yaml for this scheme: TOKEN",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.src.CredentialEnvHintString(); got != tt.want {
				t.Errorf("CredentialEnvHintString() = %q, want %q", got, tt.want)
			}
		})
	}
}

// --- ParseDotEnv ---

func TestParseDotEnv_EdgeCases(t *testing.T) {
	tests := []struct {
		name string
		data string
		want map[string]string
	}{
		{
			name: "simple key=value",
			data: "FOO=bar",
			want: map[string]string{"FOO": "bar"},
		},
		{
			name: "export prefix",
			data: "export SECRET=abc123",
			want: map[string]string{"SECRET": "abc123"},
		},
		{
			name: "double-quoted with escapes",
			data: `KEY="hello\nworld"`,
			want: map[string]string{"KEY": "hello\nworld"},
		},
		{
			name: "single-quoted literal",
			data: `KEY='hello\nworld'`,
			want: map[string]string{"KEY": `hello\nworld`},
		},
		{
			name: "comments and blank lines ignored",
			data: "# comment\n\nA=1\n  # indented comment\nB=2",
			want: map[string]string{"A": "1", "B": "2"},
		},
		{
			name: "line without equals skipped",
			data: "NOEQ\nGOOD=yes",
			want: map[string]string{"GOOD": "yes"},
		},
		{
			name: "empty value",
			data: "EMPTY=",
			want: map[string]string{"EMPTY": ""},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := config.ParseDotEnv([]byte(tt.data))
			if len(got) != len(tt.want) {
				t.Fatalf("len = %d, want %d: %v", len(got), len(tt.want), got)
			}
			for k, v := range tt.want {
				if got[k] != v {
					t.Errorf("[%s] = %q, want %q", k, got[k], v)
				}
			}
		})
	}
}

// --- ResolveRunner ---

func TestResolveRunner_TableDriven(t *testing.T) {
	tests := []struct {
		name string
		ref  config.RuleRef
		want string
	}{
		{name: "explicit bun", ref: config.RuleRef{Runner: "bun", Rule: "x.go"}, want: "bun"},
		{name: "ts file auto", ref: config.RuleRef{Rule: "check.ts"}, want: "bun"},
		{name: "js file auto", ref: config.RuleRef{Rule: "check.js"}, want: "bun"},
		{name: "mts file auto", ref: config.RuleRef{Rule: "check.mts"}, want: "bun"},
		{name: "go file defaults native", ref: config.RuleRef{Rule: "check.go"}, want: "native"},
		{name: "unknown runner passthrough", ref: config.RuleRef{Runner: "deno", Rule: "x.ts"}, want: "deno"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := config.ResolveRunner(tt.ref); got != tt.want {
				t.Errorf("ResolveRunner() = %q, want %q", got, tt.want)
			}
		})
	}
}

// --- EffectiveSchemaValidationMode ---

func TestEffectiveSchemaValidationMode(t *testing.T) {
	tests := []struct {
		name string
		mode string
		want string
	}{
		{name: "empty defaults to go", mode: "", want: "go"},
		{name: "go stays go", mode: "go", want: "go"},
		{name: "legacy bun becomes go", mode: "bun", want: "go"},
		{name: "legacy compare becomes go", mode: "compare", want: "go"},
		{name: "unknown becomes go", mode: "wasm", want: "go"},
		{name: "whitespace-padded", mode: "  Go  ", want: "go"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := &config.Config{}
			cfg.LSP.SchemaValidation.Mode = tt.mode
			if got := cfg.EffectiveSchemaValidationMode(); got != tt.want {
				t.Errorf("EffectiveSchemaValidationMode() = %q, want %q", got, tt.want)
			}
		})
	}
}
