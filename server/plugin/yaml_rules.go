package plugin

import (
	"fmt"
	"log/slog"
	"os"

	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/rules"
	"github.com/sailpoint-oss/telescope/server/rulesets"
	"github.com/sailpoint-oss/telescope/server/spectral"

	"gopkg.in/yaml.v3"
)

// YAMLRulePlugin is a plugin constructed from a YAML declarative rule file.
type YAMLRulePlugin struct {
	name      string
	version   string
	checks    map[string]treesitter.Check
	analyzers map[string]treesitter.Analyzer
	metas     []rules.RuleMeta
}

func (p *YAMLRulePlugin) Name() string                              { return p.name }
func (p *YAMLRulePlugin) Version() string                           { return p.version }
func (p *YAMLRulePlugin) Checks() map[string]treesitter.Check       { return p.checks }
func (p *YAMLRulePlugin) Analyzers() map[string]treesitter.Analyzer { return p.analyzers }
func (p *YAMLRulePlugin) Meta() []rules.RuleMeta                    { return p.metas }

// LoadYAMLPlugin loads a YAML ruleset file and converts its rules into a
// Plugin. Rules with JSONPath "given" expressions are evaluated through the
// Spectral engine; rules with tree-sitter pattern strings are registered as
// tree-sitter Checks for backward compatibility.
func LoadYAMLPlugin(path string, logger *slog.Logger) (*YAMLRulePlugin, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read yaml plugin %s: %w", path, err)
	}

	var rs rulesets.RuleSet
	if err := yaml.Unmarshal(data, &rs); err != nil {
		return nil, fmt.Errorf("parse yaml plugin %s: %w", path, err)
	}

	plugin := &YAMLRulePlugin{
		name:      rs.Name,
		version:   "1.0.0",
		checks:    make(map[string]treesitter.Check),
		analyzers: make(map[string]treesitter.Analyzer),
	}

	if plugin.name == "" {
		plugin.name = path
	}

	// Collect Spectral-style rules (JSONPath given + then functions)
	var spectralRules []spectral.Rule

	for id, def := range rs.Rules {
		sev := protocol.SeverityWarning
		if s, ok := rulesets.ParseSeverity(def.Severity); ok && s > 0 {
			sev = s
		}

		plugin.metas = append(plugin.metas, rules.RuleMeta{
			ID:          id,
			Description: def.Description,
			Severity:    sev,
			Category:    rules.Category("plugin"),
		})

		// Check if this is a Spectral-style rule (JSONPath given + then functions)
		if def.Then != nil {
			parsed := spectral.ParseRules(&rulesets.RuleSet{
				Rules: map[string]rulesets.RuleDefinition{id: def},
			})
			if len(parsed) > 0 {
				spectralRules = append(spectralRules, parsed...)
				continue
			}
		}

		// Legacy: tree-sitter pattern-based Check
		if pattern, ok := def.Given.(string); ok && pattern != "" && !isJSONPath(pattern) {
			msg := def.Message
			if msg == "" {
				msg = def.Description
			}
			finalMsg := msg
			plugin.checks[id] = treesitter.Check{
				Pattern:  pattern,
				Severity: sev,
				Source:   rules.Source,
				Code:     id,
				Message: func(c treesitter.Capture) string {
					return finalMsg
				},
			}
		}
	}

	// Register a single Spectral engine analyzer for all JSONPath-based rules
	if len(spectralRules) > 0 {
		eng := spectral.NewEngine(spectralRules, logger)
		plugin.analyzers["spectral-plugin-"+plugin.name] = eng.Analyzer()
	}

	return plugin, nil
}

func isJSONPath(s string) bool {
	return len(s) > 0 && (s[0] == '$' || s[0] == '@')
}

