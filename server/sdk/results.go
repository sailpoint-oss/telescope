package sdk

import (
	"time"

	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
)

// AnalysisResult contains the results of a workspace analysis run.
type AnalysisResult struct {
	Diagnostics    map[string][]ctypes.Diagnostic // URI -> diagnostics
	NodeCount      int
	EdgeCount      int
	RootDocuments  []string
	Duration       time.Duration
	SnapshotID     uint64
	StageDurations map[string]time.Duration // stage name -> total duration
	RuleDurations  map[string]time.Duration // rule code -> total duration
}

// TotalDiagnostics returns the total count of diagnostics across all documents.
func (r *AnalysisResult) TotalDiagnostics() int {
	total := 0
	for _, diags := range r.Diagnostics {
		total += len(diags)
	}
	return total
}

// DiagnosticsForURI returns diagnostics for a specific document.
func (r *AnalysisResult) DiagnosticsForURI(uri string) []ctypes.Diagnostic {
	return r.Diagnostics[uri]
}

// HasErrors returns true if any diagnostic has error severity.
func (r *AnalysisResult) HasErrors() bool {
	for _, diags := range r.Diagnostics {
		for _, d := range diags {
			if d.Severity == ctypes.SeverityError {
				return true
			}
		}
	}
	return false
}
