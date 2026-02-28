package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/LukasParke/gossip/protocol"
)

// WriteMarkdownReport writes a markdown-formatted report to the given path.
func WriteMarkdownReport(path string, results []fileDiagnostics) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	var errors, warnings, infos int
	for _, fd := range results {
		for _, d := range fd.Diagnostics {
			switch d.Severity {
			case protocol.SeverityError:
				errors++
			case protocol.SeverityWarning:
				warnings++
			default:
				infos++
			}
		}
	}

	fmt.Fprintf(f, "# Telescope Lint Report\n\n")
	fmt.Fprintf(f, "**Summary:** %d errors, %d warnings, %d info\n\n", errors, warnings, infos)

	if len(results) == 0 {
		fmt.Fprintln(f, "No issues found.")
		return nil
	}

	fmt.Fprintln(f, "| File | Line | Severity | Rule | Message |")
	fmt.Fprintln(f, "|------|------|----------|------|---------|")

	for _, fd := range results {
		for _, d := range fd.Diagnostics {
			code := ""
			if d.Code != nil {
				code = fmt.Sprintf("%v", d.Code)
			}
			fmt.Fprintf(f, "| %s | %d | %s | %s | %s |\n",
				fd.Path, d.Range.Start.Line+1,
				severityIcon(d.Severity), code,
				strings.ReplaceAll(d.Message, "|", "\\|"),
			)
		}
	}

	return nil
}

// WriteJSONReport writes a JSON-formatted report to the given path.
func WriteJSONReport(path string, results []fileDiagnostics) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	return enc.Encode(results)
}
