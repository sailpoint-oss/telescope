package wiretap

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path"
	"regexp"
	"strings"

	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// WiretapFinding is the normalized Telescope-side view of one wiretap validation finding.
type WiretapFinding struct {
	Method            string `json:"method,omitempty"`
	Path              string `json:"path,omitempty"`
	StatusCode        int    `json:"statusCode,omitempty"`
	Direction         string `json:"direction,omitempty"`
	Message           string `json:"message,omitempty"`
	RuleID            string `json:"ruleId,omitempty"`
	Severity          string `json:"severity,omitempty"`
	SpecName          string `json:"specName,omitempty"`
	ValidationType    string `json:"validationType,omitempty"`
	ValidationSubType string `json:"validationSubType,omitempty"`
	FieldPath         string `json:"fieldPath,omitempty"`
	HowToFix          string `json:"howToFix,omitempty"`
	SpecLine          int    `json:"specLine,omitempty"`
	SpecColumn        int    `json:"specColumn,omitempty"`
}

type streamedValidationError struct {
	Message                string `json:"message"`
	Reason                 string `json:"reason"`
	ValidationType         string `json:"validationType"`
	ValidationSubType      string `json:"validationSubType"`
	RequestPath            string `json:"requestPath"`
	RequestMethod          string `json:"requestMethod"`
	ParameterName          string `json:"parameterName"`
	HowToFix               string `json:"howToFix"`
	SpecLine               int    `json:"specLine"`
	SpecColumn             int    `json:"specColumn"`
	SpecName               string `json:"specName"`
	SchemaValidationErrors []struct {
		Reason    string `json:"reason"`
		FieldPath string `json:"fieldPath"`
	} `json:"validationErrors"`
}

// CollectReport reads the wiretap JSONL report file and returns normalized findings.
func (s *Sidecar) CollectReport() ([]WiretapFinding, error) {
	if s == nil {
		return nil, nil
	}
	s.mu.Lock()
	reportFile := s.reportFile
	s.mu.Unlock()
	if strings.TrimSpace(reportFile) == "" {
		return nil, nil
	}
	f, err := os.Open(reportFile)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("wiretap: open report: %w", err)
	}
	defer f.Close()

	var findings []WiretapFinding
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var streamed streamedValidationError
		if err := json.Unmarshal([]byte(line), &streamed); err != nil {
			return nil, fmt.Errorf("wiretap: parse report line: %w", err)
		}
		findings = append(findings, findingFromStreamedError(streamed))
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("wiretap: read report: %w", err)
	}
	return findings, nil
}

func findingFromStreamedError(err streamedValidationError) WiretapFinding {
	fieldPath := ""
	var schemaMsgs []string
	for _, schemaErr := range err.SchemaValidationErrors {
		if strings.TrimSpace(schemaErr.FieldPath) != "" && fieldPath == "" {
			fieldPath = strings.TrimSpace(schemaErr.FieldPath)
		}
		schemaMsgs = append(schemaMsgs, joinNonEmpty(schemaErr.FieldPath, schemaErr.Reason))
	}
	message := joinNonEmpty(err.Message, err.Reason)
	if len(schemaMsgs) > 0 {
		message = joinNonEmpty(message, strings.Join(schemaMsgs, "; "))
	}
	direction := "request"
	if strings.Contains(strings.ToLower(err.ValidationType), "response") {
		direction = "response"
	}
	ruleID := err.ValidationType
	if strings.TrimSpace(err.ValidationSubType) != "" {
		ruleID = strings.TrimSpace(ruleID) + "." + strings.TrimSpace(err.ValidationSubType)
	}
	if strings.TrimSpace(ruleID) == "" {
		ruleID = direction
	}
	return WiretapFinding{
		Method:            strings.ToUpper(strings.TrimSpace(err.RequestMethod)),
		Path:              strings.TrimSpace(err.RequestPath),
		Direction:         direction,
		Message:           strings.TrimSpace(message),
		RuleID:            strings.TrimSpace(ruleID),
		Severity:          "error",
		SpecName:          strings.TrimSpace(err.SpecName),
		ValidationType:    strings.TrimSpace(err.ValidationType),
		ValidationSubType: strings.TrimSpace(err.ValidationSubType),
		FieldPath:         fieldPath,
		HowToFix:          strings.TrimSpace(err.HowToFix),
		SpecLine:          err.SpecLine,
		SpecColumn:        err.SpecColumn,
	}
}

// ToDiagnostics converts wiretap findings into LSP diagnostics.
func ToDiagnostics(findings []WiretapFinding, idx *openapi.Index, uri string) []protocol.Diagnostic {
	if len(findings) == 0 {
		return nil
	}
	out := make([]protocol.Diagnostic, 0, len(findings))
	for _, finding := range findings {
		message := strings.TrimSpace(finding.Message)
		if message == "" {
			message = "wiretap validation failed"
		}
		if finding.HowToFix != "" {
			message += ". " + strings.TrimSpace(finding.HowToFix)
		}
		pathText := strings.TrimSpace(finding.Path)
		method := strings.ToUpper(strings.TrimSpace(finding.Method))
		prefix := strings.TrimSpace(strings.Join([]string{method, pathText}, " "))
		if prefix != "" {
			message = prefix + ": " + message
		}
		out = append(out, protocol.Diagnostic{
			Range:    diagnosticRangeForFinding(idx, finding),
			Severity: protocol.SeverityError,
			Source:   "wiretap",
			Code:     "wiretap." + diagnosticCodeSuffix(finding),
			Message:  message,
			Data: map[string]any{
				"uri":        uri,
				"direction":  finding.Direction,
				"ruleId":     finding.RuleID,
				"fieldPath":  finding.FieldPath,
				"validation": finding.ValidationType,
			},
		})
	}
	return out
}

func diagnosticRangeForFinding(idx *openapi.Index, finding WiretapFinding) protocol.Range {
	if finding.SpecLine > 0 {
		line := uint32(finding.SpecLine - 1)
		character := uint32(0)
		if finding.SpecColumn > 0 {
			character = uint32(finding.SpecColumn - 1)
		}
		return protocol.Range{
			Start: protocol.Position{Line: line, Character: character},
			End:   protocol.Position{Line: line, Character: character + 1},
		}
	}
	if idx == nil {
		return protocol.Range{
			Start: protocol.Position{Line: 0, Character: 0},
			End:   protocol.Position{Line: 0, Character: 1},
		}
	}
	pathText := strings.TrimSpace(finding.Path)
	method := strings.ToUpper(strings.TrimSpace(finding.Method))
	for template, refs := range idx.OperationsByPath {
		if !pathMatchesTemplate(pathText, template) {
			continue
		}
		for _, ref := range refs {
			if !strings.EqualFold(ref.Method, method) || ref.Operation == nil {
				continue
			}
			loc := openapi.LocOrFallback(ref.Operation.OperationIDLoc, ref.Operation.Loc)
			return protocol.Range{
				Start: adapt.PositionToProtocol(loc.Range.Start),
				End:   adapt.PositionToProtocol(loc.Range.End),
			}
		}
	}
	return protocol.Range{
		Start: protocol.Position{Line: 0, Character: 0},
		End:   protocol.Position{Line: 0, Character: 1},
	}
}

func pathMatchesTemplate(actualPath, template string) bool {
	if actualPath == "" || template == "" {
		return false
	}
	if actualPath == template {
		return true
	}
	actualParts := strings.Split(strings.Trim(path.Clean(actualPath), "/"), "/")
	templateParts := strings.Split(strings.Trim(path.Clean(template), "/"), "/")
	if len(actualParts) != len(templateParts) {
		return false
	}
	for i := range actualParts {
		part := templateParts[i]
		if strings.HasPrefix(part, "{") && strings.HasSuffix(part, "}") {
			continue
		}
		if actualParts[i] != part {
			return false
		}
	}
	return true
}

var nonCodeChars = regexp.MustCompile(`[^a-z0-9]+`)

func diagnosticCodeSuffix(finding WiretapFinding) string {
	suffix := strings.ToLower(strings.TrimSpace(finding.RuleID))
	if suffix == "" {
		suffix = strings.ToLower(strings.TrimSpace(finding.Direction))
	}
	if suffix == "" {
		suffix = "validation"
	}
	suffix = nonCodeChars.ReplaceAllString(suffix, ".")
	suffix = strings.Trim(suffix, ".")
	if suffix == "" {
		return "validation"
	}
	return suffix
}

func joinNonEmpty(parts ...string) string {
	filtered := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			filtered = append(filtered, part)
		}
	}
	return strings.Join(filtered, ": ")
}
