package bun

// MessageType identifies the kind of IPC message.
type MessageType string

const (
	MsgLoadRules      MessageType = "loadRules"
	MsgLoadResponse   MessageType = "loadResponse"
	MsgRunRules       MessageType = "runRules"
	MsgRuleResult     MessageType = "ruleResult"
	MsgRuleError      MessageType = "ruleError"
	MsgRunSpectral    MessageType = "runSpectral"
	MsgSpectralResult MessageType = "spectralResult"
	MsgReady          MessageType = "ready"
	MsgPing           MessageType = "ping"
	MsgPong           MessageType = "pong"
	MsgShutdown       MessageType = "shutdown"
)

// Envelope wraps all IPC messages with a common header.
type Envelope struct {
	ID      string      `json:"id"`
	Type    MessageType `json:"type"`
	Payload any         `json:"payload,omitempty"`
}

// RuleConfig describes a single custom rule to load.
type RuleConfig struct {
	ID       string         `json:"id"`
	Path     string         `json:"path"`
	Kind     string         `json:"kind"` // "openapi" | "generic"
	Severity string         `json:"severity,omitempty"`
	Patterns []string       `json:"patterns,omitempty"`
	Options  map[string]any `json:"options,omitempty"`
}

// LoadRulesRequest tells the sidecar to load rules from specified paths.
type LoadRulesRequest struct {
	Rules   []RuleConfig `json:"rules"`
	WorkDir string       `json:"workDir"`
}

// LoadRulesResponse reports how many rules were loaded and any load errors.
type LoadRulesResponse struct {
	RuleCount int            `json:"ruleCount"`
	Errors    []RuleRunError `json:"errors,omitempty"`
}

// RunRulesRequest asks the sidecar to run loaded rules on a document.
type RunRulesRequest struct {
	DocumentURI string                 `json:"documentURI"`
	RuleIDs     []string               `json:"ruleIDs"`
	Document    SerializedDoc          `json:"document"`
	Project     SerializedProjectIndex `json:"project"`
}

// RunRulesResponse contains diagnostics and timing from a rule run.
type RunRulesResponse struct {
	DocumentURI string              `json:"documentURI"`
	Diagnostics []SidecarDiagnostic `json:"diagnostics"`
	RuleTimings map[string]float64  `json:"ruleTimings,omitempty"`
	Errors      []RuleRunError      `json:"errors,omitempty"`
}

// SidecarDiagnostic is a diagnostic produced by the Bun sidecar.
type SidecarDiagnostic struct {
	StartLine uint32 `json:"startLine"`
	StartChar uint32 `json:"startChar"`
	EndLine   uint32 `json:"endLine"`
	EndChar   uint32 `json:"endChar"`
	Severity  int    `json:"severity"` // 1=error, 2=warn, 3=info, 4=hint
	Code      string `json:"code"`
	Message   string `json:"message"`
	Source    string `json:"source"`
}

// RuleRunError reports a rule execution failure.
type RuleRunError struct {
	RuleID string `json:"ruleID"`
	Error  string `json:"error"`
	Phase  string `json:"phase"` // "load" or "run"
}

// RunSpectralRequest asks the sidecar to run Spectral rulesets on a document.
type RunSpectralRequest struct {
	DocumentURI  string        `json:"documentURI"`
	Document     SerializedDoc `json:"document"`
	RulesetPaths []string      `json:"rulesetPaths"`
}

// RunSpectralResponse contains diagnostics from Spectral ruleset execution.
type RunSpectralResponse struct {
	DocumentURI    string              `json:"documentURI"`
	Diagnostics    []SidecarDiagnostic `json:"diagnostics"`
	RulesetTimings map[string]float64  `json:"rulesetTimings,omitempty"`
	Errors         []RuleRunError      `json:"errors,omitempty"`
}
