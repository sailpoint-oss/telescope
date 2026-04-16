// Package diff compares OpenAPI documents using libopenapi's semantic diff engine.
package diff

import (
	"errors"
	"fmt"

	"github.com/pb33f/libopenapi"
	"github.com/pb33f/libopenapi/what-changed/model"
)

// CompareOpts configures Compare.
type CompareOpts struct {
	// BreakingRulesPath, if set, loads custom breaking rules from YAML (openapi-changes format).
	BreakingRulesPath string
}

// Result holds the outcome of comparing two OpenAPI documents.
type Result struct {
	Changes *model.DocumentChanges
	// CompareErrs collects non-fatal errors from building models (libopenapi may still return Changes).
	CompareErrs error
}

// TotalChanges returns the total number of semantic changes.
func (r *Result) TotalChanges() int {
	if r == nil || r.Changes == nil {
		return 0
	}
	return r.Changes.TotalChanges()
}

// TotalBreakingChanges returns how many changes are classified as breaking.
func (r *Result) TotalBreakingChanges() int {
	if r == nil || r.Changes == nil {
		return 0
	}
	return r.Changes.TotalBreakingChanges()
}

// Compare parses original and updated spec bytes and runs libopenapi.CompareDocuments.
func Compare(original, updated []byte, opts CompareOpts) (*Result, error) {
	if len(original) == 0 || len(updated) == 0 {
		return nil, errors.New("diff: original and updated bytes must be non-empty")
	}

	origDoc, err := libopenapi.NewDocument(original)
	if err != nil {
		return nil, fmt.Errorf("diff: parse original: %w", err)
	}
	updDoc, err := libopenapi.NewDocument(updated)
	if err != nil {
		return nil, fmt.Errorf("diff: parse updated: %w", err)
	}

	if opts.BreakingRulesPath != "" {
		cfg, err := LoadBreakingRules(opts.BreakingRulesPath)
		if err != nil {
			return nil, fmt.Errorf("diff: load breaking rules: %w", err)
		}
		model.SetActiveBreakingRulesConfig(cfg)
		defer model.ResetActiveBreakingRulesConfig()
	}

	changes, cerr := libopenapi.CompareDocuments(origDoc, updDoc)
	return &Result{Changes: changes, CompareErrs: cerr}, nil
}
