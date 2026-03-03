package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/LukasParke/gossip/protocol"
)

// LintReport is the structured output written by --report-json.
type LintReport struct {
	Workspace       string            `json:"workspace"`
	GeneratedAt     string            `json:"generatedAt"`
	DiagnosticCount int               `json:"diagnosticCount"`
	Files           []fileDiagnostics `json:"files"`
	Counts          SeverityCounts    `json:"counts"`
	ByFile          map[string]int    `json:"byFile"`
	ByRule          map[string]int    `json:"byRule"`
}

// SeverityCounts breaks down diagnostic counts by severity.
type SeverityCounts struct {
	Error   int `json:"error"`
	Warning int `json:"warning"`
	Info    int `json:"info"`
	Hint    int `json:"hint"`
}

func buildLintReport(workspace string, files []string, allDiags []fileDiagnostics) *LintReport {
	report := &LintReport{
		Workspace:   workspace,
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		Files:       allDiags,
		ByFile:      make(map[string]int),
		ByRule:      make(map[string]int),
	}

	for _, fd := range allDiags {
		rel, err := filepath.Rel(workspace, fd.Path)
		if err != nil {
			rel = fd.Path
		}
		report.ByFile[rel] = len(fd.Diagnostics)
		report.DiagnosticCount += len(fd.Diagnostics)

		for _, d := range fd.Diagnostics {
			switch d.Severity {
			case protocol.SeverityError:
				report.Counts.Error++
			case protocol.SeverityWarning:
				report.Counts.Warning++
			case protocol.SeverityInformation:
				report.Counts.Info++
			case protocol.SeverityHint:
				report.Counts.Hint++
			}
			code := ""
			if d.Code != nil {
				code = fmt.Sprintf("%v", d.Code)
			}
			if code != "" {
				report.ByRule[code]++
			}
		}
	}

	return report
}

func writeJSONReport(path string, report *LintReport) error {
	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal report: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0644)
}

func writeMDReport(path string, report *LintReport) error {
	var b strings.Builder

	b.WriteString("# Telescope Lint Report\n\n")
	b.WriteString(fmt.Sprintf("> Generated %s\n\n", report.GeneratedAt))

	b.WriteString("## Summary\n\n")
	b.WriteString("| Metric | Value |\n")
	b.WriteString("| --- | --- |\n")
	b.WriteString(fmt.Sprintf("| Workspace | `%s` |\n", report.Workspace))
	b.WriteString(fmt.Sprintf("| Diagnostics | %d |\n", report.DiagnosticCount))
	b.WriteString(fmt.Sprintf("| Errors | %d |\n", report.Counts.Error))
	b.WriteString(fmt.Sprintf("| Warnings | %d |\n", report.Counts.Warning))
	b.WriteString(fmt.Sprintf("| Info | %d |\n", report.Counts.Info))
	b.WriteString(fmt.Sprintf("| Hints | %d |\n", report.Counts.Hint))
	b.WriteString(fmt.Sprintf("| Files with issues | %d |\n", len(report.ByFile)))
	b.WriteString("\n")

	// Per-file summary
	if len(report.ByFile) > 0 {
		b.WriteString("## Files\n\n")
		b.WriteString("| File | Count |\n")
		b.WriteString("| --- | ---: |\n")

		type fileCount struct {
			file  string
			count int
		}
		var sorted []fileCount
		for f, c := range report.ByFile {
			sorted = append(sorted, fileCount{f, c})
		}
		sort.Slice(sorted, func(i, j int) bool {
			return sorted[i].count > sorted[j].count
		})
		for _, fc := range sorted {
			b.WriteString(fmt.Sprintf("| `%s` | %d |\n", fc.file, fc.count))
		}
		b.WriteString("\n")
	}

	// Per-rule summary
	if len(report.ByRule) > 0 {
		b.WriteString("## Rules\n\n")
		b.WriteString("| Rule | Count |\n")
		b.WriteString("| --- | ---: |\n")

		type ruleCount struct {
			rule  string
			count int
		}
		var sorted []ruleCount
		for r, c := range report.ByRule {
			sorted = append(sorted, ruleCount{r, c})
		}
		sort.Slice(sorted, func(i, j int) bool {
			return sorted[i].count > sorted[j].count
		})
		for _, rc := range sorted {
			b.WriteString(fmt.Sprintf("| `%s` | %d |\n", rc.rule, rc.count))
		}
		b.WriteString("\n")
	}

	// Diagnostics grouped by rule
	if report.DiagnosticCount > 0 {
		byRule := make(map[string][]diagEntry)
		for _, fd := range report.Files {
			rel, err := filepath.Rel(report.Workspace, fd.Path)
			if err != nil {
				rel = fd.Path
			}
			for _, d := range fd.Diagnostics {
				code := ""
				if d.Code != nil {
					code = fmt.Sprintf("%v", d.Code)
				}
				byRule[code] = append(byRule[code], diagEntry{
					file:     rel,
					line:     int(d.Range.Start.Line) + 1,
					severity: severityName(d.Severity),
					message:  d.Message,
				})
			}
		}

		b.WriteString("## Diagnostics (by rule)\n\n")
		var codes []string
		for code := range byRule {
			codes = append(codes, code)
		}
		sort.Slice(codes, func(i, j int) bool {
			return len(byRule[codes[i]]) > len(byRule[codes[j]])
		})

		for _, code := range codes {
			entries := byRule[code]
			b.WriteString(fmt.Sprintf("<details>\n<summary><code>%s</code> (%d)</summary>\n\n", code, len(entries)))
			b.WriteString("| Severity | File | Line | Message |\n")
			b.WriteString("| --- | --- | ---: | --- |\n")
			for _, e := range entries {
				msg := strings.ReplaceAll(e.message, "|", "\\|")
				msg = strings.ReplaceAll(msg, "\n", " ")
				b.WriteString(fmt.Sprintf("| %s | `%s` | %d | %s |\n", e.severity, e.file, e.line, msg))
			}
			b.WriteString("\n</details>\n\n")
		}
	}

	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(b.String()), 0644)
}

type diagEntry struct {
	file     string
	line     int
	severity string
	message  string
}

func severityName(s protocol.DiagnosticSeverity) string {
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
