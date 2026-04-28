package config

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

// WorkspaceSection defines repo-wide file selection and shared env loading.
type WorkspaceSection struct {
	Ignore   []string                `yaml:"ignore,omitempty"`
	EnvFiles []string                `yaml:"envFiles,omitempty"`
	Targets  map[string]TargetConfig `yaml:"targets,omitempty"`
}

// TargetConfig is a named file-selection primitive for action blocks.
type TargetConfig struct {
	Kind        string   `yaml:"kind,omitempty"`
	Include     []string `yaml:"include,omitempty"`
	Exclude     []string `yaml:"exclude,omitempty"`
	Description string   `yaml:"description,omitempty"`
}

// GenerationSection configures spec generation and assembly workflows.
type GenerationSection struct {
	OpenAPI  OpenAPIGenerationSection `yaml:"openapi,omitempty"`
	Bundle   BundleGenerationSection  `yaml:"bundle,omitempty"`
	Overlays OverlayGenerationSection `yaml:"overlays,omitempty"`
}

type OpenAPIGenerationSection struct {
	Enabled      bool                      `yaml:"enabled,omitempty"`
	Root         string                    `yaml:"root,omitempty"`
	Output       string                    `yaml:"output,omitempty"`
	Cartographer CartographerConfigSection `yaml:"cartographer,omitempty"`

	// TriggerMode is "always" (debounce + save) or "save" (save only).
	TriggerMode string `yaml:"triggerMode,omitempty"`
	// DebounceMs is the idle window for the in-memory loop; default 500.
	DebounceMs int `yaml:"debounceMs,omitempty"`
	// WriteMode controls disk materialisation:
	// never | onDemand | onSave | always.
	// Default is onDemand when Output is set, never otherwise.
	WriteMode string `yaml:"writeMode,omitempty"`
	// WriteSourceMap mirrors an openapi.sourcemap.json file alongside the
	// spec when a disk write is performed.
	WriteSourceMap bool `yaml:"writeSourceMap,omitempty"`
	// ShowCodeLens and ShowTreeView are extension-surface flags passed
	// through initializationOptions so a single config file can control
	// server + extension behaviour.
	ShowCodeLens *bool `yaml:"showCodeLens,omitempty"`
	ShowTreeView *bool `yaml:"showTreeView,omitempty"`
}

type CartographerConfigSection struct {
	Config map[string]any `yaml:"config,omitempty"`
}

type BundleGenerationSection struct {
	Enabled bool     `yaml:"enabled,omitempty"`
	Targets []string `yaml:"targets,omitempty"`
	Output  string   `yaml:"output,omitempty"`
}

type OverlayGenerationSection struct {
	Enabled bool     `yaml:"enabled,omitempty"`
	Targets []string `yaml:"targets,omitempty"`
	Files   []string `yaml:"files,omitempty"`
	Output  string   `yaml:"output,omitempty"`
}

// LintingSection configures rule presets, overrides, and engines.
type LintingSection struct {
	Enabled           bool                  `yaml:"enabled,omitempty"`
	Targets           []string              `yaml:"targets,omitempty"`
	Presets           []string              `yaml:"presets,omitempty"`
	Overrides         map[string]string     `yaml:"overrides,omitempty"`
	GuidelinesBaseURL string                `yaml:"guidelinesBaseUrl,omitempty"`
	Engines           LintingEnginesSection `yaml:"engines,omitempty"`
	Rulesets          LintingRulesetSection `yaml:"rulesets,omitempty"`
	CustomRules       CustomRulesSection    `yaml:"customRules,omitempty"`
	Output            ActionOutputSection   `yaml:"output,omitempty"`
}

type LintingEnginesSection struct {
	Barrelman BarrelmanEngineSection `yaml:"barrelman,omitempty"`
	Vacuum    VacuumEngineSection    `yaml:"vacuum,omitempty"`
}

type BarrelmanEngineSection struct {
	Enabled bool `yaml:"enabled,omitempty"`
}

type VacuumEngineSection struct {
	Enabled         bool                   `yaml:"enabled,omitempty"`
	Rulesets        []VacuumRulesetRef     `yaml:"rulesets,omitempty"`
	SeverityFloor   string                 `yaml:"severityFloor,omitempty"`
	Turbo           bool                   `yaml:"turbo,omitempty"`
	Autofix         AutofixSection         `yaml:"autofix,omitempty"`
	Dedupe          DedupeSection          `yaml:"dedupe,omitempty"`
	ChangeDetection ChangeDetectionSection `yaml:"changeDetection,omitempty"`
}

type VacuumRulesetRef struct {
	Builtin string `yaml:"builtin,omitempty"`
	Path    string `yaml:"path,omitempty"`
}

type AutofixSection struct {
	Mode string `yaml:"mode,omitempty"`
}

type DedupeSection struct {
	Strategy string `yaml:"strategy,omitempty"`
}

type ChangeDetectionSection struct {
	Scope string `yaml:"scope,omitempty"`
}

type LintingRulesetSection struct {
	Spectral []string `yaml:"spectral,omitempty"`
}

type CustomRulesSection struct {
	Bun []BunRuleConfig `yaml:"bun,omitempty"`
}

type BunRuleConfig struct {
	Path     string         `yaml:"path,omitempty"`
	Severity string         `yaml:"severity,omitempty"`
	Targets  []string       `yaml:"targets,omitempty"`
	Options  map[string]any `yaml:"options,omitempty"`
}

type ActionOutputSection struct {
	Format         string `yaml:"format,omitempty"`
	Color          string `yaml:"color,omitempty"`
	ReportMarkdown string `yaml:"reportMarkdown,omitempty"`
	ReportJSON     string `yaml:"reportJson,omitempty"`
	Path           string `yaml:"path,omitempty"`
}

// ValidationSection configures OpenAPI validation, config validation, and
// schema validation for other files.
type ValidationSection struct {
	Telescope ValidationTelescopeSection       `yaml:"telescope,omitempty"`
	OpenAPI   ValidationOpenAPISection         `yaml:"openapi,omitempty"`
	Files     map[string]ValidationFileSection `yaml:"files,omitempty"`
}

type ValidationTelescopeSection struct {
	Enabled bool `yaml:"enabled,omitempty"`
}

type ValidationOpenAPISection struct {
	Enabled              bool                        `yaml:"enabled,omitempty"`
	Targets              []string                    `yaml:"targets,omitempty"`
	TargetVersion        string                      `yaml:"targetVersion,omitempty"`
	SchemaValidationMode string                      `yaml:"schemaValidationMode,omitempty"`
	Extensions           ValidationExtensionsSection `yaml:"extensions,omitempty"`
	BreakingChanges      BreakingChangesSection      `yaml:"breakingChanges,omitempty"`
}

type ValidationExtensionsSection struct {
	Required []string `yaml:"required,omitempty"`
	Schemas  []string `yaml:"schemas,omitempty"`
}

type BreakingChangesSection struct {
	Enabled   bool                  `yaml:"enabled,omitempty"`
	CompareTo string                `yaml:"compareTo,omitempty"`
	OnSave    bool                  `yaml:"onSave,omitempty"`
	Rules     string                `yaml:"rules,omitempty"`
	Output    BreakingOutputSection `yaml:"output,omitempty"`
}

type BreakingOutputSection struct {
	Format string `yaml:"format,omitempty"`
	Path   string `yaml:"path,omitempty"`
}

type ValidationFileSection struct {
	Enabled bool     `yaml:"enabled,omitempty"`
	Targets []string `yaml:"targets,omitempty"`
	Schema  string   `yaml:"schema,omitempty"`
}

// FormattingSection configures editor/CLI formatting behavior.
type FormattingSection struct {
	Prettier PrettierFormattingSection `yaml:"prettier,omitempty"`
}

type PrettierFormattingSection struct {
	Enabled bool           `yaml:"enabled,omitempty"`
	Targets []string       `yaml:"targets,omitempty"`
	Runtime string         `yaml:"runtime,omitempty"`
	Plugin  string         `yaml:"plugin,omitempty"`
	OnSave  bool           `yaml:"onSave,omitempty"`
	Options map[string]any `yaml:"options,omitempty"`
}

// TestingSection configures contract testing, workflows, and mocks.
type TestingSection struct {
	Contract  ContractTestingSection `yaml:"contract,omitempty"`
	Workflows WorkflowTestingSection `yaml:"workflows,omitempty"`
	Mocks     MockTestingSection     `yaml:"mocks,omitempty"`
}

type ContractTestingSection struct {
	Enabled       bool                          `yaml:"enabled,omitempty"`
	Targets       []string                      `yaml:"targets,omitempty"`
	BaseURL       string                        `yaml:"baseUrl,omitempty"`
	Concurrency   int                           `yaml:"concurrency,omitempty"`
	Timeout       time.Duration                 `yaml:"timeout,omitempty"`
	SkipTLSVerify bool                          `yaml:"skipTlsVerify,omitempty"`
	TLS           ContractTLSConfig             `yaml:"tls,omitempty"`
	Credentials   map[string]CredentialSourceV2 `yaml:"credentials,omitempty"`
	Wiretap       WiretapSettingsSection        `yaml:"wiretap,omitempty"`
}

type WorkflowTestingSection struct {
	Enabled bool     `yaml:"enabled,omitempty"`
	Targets []string `yaml:"targets,omitempty"`
}

type MockTestingSection struct {
	Enabled  bool                `yaml:"enabled,omitempty"`
	Targets  []string            `yaml:"targets,omitempty"`
	Generate MockGenerateSection `yaml:"generate,omitempty"`
	Serve    MockServeSection    `yaml:"serve,omitempty"`
}

type MockGenerateSection struct {
	OutputDir string `yaml:"outputDir,omitempty"`
	Format    string `yaml:"format,omitempty"`
	Schema    string `yaml:"schema,omitempty"`
}

type MockServeSection struct {
	Port int `yaml:"port,omitempty"`
}

type WiretapSettingsSection struct {
	Enabled     bool     `yaml:"enabled,omitempty"`
	Binary      string   `yaml:"binary,omitempty"`
	MonitorPort int      `yaml:"monitorPort,omitempty"`
	ExtraArgs   []string `yaml:"extraArgs,omitempty"`
}

// DocumentationSection configures printing-press generation and preview.
type DocumentationSection struct {
	PrintingPress PrintingPressSection `yaml:"printingPress,omitempty"`
}

type PrintingPressSection struct {
	Enabled bool                        `yaml:"enabled,omitempty"`
	Targets []string                    `yaml:"targets,omitempty"`
	Output  string                      `yaml:"output,omitempty"`
	Publish bool                        `yaml:"publish,omitempty"`
	Preview PrintingPressPreviewSection `yaml:"preview,omitempty"`
	Options PrintingPressOptionsSection `yaml:"options,omitempty"`
}

type PrintingPressPreviewSection struct {
	Port  int    `yaml:"port,omitempty"`
	Theme string `yaml:"theme,omitempty"`
}

type PrintingPressOptionsSection struct {
	Title  string `yaml:"title,omitempty"`
	NoLLM  bool   `yaml:"noLLM,omitempty"`
	NoJSON bool   `yaml:"noJSON,omitempty"`
	NoHTML bool   `yaml:"noHTML,omitempty"`
	Binary string `yaml:"binary,omitempty"`
}

// ExtensionSection contains editor-only settings.
type ExtensionSection struct {
	Diagnostics    ExtensionDiagnosticsSection `yaml:"diagnostics,omitempty"`
	LanguageServer LanguageServerSection       `yaml:"languageServer,omitempty"`
	Defaults       ExtensionDefaultsSection    `yaml:"defaults,omitempty"`
}

type ExtensionDiagnosticsSection struct {
	Debounce    time.Duration `yaml:"debounce,omitempty"`
	MaxFileSize string        `yaml:"maxFileSize,omitempty"`
}

type LanguageServerSection struct {
	Trace string `yaml:"trace,omitempty"`
}

type ExtensionDefaultsSection struct {
	LintEngine string `yaml:"lintEngine,omitempty"`
	DocsTheme  string `yaml:"docsTheme,omitempty"`
}

// AutomationSection configures CI and GitHub Action defaults.
type AutomationSection struct {
	CI AutomationCISection `yaml:"ci,omitempty"`
}

type AutomationCISection struct {
	Enabled        bool                     `yaml:"enabled,omitempty"`
	Actions        []string                 `yaml:"actions,omitempty"`
	ReportScope    string                   `yaml:"reportScope,omitempty"`
	FailOn         string                   `yaml:"failOn,omitempty"`
	FailOnBreaking bool                     `yaml:"failOnBreaking,omitempty"`
	GitHub         AutomationGitHubSection  `yaml:"github,omitempty"`
	Outputs        AutomationOutputsSection `yaml:"outputs,omitempty"`
}

type AutomationGitHubSection struct {
	CommentPR bool `yaml:"commentPR,omitempty"`
}

type AutomationOutputsSection struct {
	Markdown string `yaml:"markdown,omitempty"`
	JSON     string `yaml:"json,omitempty"`
	SARIF    string `yaml:"sarif,omitempty"`
}

// CredentialValueSource resolves one secret or literal from the environment, a
// file in the workspace, or inline config.
type CredentialValueSource struct {
	Env     string `yaml:"env,omitempty"`
	File    string `yaml:"file,omitempty"`
	Literal string `yaml:"literal,omitempty"`
}

func (s CredentialValueSource) isZero() bool {
	return strings.TrimSpace(s.Env) == "" && strings.TrimSpace(s.File) == "" && strings.TrimSpace(s.Literal) == ""
}

func (s CredentialValueSource) resolve(workspaceRoot string, dotenv map[string]string) (string, error) {
	switch {
	case strings.TrimSpace(s.Env) != "":
		return LookupEnv(dotenv, s.Env), nil
	case strings.TrimSpace(s.File) != "":
		data, err := os.ReadFile(ResolveWorkspacePath(workspaceRoot, s.File))
		if err != nil {
			return "", fmt.Errorf("read credential file %s: %w", s.File, err)
		}
		return strings.TrimSpace(string(data)), nil
	case strings.TrimSpace(s.Literal) != "":
		return strings.TrimSpace(s.Literal), nil
	default:
		return "", nil
	}
}

// CredentialSourceV2 is the action-oriented contract credential shape.
type CredentialSourceV2 struct {
	Strategy     string                `yaml:"strategy,omitempty"`
	APIKey       CredentialValueSource `yaml:"apiKey,omitempty"`
	AccessToken  CredentialValueSource `yaml:"accessToken,omitempty"`
	Username     CredentialValueSource `yaml:"username,omitempty"`
	Password     CredentialValueSource `yaml:"password,omitempty"`
	Basic        CredentialValueSource `yaml:"basic,omitempty"`
	ClientID     CredentialValueSource `yaml:"clientId,omitempty"`
	ClientSecret CredentialValueSource `yaml:"clientSecret,omitempty"`
	RefreshToken CredentialValueSource `yaml:"refreshToken,omitempty"`
	TokenURL     string                `yaml:"tokenUrl,omitempty"`
	Scopes       []string              `yaml:"scopes,omitempty"`
}

// UsesV2Layout reports whether any v2-only top-level sections are configured.
func (c *Config) UsesV2Layout() bool {
	if c == nil {
		return false
	}
	if c.ConfigVersion == 2 {
		return true
	}
	if len(c.Workspace.Ignore) > 0 || len(c.Workspace.EnvFiles) > 0 || len(c.Workspace.Targets) > 0 {
		return true
	}
	if c.Generation.OpenAPI.Enabled || c.Generation.Bundle.Enabled || c.Generation.Overlays.Enabled || len(c.Generation.Overlays.Files) > 0 || len(c.Generation.Bundle.Targets) > 0 || len(c.Generation.OpenAPI.Cartographer.Config) > 0 {
		return true
	}
	if c.Linting.Enabled || len(c.Linting.Targets) > 0 || len(c.Linting.Presets) > 0 || len(c.Linting.Overrides) > 0 || len(c.Linting.Rulesets.Spectral) > 0 || len(c.Linting.CustomRules.Bun) > 0 || strings.TrimSpace(c.Linting.GuidelinesBaseURL) != "" {
		return true
	}
	if c.Validation.Telescope.Enabled || c.Validation.OpenAPI.Enabled || len(c.Validation.OpenAPI.Targets) > 0 || len(c.Validation.Files) > 0 || c.Validation.OpenAPI.BreakingChanges.Enabled {
		return true
	}
	if c.Formatting.Prettier.Enabled || len(c.Formatting.Prettier.Targets) > 0 || c.Formatting.Prettier.OnSave || len(c.Formatting.Prettier.Options) > 0 || strings.TrimSpace(c.Formatting.Prettier.Plugin) != "" {
		return true
	}
	if c.Testing.Contract.Enabled || c.Testing.Workflows.Enabled || c.Testing.Mocks.Enabled || len(c.Testing.Contract.Targets) > 0 || len(c.Testing.Contract.Credentials) > 0 || len(c.Testing.Mocks.Targets) > 0 {
		return true
	}
	if c.Documentation.PrintingPress.Enabled || len(c.Documentation.PrintingPress.Targets) > 0 || strings.TrimSpace(c.Documentation.PrintingPress.Output) != "" {
		return true
	}
	if c.Extension.Diagnostics.Debounce > 0 || strings.TrimSpace(c.Extension.Diagnostics.MaxFileSize) != "" || strings.TrimSpace(c.Extension.LanguageServer.Trace) != "" || strings.TrimSpace(c.Extension.Defaults.LintEngine) != "" || strings.TrimSpace(c.Extension.Defaults.DocsTheme) != "" {
		return true
	}
	if c.Automation.CI.Enabled || len(c.Automation.CI.Actions) > 0 || strings.TrimSpace(c.Automation.CI.ReportScope) != "" || strings.TrimSpace(c.Automation.CI.FailOn) != "" || c.Automation.CI.FailOnBreaking || c.Automation.CI.GitHub.CommentPR {
		return true
	}
	return false
}

func (c *Config) normalizeV2(configPath string) error {
	if c == nil || !c.UsesV2Layout() {
		return nil
	}
	if c.ConfigVersion != 2 {
		return fmt.Errorf("v2 Telescope config must declare configVersion: 2")
	}
	if err := c.validateV2(); err != nil {
		return err
	}

	workspaceRoot := WorkspaceRootForConfigPath(configPath)
	allTargetPatterns := c.allTargetPatterns()
	if len(allTargetPatterns) > 0 {
		c.Include = allTargetPatterns
	}
	if ignores := dedupeTrimmed(c.Workspace.Ignore); len(ignores) > 0 {
		c.Exclude = ignores
	}
	if envFiles := dedupeTrimmed(c.Workspace.EnvFiles); len(envFiles) > 0 {
		c.ContractTests.EnvFiles = envFiles
	}

	if presets := dedupeTrimmed(c.Linting.Presets); len(presets) > 0 {
		c.Extends = presets[0]
	}
	if c.Rules == nil {
		c.Rules = make(map[string]string)
	}
	for id, sev := range c.Linting.Overrides {
		if trimmedID := strings.TrimSpace(id); trimmedID != "" {
			c.Rules[trimmedID] = strings.TrimSpace(sev)
		}
	}
	if base := strings.TrimSpace(c.Linting.GuidelinesBaseURL); base != "" {
		c.GuidelinesBaseURL = base
	}

	if c.UsesV2Layout() {
		var engines []string
		if c.Linting.Engines.Barrelman.Enabled || c.Linting.Engines.Vacuum.Enabled || (!c.Linting.Engines.Barrelman.Enabled && !c.Linting.Engines.Vacuum.Enabled) {
			engines = append(engines, "barrelman")
		}
		if c.Linting.Engines.Vacuum.Enabled {
			engines = append(engines, "vacuum")
		}
		if len(engines) > 0 {
			c.Lint.Engines = engines
		}
	}
	if c.Linting.Engines.Vacuum.Enabled {
		c.Lint.Vacuum.Severity = strings.TrimSpace(c.Linting.Engines.Vacuum.SeverityFloor)
		c.Lint.Vacuum.Turbo = c.Linting.Engines.Vacuum.Turbo
		for _, ref := range c.Linting.Engines.Vacuum.Rulesets {
			if strings.TrimSpace(ref.Path) != "" {
				c.Lint.Vacuum.Ruleset = TelescopeAssetRef(ref.Path)
				break
			}
		}
	}
	if spectral := normalizeAssetRefs(c.Linting.Rulesets.Spectral); len(spectral) > 0 {
		c.SpectralRulesets = spectral
	}

	openapiPatterns := c.collectOpenAPIPatterns()
	if len(openapiPatterns) > 0 {
		c.OpenAPI.Patterns = openapiPatterns
	}
	for _, rule := range c.Linting.CustomRules.Bun {
		path := normalizeRuleRef(rule.Path)
		if strings.TrimSpace(path) == "" {
			continue
		}
		c.OpenAPI.Rules = append(c.OpenAPI.Rules, RuleRef{
			Rule:     path,
			Runner:   "bun",
			Severity: strings.TrimSpace(rule.Severity),
			Options:  rule.Options,
		})
	}

	if version := strings.TrimSpace(c.Validation.OpenAPI.TargetVersion); version != "" {
		c.OpenAPI.TargetVersion = version
	}
	if len(c.Validation.OpenAPI.Extensions.Required) > 0 {
		c.OpenAPI.Extensions.Required = dedupeTrimmed(c.Validation.OpenAPI.Extensions.Required)
	}
	if len(c.Validation.OpenAPI.Extensions.Schemas) > 0 {
		c.OpenAPI.Extensions.Schemas = normalizeAssetRefs(c.Validation.OpenAPI.Extensions.Schemas)
	}
	if compareTo := strings.TrimSpace(c.Validation.OpenAPI.BreakingChanges.CompareTo); compareTo != "" {
		c.LSP.DiffCompareBaseRef = compareTo
	}
	if c.Validation.OpenAPI.BreakingChanges.OnSave {
		c.LSP.DiffOnSave = true
	}
	if rules := strings.TrimSpace(c.Validation.OpenAPI.BreakingChanges.Rules); rules != "" {
		c.LSP.BreakingRulesPath = TelescopeAssetRef(rules)
	}

	if mode := strings.TrimSpace(c.Validation.OpenAPI.SchemaValidationMode); mode != "" {
		c.LSP.SchemaValidation.Mode = mode
	}
	if c.Extension.Diagnostics.Debounce > 0 {
		c.LSP.Debounce = c.Extension.Diagnostics.Debounce
	}
	if maxSize := strings.TrimSpace(c.Extension.Diagnostics.MaxFileSize); maxSize != "" {
		parsed, err := parseByteSize(maxSize)
		if err != nil {
			return fmt.Errorf("extension.diagnostics.maxFileSize: %w", err)
		}
		c.LSP.MaxFileSize = parsed
	}

	if len(c.Validation.Files) > 0 {
		c.AdditionalValidation = make(map[string]ValidationGroup, len(c.Validation.Files))
		names := make([]string, 0, len(c.Validation.Files))
		for name := range c.Validation.Files {
			names = append(names, name)
		}
		sort.Strings(names)
		for _, name := range names {
			group := c.Validation.Files[name]
			patterns := c.targetPatterns(group.Targets, "")
			c.AdditionalValidation[name] = ValidationGroup{
				Patterns: patterns,
				Schemas: []SchemaPatternMapping{{
					Schema: normalizeSchemaRef(group.Schema),
				}},
			}
		}
	}

	contract := c.Testing.Contract
	if baseURL := strings.TrimSpace(contract.BaseURL); baseURL != "" {
		c.ContractTests.DefaultBaseURL = baseURL
	}
	if contract.Concurrency > 0 {
		c.ContractTests.Concurrency = contract.Concurrency
	}
	if contract.Timeout > 0 {
		c.ContractTests.RequestTimeout = contract.Timeout
	}
	c.ContractTests.SkipTLSVerify = contract.SkipTLSVerify
	if cert := strings.TrimSpace(contract.TLS.ClientCertFile); cert != "" {
		c.ContractTests.TLS.ClientCertFile = cert
	}
	if key := strings.TrimSpace(contract.TLS.ClientKeyFile); key != "" {
		c.ContractTests.TLS.ClientKeyFile = key
	}
	if ca := strings.TrimSpace(contract.TLS.CACertFile); ca != "" {
		c.ContractTests.TLS.CACertFile = ca
	}
	c.ContractTests.Wiretap = WiretapConfig{
		Enabled:     contract.Wiretap.Enabled,
		BinaryPath:  strings.TrimSpace(contract.Wiretap.Binary),
		MonitorPort: contract.Wiretap.MonitorPort,
		ExtraArgs:   append([]string(nil), contract.Wiretap.ExtraArgs...),
	}
	c.ContractTests.Targets = c.buildContractTargets()
	if len(c.Testing.Contract.Credentials) > 0 {
		if c.ContractTests.Credentials == nil {
			c.ContractTests.Credentials = make(map[string]CredentialSource)
		}
		for name, cred := range c.Testing.Contract.Credentials {
			if _, exists := c.ContractTests.Credentials[name]; exists {
				continue
			}
			converted := CredentialSource{
				Strategy:       normalizeCredentialStrategy(cred.Strategy),
				OAuth2TokenURL: strings.TrimSpace(cred.TokenURL),
				OAuth2Scopes:   dedupeTrimmed(cred.Scopes),
			}
			if env := strings.TrimSpace(cred.APIKey.Env); env != "" {
				converted.APIKeyEnv = env
			}
			if env := strings.TrimSpace(cred.AccessToken.Env); env != "" {
				converted.AccessTokenEnv = env
			}
			if env := strings.TrimSpace(cred.Username.Env); env != "" {
				converted.UsernameEnv = env
			}
			if env := strings.TrimSpace(cred.Password.Env); env != "" {
				converted.PasswordEnv = env
			}
			if env := strings.TrimSpace(cred.Basic.Env); env != "" {
				converted.BasicAuthEnv = env
			}
			if env := strings.TrimSpace(cred.ClientID.Env); env != "" {
				converted.ClientIDEnv = env
			}
			if env := strings.TrimSpace(cred.ClientSecret.Env); env != "" {
				converted.ClientSecretEnv = env
			}
			if env := strings.TrimSpace(cred.RefreshToken.Env); env != "" {
				converted.RefreshTokenEnv = env
			}
			c.ContractTests.Credentials[name] = converted
		}
	}

	_ = workspaceRoot
	return nil
}

func (c *Config) validateV2() error {
	targetKinds := map[string]bool{
		"openapi": true,
		"arazzo":  true,
		"schema":  true,
		"config":  true,
		"files":   true,
	}
	for name, target := range c.Workspace.Targets {
		kind := strings.ToLower(strings.TrimSpace(target.Kind))
		if kind == "" {
			return fmt.Errorf("workspace.targets.%s.kind is required", name)
		}
		if !targetKinds[kind] {
			return fmt.Errorf("workspace.targets.%s.kind %q is unsupported", name, target.Kind)
		}
		if len(target.Include) == 0 {
			return fmt.Errorf("workspace.targets.%s.include must not be empty", name)
		}
	}
	if err := c.validateTargetRefs("generation.bundle.targets", c.Generation.Bundle.Targets); err != nil {
		return err
	}
	if err := c.validateTargetRefs("generation.overlays.targets", c.Generation.Overlays.Targets); err != nil {
		return err
	}
	if err := c.validateTargetRefs("linting.targets", c.Linting.Targets); err != nil {
		return err
	}
	if err := c.validateTargetRefs("validation.openapi.targets", c.Validation.OpenAPI.Targets); err != nil {
		return err
	}
	if err := c.validateTargetRefs("testing.contract.targets", c.Testing.Contract.Targets); err != nil {
		return err
	}
	if err := c.validateTargetRefs("testing.workflows.targets", c.Testing.Workflows.Targets); err != nil {
		return err
	}
	if err := c.validateTargetRefs("testing.mocks.targets", c.Testing.Mocks.Targets); err != nil {
		return err
	}
	if err := c.validateTargetRefs("documentation.printingPress.targets", c.Documentation.PrintingPress.Targets); err != nil {
		return err
	}
	if err := c.validateTargetRefs("formatting.prettier.targets", c.Formatting.Prettier.Targets); err != nil {
		return err
	}
	if err := c.validateGeneration(); err != nil {
		return err
	}
	for i, rule := range c.Linting.CustomRules.Bun {
		if err := c.validateTargetRefs(fmt.Sprintf("linting.customRules.bun[%d].targets", i), rule.Targets); err != nil {
			return err
		}
	}
	for name, group := range c.Validation.Files {
		if err := c.validateTargetRefs(fmt.Sprintf("validation.files.%s.targets", name), group.Targets); err != nil {
			return err
		}
		if strings.TrimSpace(group.Schema) == "" {
			return fmt.Errorf("validation.files.%s.schema is required", name)
		}
	}
	pathRulesets := 0
	for i, ref := range c.Linting.Engines.Vacuum.Rulesets {
		hasBuiltin := strings.TrimSpace(ref.Builtin) != ""
		hasPath := strings.TrimSpace(ref.Path) != ""
		if hasBuiltin == hasPath {
			return fmt.Errorf("linting.engines.vacuum.rulesets[%d] must set exactly one of builtin or path", i)
		}
		if hasBuiltin && !strings.EqualFold(strings.TrimSpace(ref.Builtin), "recommended") {
			return fmt.Errorf("linting.engines.vacuum.rulesets[%d].builtin only supports \"recommended\" today", i)
		}
		if hasPath {
			pathRulesets++
		}
	}
	if pathRulesets > 1 {
		return fmt.Errorf("linting.engines.vacuum.rulesets currently supports at most one custom path ruleset")
	}
	return nil
}

func (c *Config) validateTargetRefs(path string, refs []string) error {
	for _, ref := range refs {
		ref = strings.TrimSpace(ref)
		if ref == "" {
			continue
		}
		if _, ok := c.Workspace.Targets[ref]; !ok {
			return fmt.Errorf("%s references unknown workspace target %q", path, ref)
		}
	}
	return nil
}

func (c *Config) allTargetPatterns() []string {
	if len(c.Workspace.Targets) == 0 {
		return nil
	}
	var patterns []string
	for _, target := range c.Workspace.Targets {
		patterns = append(patterns, target.Include...)
	}
	return dedupeTrimmed(patterns)
}

func (c *Config) collectOpenAPIPatterns() []string {
	var refs []string
	refs = append(refs, c.Linting.Targets...)
	refs = append(refs, c.Validation.OpenAPI.Targets...)
	refs = append(refs, c.Generation.Bundle.Targets...)
	refs = append(refs, c.Generation.Overlays.Targets...)
	refs = append(refs, c.Testing.Contract.Targets...)
	refs = append(refs, c.Testing.Mocks.Targets...)
	refs = append(refs, c.Documentation.PrintingPress.Targets...)
	for _, rule := range c.Linting.CustomRules.Bun {
		refs = append(refs, rule.Targets...)
	}
	return c.targetPatterns(refs, "openapi")
}

func (c *Config) targetPatterns(refs []string, kind string) []string {
	if len(refs) == 0 {
		if kind == "" {
			return nil
		}
		var implicit []string
		for _, target := range c.Workspace.Targets {
			if strings.EqualFold(strings.TrimSpace(target.Kind), kind) {
				implicit = append(implicit, target.Include...)
			}
		}
		return dedupeTrimmed(implicit)
	}
	var patterns []string
	for _, ref := range dedupeTrimmed(refs) {
		target, ok := c.Workspace.Targets[ref]
		if !ok {
			continue
		}
		if kind != "" && !strings.EqualFold(strings.TrimSpace(target.Kind), kind) {
			continue
		}
		patterns = append(patterns, target.Include...)
	}
	return dedupeTrimmed(patterns)
}

func (c *Config) buildContractTargets() []ContractTarget {
	var out []ContractTarget
	for _, ref := range dedupeTrimmed(c.Testing.Contract.Targets) {
		if target, ok := c.Workspace.Targets[ref]; ok {
			out = append(out, ContractTarget{
				ID:      ref,
				Kind:    strings.TrimSpace(target.Kind),
				Include: append([]string(nil), target.Include...),
			})
		}
	}
	for _, ref := range dedupeTrimmed(c.Testing.Workflows.Targets) {
		if target, ok := c.Workspace.Targets[ref]; ok {
			out = append(out, ContractTarget{
				ID:      ref,
				Kind:    strings.TrimSpace(target.Kind),
				Include: append([]string(nil), target.Include...),
			})
		}
	}
	return out
}

// EffectiveEnvFiles returns the repo-level env file chain for runtime actions.
func (c *Config) EffectiveEnvFiles() []string {
	if c != nil && c.UsesV2Layout() {
		if files := dedupeTrimmed(c.Workspace.EnvFiles); len(files) > 0 {
			return files
		}
	}
	return c.ContractTests.EffectiveEnvFiles()
}

// EffectiveContractBaseURL returns the configured base URL for contract tests.
func (c *Config) EffectiveContractBaseURL(explicit string) string {
	if strings.TrimSpace(explicit) != "" {
		return strings.TrimSpace(explicit)
	}
	if c != nil && c.UsesV2Layout() {
		if base := strings.TrimSpace(c.Testing.Contract.BaseURL); base != "" {
			return base
		}
	}
	return c.ContractTests.EffectiveContractBaseURL(explicit)
}

// EffectiveContractConcurrency returns the worker pool size for contract tests.
func (c *Config) EffectiveContractConcurrency() int {
	if c != nil && c.UsesV2Layout() && c.Testing.Contract.Concurrency > 0 {
		return c.Testing.Contract.Concurrency
	}
	return c.ContractTests.EffectiveConcurrency()
}

// EffectiveWiretapEnabled reports whether contract tests should use Wiretap.
func (c *Config) EffectiveWiretapEnabled(override *bool) bool {
	if override != nil {
		return *override
	}
	if c != nil && c.UsesV2Layout() {
		return c.Testing.Contract.Wiretap.Enabled
	}
	return c.ContractTests.EffectiveWiretapEnabled(override)
}

func dedupeTrimmed(items []string) []string {
	if len(items) == 0 {
		return nil
	}
	out := make([]string, 0, len(items))
	seen := make(map[string]struct{}, len(items))
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		out = append(out, item)
	}
	return out
}

func normalizeAssetRefs(items []string) []string {
	if len(items) == 0 {
		return nil
	}
	out := make([]string, 0, len(items))
	for _, item := range dedupeTrimmed(items) {
		out = append(out, TelescopeAssetRef(item))
	}
	return out
}

func normalizeRuleRef(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}
	clean := filepath.ToSlash(filepath.Clean(path))
	switch {
	case filepath.IsAbs(path):
		return path
	case strings.HasPrefix(clean, ".telescope/rules/"):
		return strings.TrimPrefix(clean, ".telescope/rules/")
	case strings.HasPrefix(clean, "rules/"):
		return strings.TrimPrefix(clean, "rules/")
	default:
		return clean
	}
}

func normalizeSchemaRef(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}
	if filepath.IsAbs(path) {
		return path
	}
	clean := filepath.ToSlash(filepath.Clean(path))
	if strings.HasPrefix(clean, ".telescope/") {
		return strings.TrimPrefix(clean, ".telescope/")
	}
	return clean
}

func parseByteSize(raw string) (int64, error) {
	value := strings.TrimSpace(strings.ToUpper(raw))
	if value == "" {
		return 0, nil
	}
	for _, suffix := range []struct {
		label string
		size  int64
	}{
		{"KB", 1024},
		{"MB", 1024 * 1024},
		{"GB", 1024 * 1024 * 1024},
		{"B", 1},
	} {
		if strings.HasSuffix(value, suffix.label) {
			numeric := strings.TrimSpace(strings.TrimSuffix(value, suffix.label))
			n, err := strconv.ParseInt(numeric, 10, 64)
			if err != nil {
				return 0, fmt.Errorf("parse %q: %w", raw, err)
			}
			return n * suffix.size, nil
		}
	}
	n, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("parse %q: %w", raw, err)
	}
	return n, nil
}
