package generation

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
)

// WriteMode controls when Loop materialises the in-memory spec to disk.
type WriteMode string

const (
	// WriteNever disables all disk writes regardless of output/writeSourceMap.
	WriteNever WriteMode = "never"
	// WriteOnDemand only writes when the user explicitly asks via CLI/command.
	WriteOnDemand WriteMode = "onDemand"
	// WriteOnSave writes after regenerations triggered by a didSave event.
	WriteOnSave WriteMode = "onSave"
	// WriteAlways writes after every successful regeneration.
	WriteAlways WriteMode = "always"
)

// normalizeWriteMode normalises config input, falling back to the documented
// default: onDemand when output is set, never otherwise.
func normalizeWriteMode(raw string, hasOutput bool) WriteMode {
	switch WriteMode(raw) {
	case WriteNever, WriteOnDemand, WriteOnSave, WriteAlways:
		return WriteMode(raw)
	}
	if hasOutput {
		return WriteOnDemand
	}
	return WriteNever
}

// DiskWriter persists extraction results to disk according to a WriteMode
// policy. The Loop constructs one DiskWriter per workspace root.
type DiskWriter struct {
	outputPath     string
	writeSourceMap bool
	mode           WriteMode
}

// NewDiskWriter constructs a DiskWriter. outputPath may be empty, in which
// case Write is a no-op regardless of mode.
func NewDiskWriter(outputPath string, writeSourceMap bool, mode WriteMode) *DiskWriter {
	return &DiskWriter{outputPath: outputPath, writeSourceMap: writeSourceMap, mode: mode}
}

// Mode returns the current WriteMode policy.
func (w *DiskWriter) Mode() WriteMode {
	if w == nil {
		return WriteNever
	}
	return w.mode
}

// OutputPath returns the configured output path, if any.
func (w *DiskWriter) OutputPath() string {
	if w == nil {
		return ""
	}
	return w.outputPath
}

// Trigger describes why the Loop asked the writer to persist.
type Trigger string

const (
	TriggerAuto     Trigger = "auto"     // post-regenerate write, subject to mode
	TriggerOnSave   Trigger = "onSave"   // didSave-fired regenerate
	TriggerOnDemand Trigger = "onDemand" // explicit CLI/LSP command
)

// ShouldWrite returns true if the configured mode permits a write for the
// given trigger.
func (w *DiskWriter) ShouldWrite(trigger Trigger) bool {
	if w == nil || w.outputPath == "" {
		return false
	}
	switch w.mode {
	case WriteNever:
		return false
	case WriteOnDemand:
		return trigger == TriggerOnDemand
	case WriteOnSave:
		return trigger == TriggerOnSave || trigger == TriggerOnDemand
	case WriteAlways:
		return true
	}
	return false
}

// Write persists the spec (and optional sourcemap sidecar) to disk, if the
// current mode permits it for the given trigger.
func (w *DiskWriter) Write(result *Result, trigger Trigger) error {
	if !w.ShouldWrite(trigger) {
		return nil
	}
	if result == nil {
		return fmt.Errorf("nil extraction result")
	}
	path := w.outputPath
	if !filepath.IsAbs(path) && result.Root != "" {
		path = filepath.Join(result.Root, path)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("mkdir %s: %w", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, result.SpecBytes, 0o644); err != nil {
		return fmt.Errorf("write spec %s: %w", path, err)
	}
	if w.writeSourceMap && result.SourceMap != nil {
		if err := result.SourceMap.WriteJSON(sidecarPath(path)); err != nil {
			return fmt.Errorf("write sourcemap: %w", err)
		}
	}
	return nil
}

// OnDiskHash returns the sha256 hex digest of the current on-disk spec, if
// any. Loop uses this to detect manual-edit skew vs. the last extraction.
func (w *DiskWriter) OnDiskHash(result *Result) (string, bool, error) {
	path := w.outputPath
	if path == "" {
		return "", false, nil
	}
	if !filepath.IsAbs(path) && result != nil && result.Root != "" {
		path = filepath.Join(result.Root, path)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return "", false, nil
		}
		return "", false, err
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), true, nil
}

func sidecarPath(specPath string) string {
	ext := filepath.Ext(specPath)
	return specPath[:len(specPath)-len(ext)] + ".sourcemap.json"
}
