package vacuum

import (
	"bytes"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	vmodel "github.com/daveshanley/vacuum/model"
	"github.com/daveshanley/vacuum/motor"
	vrulesets "github.com/daveshanley/vacuum/rulesets"
	"github.com/sailpoint-oss/barrelman"
	"github.com/sailpoint-oss/barrelman/rulesets/bridge"
	"github.com/sailpoint-oss/telescope/server/config"
)

const Source = "vacuum"

// Engine wraps pb33f/vacuum execution and maps results onto Telescope's
// existing diagnostic model.
type Engine struct {
	ruleSet          *vrulesets.RuleSet
	minSeverity      barrelman.Severity
	turbo            bool
	autoFixFunctions map[string]vmodel.AutoFixFunction
	logger           *slog.Logger
}

// NewEngine builds a Vacuum engine using the current process working directory
// for relative ruleset resolution.
func NewEngine(cfg config.VacuumConfig, logger *slog.Logger) (*Engine, error) {
	return NewEngineWithBaseDir(cfg, "", logger)
}

// NewEngineWithBaseDir builds a Vacuum engine and resolves relative ruleset
// paths against baseDir.
func NewEngineWithBaseDir(cfg config.VacuumConfig, baseDir string, logger *slog.Logger) (*Engine, error) {
	if logger == nil {
		logger = slog.Default()
	}
	ruleSet, err := loadRuleSet(cfg.Ruleset, baseDir, logger)
	if err != nil {
		return nil, err
	}
	return &Engine{
		ruleSet:          ruleSet,
		minSeverity:      parseMinimumSeverity(cfg.Severity),
		turbo:            cfg.Turbo,
		autoFixFunctions: defaultAutoFixFunctions(),
		logger:           logger,
	}, nil
}

// LintBytes runs vacuum against raw specification bytes.
func (e *Engine) LintBytes(content []byte, uri string) ([]barrelman.Diagnostic, error) {
	result, err := e.execute(content, uri, false)
	if result == nil {
		return nil, err
	}
	return e.convertResults(result.Results, uri), err
}

// LintAndFix applies available vacuum auto-fixes and returns the updated bytes.
func (e *Engine) LintAndFix(content []byte, uri string) ([]barrelman.Diagnostic, []byte, error) {
	result, err := e.execute(content, uri, true)
	if result == nil {
		return nil, nil, err
	}
	modified := content
	if len(result.ModifiedSpec) > 0 {
		modified = result.ModifiedSpec
	}
	if bytes.Equal(modified, content) {
		return e.convertResults(result.Results, uri), modified, err
	}
	diags, rerunErr := e.LintBytes(modified, uri)
	if err == nil {
		err = rerunErr
	}
	return diags, modified, err
}

func (e *Engine) execute(content []byte, uri string, applyAutoFixes bool) (*motor.RuleSetExecutionResult, error) {
	if e == nil || e.ruleSet == nil {
		return nil, fmt.Errorf("vacuum engine is not initialized")
	}
	execution := &motor.RuleSetExecution{
		RuleSet:          e.ruleSet,
		Spec:             content,
		SpecFileName:     specFileName(uri),
		Base:             specBase(uri),
		SilenceLogs:      true,
		Logger:           e.logger,
		TurboMode:        e.turbo,
		ApplyAutoFixes:   applyAutoFixes,
		AutoFixFunctions: e.autoFixFunctions,
	}
	result := motor.ApplyRulesToRuleSet(execution)
	if result == nil {
		return nil, fmt.Errorf("vacuum returned no result")
	}
	return result, joinVacuumErrors(result.Errors)
}

func loadRuleSet(path string, baseDir string, logger *slog.Logger) (*vrulesets.RuleSet, error) {
	defaults := vrulesets.BuildDefaultRuleSetsWithLogger(logger)
	if strings.TrimSpace(path) == "" {
		return defaults.GenerateOpenAPIRecommendedRuleSet(), nil
	}
	resolved := strings.TrimSpace(path)
	if resolved != "" && !filepath.IsAbs(resolved) && baseDir != "" {
		resolved = filepath.Join(baseDir, resolved)
	}
	data, err := os.ReadFile(resolved)
	if err != nil {
		return nil, fmt.Errorf("read vacuum ruleset %s: %w", resolved, err)
	}
	userRuleSet, err := vrulesets.CreateRuleSetFromData(data)
	if err != nil {
		return nil, fmt.Errorf("parse vacuum ruleset %s: %w", resolved, err)
	}
	return defaults.GenerateRuleSetFromSuppliedRuleSet(userRuleSet), nil
}

func parseMinimumSeverity(raw string) barrelman.Severity {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "error":
		return barrelman.SeverityError
	case "warn", "warning":
		return barrelman.SeverityWarning
	case "info":
		return barrelman.SeverityInfo
	case "hint":
		return barrelman.SeverityHint
	default:
		return 0
	}
}

func (e *Engine) convertResults(results []vmodel.RuleFunctionResult, uri string) []barrelman.Diagnostic {
	if len(results) == 0 {
		return nil
	}
	diags := make([]barrelman.Diagnostic, 0, len(results))
	for _, result := range results {
		diag := convertResult(result, uri)
		if e.minSeverity > 0 && diag.Severity > e.minSeverity {
			continue
		}
		diags = append(diags, diag)
	}
	if len(diags) == 0 {
		return nil
	}
	return diags
}

func convertResult(result vmodel.RuleFunctionResult, uri string) barrelman.Diagnostic {
	// Route the vacuum rule id through the bridge so diagnostics emitted by
	// vacuum converge on the same canonical SailPoint slug that barrelman
	// emits. Rules with no bridge entry pass through unchanged.
	ruleID := bridge.Canonical(result.RuleId)
	diag := barrelman.Diagnostic{
		URI:      uri,
		Range:    rangeFromResult(result),
		Severity: severityFromResult(result),
		Code:     ruleID,
		Source:   Source,
		Message:  strings.TrimSpace(result.Message),
	}
	if diag.Message == "" && result.Rule != nil {
		diag.Message = strings.TrimSpace(result.Rule.Description)
	}
	if diag.Message == "" {
		diag.Message = "Vacuum rule violation"
	}
	if result.Rule != nil {
		diag.CodeDescription = strings.TrimSpace(result.Rule.DocumentationURL)
	}
	data := make(map[string]any)
	if result.Path != "" {
		data["path"] = result.Path
	}
	if len(result.Paths) > 0 {
		data["paths"] = append([]string(nil), result.Paths...)
	}
	if result.AutoFixed {
		data["autoFixed"] = true
	}
	if ruleID != result.RuleId {
		data["vacuumRuleId"] = result.RuleId
	}
	if len(data) > 0 {
		diag.Data = data
	}
	return diag
}

func severityFromResult(result vmodel.RuleFunctionResult) barrelman.Severity {
	severity := strings.ToLower(strings.TrimSpace(result.RuleSeverity))
	if severity == "" && result.Rule != nil {
		severity = strings.ToLower(strings.TrimSpace(result.Rule.Severity))
	}
	switch severity {
	case vmodel.SeverityError:
		return barrelman.SeverityError
	case vmodel.SeverityInfo:
		return barrelman.SeverityInfo
	case vmodel.SeverityHint:
		return barrelman.SeverityHint
	default:
		return barrelman.SeverityWarning
	}
}

func rangeFromResult(result vmodel.RuleFunctionResult) barrelman.Range {
	if result.StartNode != nil {
		start := nodePosition(result.StartNode.Line, result.StartNode.Column)
		end := start
		if result.EndNode != nil {
			end = nodePosition(result.EndNode.Line, result.EndNode.Column)
		} else {
			end.Character++
		}
		if end.Character < start.Character {
			end = start
			end.Character++
		}
		return barrelman.Range{Start: start, End: end}
	}
	start := barrelman.Position{
		Line:      clampUint32(result.Range.Start.Line, 0),
		Character: clampUint32(result.Range.Start.Char, 0),
	}
	end := barrelman.Position{
		Line:      clampUint32(result.Range.End.Line, int(start.Line)),
		Character: clampUint32(result.Range.End.Char, int(start.Character)+1),
	}
	if end.Line == start.Line && end.Character <= start.Character {
		end.Character = start.Character + 1
	}
	if end.Line < start.Line {
		end = start
		end.Character++
	}
	return barrelman.Range{Start: start, End: end}
}

func joinVacuumErrors(errs []error) error {
	filtered := make([]error, 0, len(errs))
	for _, err := range errs {
		if err != nil {
			filtered = append(filtered, err)
		}
	}
	if len(filtered) == 0 {
		return nil
	}
	return errors.Join(filtered...)
}

func specFileName(uri string) string {
	if path := filePathFromURI(uri); path != "" {
		return path
	}
	return uri
}

func specBase(uri string) string {
	if path := filePathFromURI(uri); path != "" {
		return filepath.Dir(path)
	}
	return "."
}

func filePathFromURI(raw string) string {
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme == "" || u.Scheme != "file" {
		return ""
	}
	return filepath.FromSlash(u.Path)
}

func nodePosition(line int, column int) barrelman.Position {
	return barrelman.Position{
		Line:      clampUint32(line-1, 0),
		Character: clampUint32(column-1, 0),
	}
}

func clampUint32(v int, floor int) uint32 {
	if v < floor {
		return uint32(floor)
	}
	return uint32(v)
}
