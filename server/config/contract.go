package config

import (
	"strings"
	"time"
)

// ContractTestsConfig configures in-process Barometer contract testing.
type ContractTestsConfig struct {
	Enabled        bool          `yaml:"enabled,omitempty"`
	DefaultBaseURL string        `yaml:"defaultBaseUrl,omitempty"`
	Concurrency    int           `yaml:"concurrency,omitempty"`
	RequestTimeout time.Duration `yaml:"requestTimeout,omitempty"`
	SkipTLSVerify  bool          `yaml:"skipTlsVerify,omitempty"`
	// TLS optionally loads client certificates and a custom CA for mTLS / private PKI (paths relative to workspace root unless absolute).
	TLS ContractTLSConfig `yaml:"tls,omitempty"`
	// EnvFiles lists dotenv files (relative to workspace root) merged in order for credential *Env lookups.
	// When empty, DefaultEnvFiles (.env then .env.local) is used.
	EnvFiles    []string                    `yaml:"envFiles,omitempty"`
	Credentials map[string]CredentialSource `yaml:"credentials,omitempty"`
	Targets     []ContractTarget            `yaml:"targets,omitempty"`
	Wiretap     WiretapConfig               `yaml:"wiretap,omitempty"`
}

// ContractTLSConfig configures the HTTP client used for contract tests (Barometer runner).
type ContractTLSConfig struct {
	ClientCertFile string `yaml:"clientCertFile,omitempty"`
	ClientKeyFile  string `yaml:"clientKeyFile,omitempty"`
	CACertFile     string `yaml:"caCertFile,omitempty"`
}

// WiretapConfig configures optional proxy-based contract validation.
type WiretapConfig struct {
	Enabled     bool     `yaml:"enabled,omitempty"`
	BinaryPath  string   `yaml:"binaryPath,omitempty"`
	MonitorPort int      `yaml:"monitorPort,omitempty"`
	ExtraArgs   []string `yaml:"extraArgs,omitempty"`
}

// CredentialSource maps one OpenAPI security scheme name to env-based secrets.
// Resolution order per scheme: tokenOverrides, then username+password (http Basic), apiKey, access token,
// basicAuthEnv single value, then OAuth strategies (see Strategy).
// Each *Env value is looked up in workspace dotenv files first, then the process environment.
type CredentialSource struct {
	// Strategy is empty or "static" (default): only env-backed secrets above.
	// "oauth2ClientCredentials" exchanges client_id/client_secret at oauth2TokenUrl (or spec flows.clientCredentials.tokenUrl).
	// "oauth2Refresh" uses refresh_token grant with refreshTokenEnv, clientIdEnv, clientSecretEnv.
	Strategy         string   `yaml:"strategy,omitempty"`
	OAuth2TokenURL   string   `yaml:"oauth2TokenUrl,omitempty"`
	OAuth2Scopes     []string `yaml:"oauth2Scopes,omitempty"`
	APIKeyEnv        string   `yaml:"apiKeyEnv,omitempty"`
	AccessTokenEnv   string   `yaml:"accessTokenEnv,omitempty"`
	BasicAuthEnv     string   `yaml:"basicAuthEnv,omitempty"` // user:password in one variable
	UsernameEnv      string   `yaml:"usernameEnv,omitempty"`  // for http Basic when BasicAuthEnv is not used
	PasswordEnv      string   `yaml:"passwordEnv,omitempty"`
	RefreshTokenEnv  string   `yaml:"refreshTokenEnv,omitempty"`
	OAuthInteractive *bool    `yaml:"oauthInteractive,omitempty"`
	ClientIDEnv      string   `yaml:"clientIdEnv,omitempty"`
	ClientSecretEnv  string   `yaml:"clientSecretEnv,omitempty"`
}

// CredentialEnvHintString lists non-empty *Env field names for diagnostics when credentials are missing.
func (s CredentialSource) CredentialEnvHintString() string {
	var keys []string
	add := func(k string) {
		k = strings.TrimSpace(k)
		if k != "" {
			keys = append(keys, k)
		}
	}
	add(s.UsernameEnv)
	add(s.PasswordEnv)
	add(s.APIKeyEnv)
	add(s.AccessTokenEnv)
	add(s.BasicAuthEnv)
	add(s.RefreshTokenEnv)
	add(s.ClientIDEnv)
	add(s.ClientSecretEnv)
	if len(keys) == 0 {
		return ""
	}
	return "credential env keys in .telescope/config.yaml for this scheme: " + strings.Join(keys, ", ")
}

// ContractTarget selects documents for batch contract runs (optional; single-doc runs use the open file).
type ContractTarget struct {
	ID        string   `yaml:"id,omitempty"`
	Kind      string   `yaml:"kind,omitempty"` // openapi | arazzo
	Include   []string `yaml:"include,omitempty"`
	Tags      []string `yaml:"tags,omitempty"`
	Workflows []string `yaml:"workflows,omitempty"`
}

// ResolveContractCredentials expands env vars from config into scheme name -> secret strings for Barometer.
// dotenv is optional workspace dotenv map (from .env); lookups use LookupEnv(dotenv, key).
// tokenOverrides (e.g. from LSP command args / VS Code SecretStorage) take precedence per scheme name.
func (c *ContractTestsConfig) ResolveContractCredentials(tokenOverrides map[string]string, dotenv map[string]string) map[string]string {
	out := make(map[string]string)
	if c == nil {
		return mergeCredentialStrings(out, tokenOverrides)
	}
	lookup := func(key string) string {
		return LookupEnv(dotenv, key)
	}
	for name, src := range c.Credentials {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		if u := strings.TrimSpace(lookup(src.UsernameEnv)); u != "" {
			if p := strings.TrimSpace(lookup(src.PasswordEnv)); p != "" {
				out[name] = u + ":" + p
				continue
			}
		}
		if v := strings.TrimSpace(lookup(src.APIKeyEnv)); v != "" {
			out[name] = v
			continue
		}
		if v := strings.TrimSpace(lookup(src.AccessTokenEnv)); v != "" {
			out[name] = v
			continue
		}
		if v := strings.TrimSpace(lookup(src.BasicAuthEnv)); v != "" {
			out[name] = v
			continue
		}
		// RefreshTokenEnv / ClientIDEnv / ClientSecretEnv: reserved for interactive or token-exchange flows;
		// use accessTokenEnv (or .env-backed vars) for bearer tokens against oauth2/openIdConnect schemes.
	}
	return mergeCredentialStrings(out, tokenOverrides)
}

// EffectiveEnvFiles returns env file names to load for contract credential resolution.
func (c *ContractTestsConfig) EffectiveEnvFiles() []string {
	if c == nil || len(c.EnvFiles) == 0 {
		return DefaultEnvFiles
	}
	out := make([]string, 0, len(c.EnvFiles))
	for _, f := range c.EnvFiles {
		f = strings.TrimSpace(f)
		if f != "" {
			out = append(out, f)
		}
	}
	if len(out) == 0 {
		return DefaultEnvFiles
	}
	return out
}

func mergeCredentialStrings(base map[string]string, overrides map[string]string) map[string]string {
	if len(overrides) == 0 {
		return base
	}
	if base == nil {
		base = make(map[string]string)
	}
	for k, v := range overrides {
		if strings.TrimSpace(k) == "" || strings.TrimSpace(v) == "" {
			continue
		}
		base[k] = v
	}
	return base
}

// EffectiveContractBaseURL returns base URL for a run.
func (c *ContractTestsConfig) EffectiveContractBaseURL(explicit string) string {
	if strings.TrimSpace(explicit) != "" {
		return strings.TrimSpace(explicit)
	}
	if c != nil && strings.TrimSpace(c.DefaultBaseURL) != "" {
		return strings.TrimSpace(c.DefaultBaseURL)
	}
	return "http://localhost:8080"
}

// EffectiveConcurrency returns worker pool size (default 2).
func (c *ContractTestsConfig) EffectiveConcurrency() int {
	if c == nil || c.Concurrency <= 0 {
		return 2
	}
	return c.Concurrency
}

// EffectiveWiretapEnabled reports whether wiretap should be used for a run.
// A non-nil override wins over config.
func (c *ContractTestsConfig) EffectiveWiretapEnabled(override *bool) bool {
	if override != nil {
		return *override
	}
	return c != nil && c.Wiretap.Enabled
}
