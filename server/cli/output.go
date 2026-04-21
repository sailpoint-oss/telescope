package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/LukasParke/gossip/protocol"
)

func outputResults(results []fileDiagnostics, format string) {
	switch format {
	case "json":
		outputJSON(results)
	case "sarif":
		outputSARIF(results)
	case "github":
		outputGitHub(results)
	default:
		outputText(results)
	}
}

func outputText(results []fileDiagnostics) {
	total := 0
	fixableCount := 0
	for _, fd := range results {
		for _, d := range fd.Diagnostics {
			sev := severityIcon(d.Severity)
			code := ""
			ruleID := ""
			if d.Code != nil {
				if s, ok := d.Code.(string); ok {
					ruleID = s
				}
				code = fmt.Sprintf(" [%v]", d.Code)
			}

			// Enhanced message with fix hint
			fixHint := fixSuggestion(ruleID)
			if fixHint != "" {
				fixableCount++
				code += " " + fixHint
			}

			fmt.Fprintf(os.Stdout, "%s:%d:%d: %s %s%s\n",
				fd.Path,
				d.Range.Start.Line+1,
				d.Range.Start.Character+1,
				sev,
				d.Message,
				code,
			)
			total++
		}
	}
	if total > 0 {
		summary := fmt.Sprintf("\n%d problem(s) in %d file(s)", total, len(results))
		if fixableCount > 0 {
			summary += fmt.Sprintf(" (%d auto-fixable)", fixableCount)
		}
		fmt.Fprintln(os.Stderr, summary)
	}
}

// fixSuggestion returns a short fix hint for auto-fixable rules.
func fixSuggestion(ruleID string) string {
	switch ruleID {
	case "operation-description", "deprecated-description":
		return "(add 'description' field)"
	case "sailpoint-operation-id-camel-case":
		return "(add 'operationId' field)"
	case "sailpoint-operation-single-tag":
		return "(add an operation tag)"
	case "sailpoint-operation-4xx-response":
		return "(add standard error responses)"
	case "no-request-body-on-get":
		return "(remove requestBody)"
	case "unused-component":
		return "(remove unused component)"
	case "migration-nullable":
		return "(use type array in 3.1)"
	default:
		return ""
	}
}

func outputJSON(results []fileDiagnostics) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	enc.Encode(results)
}

func outputSARIF(results []fileDiagnostics) {
	sarif := map[string]interface{}{
		"version": "2.1.0",
		"$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
		"runs": []map[string]interface{}{
			{
				"tool": map[string]interface{}{
					"driver": map[string]interface{}{
						"name":    "telescope",
						"version": "0.1.0",
					},
				},
				"results": buildSARIFResults(results),
			},
		},
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	enc.Encode(sarif)
}

func buildSARIFResults(results []fileDiagnostics) []map[string]interface{} {
	var sarifResults []map[string]interface{}
	for _, fd := range results {
		for _, d := range fd.Diagnostics {
			r := map[string]interface{}{
				"ruleId":  d.Code,
				"level":   sarifLevel(d.Severity),
				"message": map[string]string{"text": d.Message},
				"locations": []map[string]interface{}{
					{
						"physicalLocation": map[string]interface{}{
							"artifactLocation": map[string]string{"uri": fd.Path},
							"region": map[string]interface{}{
								"startLine":   d.Range.Start.Line + 1,
								"startColumn": d.Range.Start.Character + 1,
								"endLine":     d.Range.End.Line + 1,
								"endColumn":   d.Range.End.Character + 1,
							},
						},
					},
				},
			}
			sarifResults = append(sarifResults, r)
		}
	}
	return sarifResults
}

func outputGitHub(results []fileDiagnostics) {
	wd, _ := os.Getwd()
	for _, fd := range results {
		relPath, err := filepath.Rel(wd, fd.Path)
		if err != nil {
			relPath = fd.Path
		}
		for _, d := range fd.Diagnostics {
			level := "warning"
			switch d.Severity {
			case protocol.SeverityError:
				level = "error"
			case protocol.SeverityInformation, protocol.SeverityHint:
				level = "notice"
			}
			// Annotate the diagnostic. Reviewers that want true
			// "Commit suggestion" buttons should run
			//   telescope fix --format=json
			// and feed the JSON to a review-posting Action (the JSON
			// carries the byte-range patch for each fixable finding).
			msg := d.Message
			if ruleID, ok := d.Code.(string); ok && ruleID != "" {
				msg = fmt.Sprintf("[%s] %s", ruleID, msg)
			}
			fmt.Fprintf(os.Stdout, "::%s file=%s,line=%d,col=%d::%s\n",
				level, relPath, d.Range.Start.Line+1, d.Range.Start.Character+1, msg)
		}
	}
}

func severityIcon(s protocol.DiagnosticSeverity) string {
	switch s {
	case protocol.SeverityError:
		return "error"
	case protocol.SeverityWarning:
		return "warning"
	case protocol.SeverityInformation:
		return "info"
	case protocol.SeverityHint:
		return "hint"
	default:
		return "unknown"
	}
}

func sarifLevel(s protocol.DiagnosticSeverity) string {
	switch s {
	case protocol.SeverityError:
		return "error"
	case protocol.SeverityWarning:
		return "warning"
	case protocol.SeverityInformation:
		return "note"
	default:
		return "note"
	}
}
