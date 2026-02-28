package cli

import (
	"encoding/json"
	"fmt"
	"os"

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
	for _, fd := range results {
		for _, d := range fd.Diagnostics {
			sev := severityIcon(d.Severity)
			code := ""
			if d.Code != nil {
				code = fmt.Sprintf(" [%v]", d.Code)
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
		fmt.Fprintf(os.Stderr, "\n%d problem(s) in %d file(s)\n", total, len(results))
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
								"startLine":      d.Range.Start.Line + 1,
								"startColumn":    d.Range.Start.Character + 1,
								"endLine":        d.Range.End.Line + 1,
								"endColumn":      d.Range.End.Character + 1,
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
	for _, fd := range results {
		for _, d := range fd.Diagnostics {
			level := "warning"
			if d.Severity == protocol.SeverityError {
				level = "error"
			}
			fmt.Fprintf(os.Stdout, "::%s file=%s,line=%d,col=%d::%s\n",
				level, fd.Path, d.Range.Start.Line+1, d.Range.Start.Character+1, d.Message)
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

