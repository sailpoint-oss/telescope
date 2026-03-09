package validate

import (
	"fmt"
	"strings"

	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
)

// ErrorEnricher transforms validation errors to provide better messages, fixes, and context.
type ErrorEnricher interface {
	Matches(err *ValidationError) bool
	Enrich(err *ValidationError, content []byte) *ValidationError
}

// EnrichmentPipeline runs enrichers in order; the first matching enricher wins.
type EnrichmentPipeline struct {
	enrichers []ErrorEnricher
}

// NewEnrichmentPipeline creates a pipeline with the given enrichers (ordered by specificity).
func NewEnrichmentPipeline(enrichers ...ErrorEnricher) *EnrichmentPipeline {
	if enrichers == nil {
		enrichers = []ErrorEnricher{}
	}
	return &EnrichmentPipeline{enrichers: enrichers}
}

// DefaultPipeline returns the standard enrichment pipeline with all built-in enrichers.
func DefaultPipeline() *EnrichmentPipeline {
	return NewEnrichmentPipeline(
		&DiscriminatorEnricher{},
		&RefContextEnricher{},
		&TypoEnricher{},
		&MissingRequiredEnricher{},
		&TypeMismatchEnricher{},
	)
}

// Enrich runs the first matching enricher on the error.
func (p *EnrichmentPipeline) Enrich(err *ValidationError, content []byte) *ValidationError {
	for _, e := range p.enrichers {
		if e.Matches(err) {
			return e.Enrich(err, content)
		}
	}
	return err
}

// EnrichAll runs the pipeline on a slice of errors.
func (p *EnrichmentPipeline) EnrichAll(errs []ValidationError, content []byte) []ValidationError {
	result := make([]ValidationError, len(errs))
	for i, e := range errs {
		enriched := p.Enrich(&e, content)
		result[i] = *enriched
	}
	return result
}

// TypoEnricher suggests corrections for misspelled enum/const values using
// Levenshtein distance, and produces a Fix with a TextEdit to replace the value.
type TypoEnricher struct{}

func (e *TypoEnricher) Matches(err *ValidationError) bool {
	return err.Keyword == "enum" || err.Keyword == "const"
}

func (e *TypoEnricher) Enrich(err *ValidationError, _ []byte) *ValidationError {
	enriched := &ValidationError{
		Range:        err.Range,
		SchemaPath:   err.SchemaPath,
		InstancePath: err.InstancePath,
		Keyword:      err.Keyword,
		ActualValue:  err.ActualValue,
		EnumValues:   err.EnumValues,
	}

	if err.ActualValue == "" || len(err.EnumValues) == 0 {
		enriched.Message = err.Message
		return enriched
	}

	// Find the closest enum value using Levenshtein distance
	bestMatch := ""
	bestDist := -1
	for _, candidate := range err.EnumValues {
		dist := levenshtein(strings.ToLower(err.ActualValue), strings.ToLower(candidate))
		if bestDist < 0 || dist < bestDist {
			bestDist = dist
			bestMatch = candidate
		}
	}

	if bestDist >= 0 && bestDist <= 2 && bestMatch != "" {
		enriched.Message = fmt.Sprintf("Value %q is not a valid enum member. Did you mean %q?", err.ActualValue, bestMatch)
		enriched.Fixes = append(enriched.Fixes, ctypes.Fix{
			Description: fmt.Sprintf("Replace with %q", bestMatch),
			Edits: []ctypes.TextEdit{{
				Range:   err.Range,
				NewText: bestMatch,
			}},
		})
	} else {
		enriched.Message = fmt.Sprintf("Value %q is not a valid enum member. %s", err.ActualValue, err.Message)
	}

	return enriched
}

// MissingRequiredEnricher provides clearer messages for missing required properties
// and produces a Fix that inserts the missing property with a TODO placeholder.
type MissingRequiredEnricher struct{}

func (e *MissingRequiredEnricher) Matches(err *ValidationError) bool {
	return err.Keyword == "required"
}

func (e *MissingRequiredEnricher) Enrich(err *ValidationError, content []byte) *ValidationError {
	missingProp := extractMissingProperty(err.Message)
	msg := err.Message
	if missingProp != "" {
		msg = fmt.Sprintf("Missing required property: %q", missingProp)
	}

	parentPath := parentPointer(err.InstancePath)
	enriched := &ValidationError{
		Range:        err.Range,
		Message:      msg,
		SchemaPath:   err.SchemaPath,
		InstancePath: parentPath,
		Keyword:      err.Keyword,
	}

	if missingProp != "" {
		indent := guessIndent(content, err.Range.Start.Line)
		insertLine := err.Range.End.Line + 1
		newText := indent + missingProp + ": TODO\n"
		enriched.Fixes = append(enriched.Fixes, ctypes.Fix{
			Description: fmt.Sprintf("Add required property %q", missingProp),
			Edits: []ctypes.TextEdit{{
				Range: ctypes.Range{
					Start: ctypes.Position{Line: insertLine, Character: 0},
					End:   ctypes.Position{Line: insertLine, Character: 0},
				},
				NewText: newText,
			}},
		})
	}

	return enriched
}

// guessIndent returns the leading whitespace of the given line in content.
func guessIndent(content []byte, line uint32) string {
	if len(content) == 0 {
		return "  "
	}
	var currentLine uint32
	start := 0
	for i, b := range content {
		if currentLine == line {
			start = i
			break
		}
		if b == '\n' {
			currentLine++
		}
	}
	indent := ""
	for i := start; i < len(content) && (content[i] == ' ' || content[i] == '\t'); i++ {
		indent += string(content[i])
	}
	if indent == "" {
		indent = "  "
	}
	return indent
}

// TypeMismatchEnricher provides clearer messages for type mismatches.
type TypeMismatchEnricher struct{}

func (e *TypeMismatchEnricher) Matches(err *ValidationError) bool {
	return err.Keyword == "type"
}

func (e *TypeMismatchEnricher) Enrich(err *ValidationError, _ []byte) *ValidationError {
	msg := err.Message
	if err.ActualValue != "" {
		msg = fmt.Sprintf("Type mismatch: got %s. %s", err.ActualValue, err.Message)
	}
	return &ValidationError{
		Range:        err.Range,
		Message:      msg,
		SchemaPath:   err.SchemaPath,
		InstancePath: err.InstancePath,
		Keyword:      err.Keyword,
		ActualValue:  err.ActualValue,
	}
}

// DiscriminatorEnricher provides clearer messages when discriminator validation fails.
type DiscriminatorEnricher struct{}

func (e *DiscriminatorEnricher) Matches(err *ValidationError) bool {
	return strings.Contains(err.SchemaPath, "discriminator")
}

func (e *DiscriminatorEnricher) Enrich(err *ValidationError, _ []byte) *ValidationError {
	return &ValidationError{
		Range:        err.Range,
		Message:      fmt.Sprintf("Discriminator validation failed: %s", err.Message),
		SchemaPath:   err.SchemaPath,
		InstancePath: err.InstancePath,
		Keyword:      err.Keyword,
	}
}

// RefContextEnricher adds context when an error occurs inside a resolved $ref.
type RefContextEnricher struct{}

func (e *RefContextEnricher) Matches(err *ValidationError) bool {
	return strings.Contains(err.SchemaPath, "$ref")
}

func (e *RefContextEnricher) Enrich(err *ValidationError, _ []byte) *ValidationError {
	refTarget := extractRefTarget(err.SchemaPath)
	msg := err.Message
	if refTarget != "" {
		msg = fmt.Sprintf("%s (via $ref to %s)", err.Message, refTarget)
	}
	return &ValidationError{
		Range:        err.Range,
		Message:      msg,
		SchemaPath:   err.SchemaPath,
		InstancePath: err.InstancePath,
		Keyword:      err.Keyword,
		ActualValue:  err.ActualValue,
	}
}

func parentPointer(pointer string) string {
	if pointer == "" || pointer == "/" {
		return ""
	}
	idx := strings.LastIndex(pointer, "/")
	if idx <= 0 {
		return ""
	}
	return pointer[:idx]
}

func extractMissingProperty(msg string) string {
	// Common patterns: "missing properties: 'foo'" or "required property 'foo' missing"
	if idx := strings.Index(msg, "'"); idx >= 0 {
		end := strings.Index(msg[idx+1:], "'")
		if end >= 0 {
			return msg[idx+1 : idx+1+end]
		}
	}
	return ""
}

func extractRefTarget(schemaPath string) string {
	// Extract the $ref target from the schema path
	idx := strings.Index(schemaPath, "$ref")
	if idx < 0 {
		return ""
	}
	// The segment after $ref in the path is the target
	rest := schemaPath[idx:]
	if parts := strings.SplitN(rest, "/", 3); len(parts) > 1 {
		return parts[1]
	}
	return ""
}

// levenshtein computes the Levenshtein edit distance between two strings.
func levenshtein(a, b string) int {
	la, lb := len(a), len(b)
	if la == 0 {
		return lb
	}
	if lb == 0 {
		return la
	}

	prev := make([]int, lb+1)
	curr := make([]int, lb+1)
	for j := range prev {
		prev[j] = j
	}

	for i := 1; i <= la; i++ {
		curr[0] = i
		for j := 1; j <= lb; j++ {
			cost := 1
			if a[i-1] == b[j-1] {
				cost = 0
			}
			curr[j] = min(curr[j-1]+1, min(prev[j]+1, prev[j-1]+cost))
		}
		prev, curr = curr, prev
	}
	return prev[lb]
}
