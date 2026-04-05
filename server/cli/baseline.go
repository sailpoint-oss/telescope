package cli

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/LukasParke/gossip/protocol"
)

const baselinePath = ".telescope/baseline.json"

// Baseline stores fingerprinted diagnostics for comparison.
type Baseline struct {
	Version     string                       `json:"version"`
	Diagnostics map[string][]DiagFingerprint `json:"diagnostics"` // file → fingerprints
}

// DiagFingerprint uniquely identifies a diagnostic for baseline comparison.
type DiagFingerprint struct {
	RuleID   string `json:"ruleId"`
	Line     uint32 `json:"line"`
	Hash     string `json:"hash"` // sha256 of message
}

// BaselineComparison holds the result of comparing current diagnostics against a baseline.
type BaselineComparison struct {
	BaselineCount int
	CurrentCount  int
	NewCount      int
	FixedCount    int
	NewDiags      []fileDiagnostics // only new diagnostics
}

// fingerprintDiag creates a fingerprint for a diagnostic.
func fingerprintDiag(d protocol.Diagnostic) DiagFingerprint {
	code := ""
	if d.Code != nil {
		if s, ok := d.Code.(string); ok {
			code = s
		}
	}
	h := sha256.Sum256([]byte(d.Message))
	return DiagFingerprint{
		RuleID: code,
		Line:   d.Range.Start.Line,
		Hash:   fmt.Sprintf("%x", h[:8]),
	}
}

// SaveBaseline writes the current diagnostics as a baseline file.
func SaveBaseline(allDiags []fileDiagnostics) error {
	baseline := Baseline{
		Version:     "1",
		Diagnostics: make(map[string][]DiagFingerprint),
	}

	for _, fd := range allDiags {
		var fps []DiagFingerprint
		for _, d := range fd.Diagnostics {
			fps = append(fps, fingerprintDiag(d))
		}
		baseline.Diagnostics[fd.Path] = fps
	}

	dir := filepath.Dir(baselinePath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create baseline directory: %w", err)
	}

	data, err := json.MarshalIndent(baseline, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal baseline: %w", err)
	}

	return os.WriteFile(baselinePath, data, 0o644)
}

// LoadBaseline reads a baseline file.
func LoadBaseline() (*Baseline, error) {
	data, err := os.ReadFile(baselinePath)
	if err != nil {
		return nil, err
	}
	var baseline Baseline
	if err := json.Unmarshal(data, &baseline); err != nil {
		return nil, fmt.Errorf("parse baseline: %w", err)
	}
	return &baseline, nil
}

// CompareBaseline compares current diagnostics against a saved baseline.
func CompareBaseline(baseline *Baseline, current []fileDiagnostics) BaselineComparison {
	comp := BaselineComparison{}

	// Count baseline diagnostics
	for _, fps := range baseline.Diagnostics {
		comp.BaselineCount += len(fps)
	}

	// Build lookup from baseline
	baselineSet := make(map[string]map[string]bool) // file → set of "ruleId:hash"
	for file, fps := range baseline.Diagnostics {
		set := make(map[string]bool)
		for _, fp := range fps {
			set[fp.RuleID+":"+fp.Hash] = true
		}
		baselineSet[file] = set
	}

	// Compare current against baseline
	currentSet := make(map[string]map[string]bool)
	for _, fd := range current {
		set := make(map[string]bool)
		var newInFile []protocol.Diagnostic
		fileBaseline := baselineSet[fd.Path]

		for _, d := range fd.Diagnostics {
			comp.CurrentCount++
			fp := fingerprintDiag(d)
			key := fp.RuleID + ":" + fp.Hash
			set[key] = true

			if fileBaseline == nil || !fileBaseline[key] {
				comp.NewCount++
				newInFile = append(newInFile, d)
			}
		}

		currentSet[fd.Path] = set
		if len(newInFile) > 0 {
			comp.NewDiags = append(comp.NewDiags, fileDiagnostics{
				Path:        fd.Path,
				Diagnostics: newInFile,
			})
		}
	}

	// Count fixed (in baseline but not in current)
	for file, fps := range baseline.Diagnostics {
		cSet := currentSet[file]
		for _, fp := range fps {
			key := fp.RuleID + ":" + fp.Hash
			if cSet == nil || !cSet[key] {
				comp.FixedCount++
			}
		}
	}

	return comp
}
