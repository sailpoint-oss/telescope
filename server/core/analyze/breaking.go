package analyze

import (
	"fmt"
	"sort"
	"strings"

	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
)

// BreakingChangeKind categorizes the type of breaking change.
type BreakingChangeKind string

const (
	BreakRemovedPath          BreakingChangeKind = "removed-path"
	BreakRemovedOperation     BreakingChangeKind = "removed-operation"
	BreakRemovedParameter     BreakingChangeKind = "removed-parameter"
	BreakNewRequiredParameter BreakingChangeKind = "new-required-parameter"
	BreakTypeNarrowed         BreakingChangeKind = "type-narrowed"
	BreakRemovedEnumValue     BreakingChangeKind = "removed-enum-value"
	BreakAddedSecurity        BreakingChangeKind = "added-security"
	BreakNewRequiredField     BreakingChangeKind = "new-required-field"
	BreakRemovedResponse      BreakingChangeKind = "removed-response"
)

// BreakingChange represents a single detected breaking change.
type BreakingChange struct {
	Kind   BreakingChangeKind
	Path   string // API path, e.g. "/pets"
	Method string // HTTP method, e.g. "get"
	Detail string // human-readable description
	Range  ctypes.Range
}

// SpecSummary is a simplified representation of an API spec for comparison.
// Built from the OpenAPI index to enable diffing without full model dependency.
type SpecSummary struct {
	Paths map[string]PathSummary
}

// PathSummary represents a single path item.
type PathSummary struct {
	Operations map[string]OperationSummary
}

// OperationSummary represents a single operation for comparison.
type OperationSummary struct {
	Parameters      []ParamSummary
	ResponseCodes   []string
	SecuritySchemes []string
	RequestBody     *RequestBodySummary
}

// ParamSummary represents a parameter for comparison.
type ParamSummary struct {
	Name     string
	In       string
	Required bool
	Type     string
	Enum     []string
}

// RequestBodySummary represents a request body for comparison.
type RequestBodySummary struct {
	Required       bool
	RequiredFields []string
}

// DetectBreakingChanges compares a base spec summary to the current spec
// and returns all detected breaking changes.
func DetectBreakingChanges(base, current *SpecSummary) []BreakingChange {
	if base == nil || current == nil {
		return nil
	}

	var changes []BreakingChange

	// Removed paths
	for path := range base.Paths {
		if _, ok := current.Paths[path]; !ok {
			changes = append(changes, BreakingChange{
				Kind:   BreakRemovedPath,
				Path:   path,
				Detail: fmt.Sprintf("Path '%s' was removed", path),
			})
		}
	}

	// Per-path comparison
	for path, basePath := range base.Paths {
		currentPath, ok := current.Paths[path]
		if !ok {
			continue
		}

		// Removed operations
		for method := range basePath.Operations {
			if _, ok := currentPath.Operations[method]; !ok {
				changes = append(changes, BreakingChange{
					Kind:   BreakRemovedOperation,
					Path:   path,
					Method: method,
					Detail: fmt.Sprintf("%s %s was removed", strings.ToUpper(method), path),
				})
			}
		}

		// Per-operation comparison
		for method, baseOp := range basePath.Operations {
			currentOp, ok := currentPath.Operations[method]
			if !ok {
				continue
			}

			changes = append(changes, compareOperations(path, method, baseOp, currentOp)...)
		}
	}

	sort.Slice(changes, func(i, j int) bool {
		if changes[i].Path != changes[j].Path {
			return changes[i].Path < changes[j].Path
		}
		return changes[i].Method < changes[j].Method
	})

	return changes
}

func compareOperations(path, method string, base, current OperationSummary) []BreakingChange {
	var changes []BreakingChange

	// Removed parameters
	baseParams := paramSet(base.Parameters)
	for key, bp := range baseParams {
		if _, ok := paramSet(current.Parameters)[key]; !ok {
			changes = append(changes, BreakingChange{
				Kind:   BreakRemovedParameter,
				Path:   path,
				Method: method,
				Detail: fmt.Sprintf("Parameter '%s' (in %s) was removed from %s %s", bp.Name, bp.In, strings.ToUpper(method), path),
			})
		}
	}

	// New required parameters
	currentParams := paramSet(current.Parameters)
	for key, cp := range currentParams {
		if _, ok := baseParams[key]; !ok && cp.Required {
			changes = append(changes, BreakingChange{
				Kind:   BreakNewRequiredParameter,
				Path:   path,
				Method: method,
				Detail: fmt.Sprintf("New required parameter '%s' (in %s) added to %s %s", cp.Name, cp.In, strings.ToUpper(method), path),
			})
		}
	}

	// Type narrowing and enum value removal
	for key, bp := range baseParams {
		cp, ok := currentParams[key]
		if !ok {
			continue
		}
		if bp.Type != cp.Type && cp.Type != "" && bp.Type != "" {
			changes = append(changes, BreakingChange{
				Kind:   BreakTypeNarrowed,
				Path:   path,
				Method: method,
				Detail: fmt.Sprintf("Parameter '%s' type changed from '%s' to '%s' in %s %s", bp.Name, bp.Type, cp.Type, strings.ToUpper(method), path),
			})
		}

		removed := removedValues(bp.Enum, cp.Enum)
		if len(removed) > 0 {
			changes = append(changes, BreakingChange{
				Kind:   BreakRemovedEnumValue,
				Path:   path,
				Method: method,
				Detail: fmt.Sprintf("Enum values [%s] removed from parameter '%s' in %s %s", strings.Join(removed, ", "), bp.Name, strings.ToUpper(method), path),
			})
		}
	}

	// Removed response codes
	baseResponses := stringSet(base.ResponseCodes)
	for code := range baseResponses {
		if !stringSet(current.ResponseCodes)[code] {
			changes = append(changes, BreakingChange{
				Kind:   BreakRemovedResponse,
				Path:   path,
				Method: method,
				Detail: fmt.Sprintf("Response '%s' was removed from %s %s", code, strings.ToUpper(method), path),
			})
		}
	}

	// Added security to previously open operation
	if len(base.SecuritySchemes) == 0 && len(current.SecuritySchemes) > 0 {
		changes = append(changes, BreakingChange{
			Kind:   BreakAddedSecurity,
			Path:   path,
			Method: method,
			Detail: fmt.Sprintf("Authentication added to previously open %s %s", strings.ToUpper(method), path),
		})
	}

	// New required request body fields
	if base.RequestBody != nil && current.RequestBody != nil {
		baseRequired := stringSet(base.RequestBody.RequiredFields)
		for _, field := range current.RequestBody.RequiredFields {
			if !baseRequired[field] {
				changes = append(changes, BreakingChange{
					Kind:   BreakNewRequiredField,
					Path:   path,
					Method: method,
					Detail: fmt.Sprintf("New required request body field '%s' added to %s %s", field, strings.ToUpper(method), path),
				})
			}
		}
	}
	if base.RequestBody == nil && current.RequestBody != nil && current.RequestBody.Required {
		changes = append(changes, BreakingChange{
			Kind:   BreakNewRequiredField,
			Path:   path,
			Method: method,
			Detail: fmt.Sprintf("New required request body added to %s %s", strings.ToUpper(method), path),
		})
	}

	return changes
}

func paramSet(params []ParamSummary) map[string]ParamSummary {
	m := make(map[string]ParamSummary, len(params))
	for _, p := range params {
		m[p.In+":"+p.Name] = p
	}
	return m
}

func stringSet(values []string) map[string]bool {
	m := make(map[string]bool, len(values))
	for _, v := range values {
		m[v] = true
	}
	return m
}

func removedValues(base, current []string) []string {
	if len(base) == 0 {
		return nil
	}
	currentSet := stringSet(current)
	var removed []string
	for _, v := range base {
		if !currentSet[v] {
			removed = append(removed, v)
		}
	}
	return removed
}

// BreakingChangesToDiagnostics converts breaking changes to diagnostics.
func BreakingChangesToDiagnostics(changes []BreakingChange) []ctypes.Diagnostic {
	diags := make([]ctypes.Diagnostic, 0, len(changes))
	for _, c := range changes {
		diags = append(diags, ctypes.Diagnostic{
			Range:    c.Range,
			Severity: ctypes.SeverityWarning,
			Source:   "telescope",
			Code:     "breaking-change",
			Message:  c.Detail,
		})
	}
	return diags
}
