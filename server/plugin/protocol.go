package plugin

import (
	"net/rpc"

	"github.com/hashicorp/go-plugin"
)

// ProtocolVersion is the plugin protocol version. Increment when breaking
// changes are made to the RPC interface.
const ProtocolVersion = 1

// Handshake is the go-plugin handshake config. Both host and plugin must
// agree on these values for the connection to be established.
var Handshake = plugin.HandshakeConfig{
	ProtocolVersion:  ProtocolVersion,
	MagicCookieKey:   "TELESCOPE_PLUGIN",
	MagicCookieValue: "telescope-rule-plugin-v1",
}

// PluginMap is the map of plugin types the host can serve/consume.
var PluginMap = map[string]plugin.Plugin{
	"rules": &RulePluginRPC{},
}

// RulePlugin is the interface that plugin binaries implement to provide
// custom diagnostic rules. The host calls GetMeta once at startup to
// discover rules, then calls Analyze for each document change.
type RulePlugin interface {
	// GetMeta returns metadata for all rules the plugin provides.
	GetMeta() (*GetMetaResponse, error)

	// Analyze runs all plugin rules against the given document and returns diagnostics.
	Analyze(req *AnalyzeRequest) (*AnalyzeResponse, error)
}

// --- Wire types ---

// GetMetaResponse carries rule metadata from plugin to host.
type GetMetaResponse struct {
	Rules []PluginRuleMeta
}

// PluginRuleMeta describes a single rule provided by a plugin.
type PluginRuleMeta struct {
	ID          string
	Description string
	Severity    string // error, warn, info, hint
	Category    string
	Recommended bool
	HowToFix    string
	DocURL      string
}

// AnalyzeRequest is sent from host to plugin for each document change.
type AnalyzeRequest struct {
	URI        string
	Content    []byte
	LanguageID string // yaml, json
}

// AnalyzeResponse carries diagnostics from plugin back to host.
type AnalyzeResponse struct {
	Diagnostics []PluginDiagnostic
}

// PluginDiagnostic is a single diagnostic result from a plugin rule.
type PluginDiagnostic struct {
	StartLine uint32
	StartChar uint32
	EndLine   uint32
	EndChar   uint32
	Severity  string // error, warn, info, hint
	Code      string
	Message   string
	Source    string
}

// --- net/rpc implementation ---

// RulePluginRPC implements hashicorp/go-plugin's Plugin interface using net/rpc.
type RulePluginRPC struct {
	Impl RulePlugin
}

func (p *RulePluginRPC) Server(*plugin.MuxBroker) (interface{}, error) {
	return &rulePluginRPCServer{Impl: p.Impl}, nil
}

func (p *RulePluginRPC) Client(b *plugin.MuxBroker, c *rpc.Client) (interface{}, error) {
	return &rulePluginRPCClient{client: c}, nil
}

// rulePluginRPCServer wraps a RulePlugin for the plugin side.
type rulePluginRPCServer struct {
	Impl RulePlugin
}

func (s *rulePluginRPCServer) GetMeta(_ interface{}, resp *GetMetaResponse) error {
	r, err := s.Impl.GetMeta()
	if err != nil {
		return err
	}
	*resp = *r
	return nil
}

func (s *rulePluginRPCServer) Analyze(req *AnalyzeRequest, resp *AnalyzeResponse) error {
	r, err := s.Impl.Analyze(req)
	if err != nil {
		return err
	}
	*resp = *r
	return nil
}

// rulePluginRPCClient wraps an rpc.Client for the host side.
type rulePluginRPCClient struct {
	client *rpc.Client
}

func (c *rulePluginRPCClient) GetMeta() (*GetMetaResponse, error) {
	var resp GetMetaResponse
	if err := c.client.Call("Plugin.GetMeta", new(interface{}), &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

func (c *rulePluginRPCClient) Analyze(req *AnalyzeRequest) (*AnalyzeResponse, error) {
	var resp AnalyzeResponse
	if err := c.client.Call("Plugin.Analyze", req, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}
