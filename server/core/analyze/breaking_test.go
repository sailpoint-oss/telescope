package analyze

import (
	"testing"
)

func TestDetectBreakingChanges_RemovedPath(t *testing.T) {
	base := &SpecSummary{
		Paths: map[string]PathSummary{
			"/pets":  {Operations: map[string]OperationSummary{"get": {}}},
			"/users": {Operations: map[string]OperationSummary{"get": {}}},
		},
	}
	current := &SpecSummary{
		Paths: map[string]PathSummary{
			"/pets": {Operations: map[string]OperationSummary{"get": {}}},
		},
	}

	changes := DetectBreakingChanges(base, current)
	found := false
	for _, c := range changes {
		if c.Kind == BreakRemovedPath && c.Path == "/users" {
			found = true
		}
	}
	if !found {
		t.Error("expected removed-path for /users")
	}
}

func TestDetectBreakingChanges_RemovedOperation(t *testing.T) {
	base := &SpecSummary{
		Paths: map[string]PathSummary{
			"/pets": {Operations: map[string]OperationSummary{"get": {}, "post": {}}},
		},
	}
	current := &SpecSummary{
		Paths: map[string]PathSummary{
			"/pets": {Operations: map[string]OperationSummary{"get": {}}},
		},
	}

	changes := DetectBreakingChanges(base, current)
	found := false
	for _, c := range changes {
		if c.Kind == BreakRemovedOperation && c.Method == "post" {
			found = true
		}
	}
	if !found {
		t.Error("expected removed-operation for POST /pets")
	}
}

func TestDetectBreakingChanges_NewRequiredParam(t *testing.T) {
	base := &SpecSummary{
		Paths: map[string]PathSummary{
			"/pets": {Operations: map[string]OperationSummary{
				"get": {Parameters: []ParamSummary{{Name: "limit", In: "query", Required: false}}},
			}},
		},
	}
	current := &SpecSummary{
		Paths: map[string]PathSummary{
			"/pets": {Operations: map[string]OperationSummary{
				"get": {
					Parameters: []ParamSummary{
						{Name: "limit", In: "query", Required: false},
						{Name: "apiKey", In: "header", Required: true},
					},
				},
			}},
		},
	}

	changes := DetectBreakingChanges(base, current)
	found := false
	for _, c := range changes {
		if c.Kind == BreakNewRequiredParameter {
			found = true
		}
	}
	if !found {
		t.Error("expected new-required-parameter")
	}
}

func TestDetectBreakingChanges_RemovedEnum(t *testing.T) {
	base := &SpecSummary{
		Paths: map[string]PathSummary{
			"/pets": {Operations: map[string]OperationSummary{
				"get": {Parameters: []ParamSummary{{Name: "status", In: "query", Enum: []string{"active", "inactive", "pending"}}}},
			}},
		},
	}
	current := &SpecSummary{
		Paths: map[string]PathSummary{
			"/pets": {Operations: map[string]OperationSummary{
				"get": {Parameters: []ParamSummary{{Name: "status", In: "query", Enum: []string{"active", "inactive"}}}},
			}},
		},
	}

	changes := DetectBreakingChanges(base, current)
	found := false
	for _, c := range changes {
		if c.Kind == BreakRemovedEnumValue {
			found = true
		}
	}
	if !found {
		t.Error("expected removed-enum-value")
	}
}

func TestDetectBreakingChanges_AddedSecurity(t *testing.T) {
	base := &SpecSummary{
		Paths: map[string]PathSummary{
			"/pets": {Operations: map[string]OperationSummary{
				"get": {SecuritySchemes: nil},
			}},
		},
	}
	current := &SpecSummary{
		Paths: map[string]PathSummary{
			"/pets": {Operations: map[string]OperationSummary{
				"get": {SecuritySchemes: []string{"bearerAuth"}},
			}},
		},
	}

	changes := DetectBreakingChanges(base, current)
	found := false
	for _, c := range changes {
		if c.Kind == BreakAddedSecurity {
			found = true
		}
	}
	if !found {
		t.Error("expected added-security")
	}
}

func TestDetectBreakingChanges_NoBreaks(t *testing.T) {
	base := &SpecSummary{
		Paths: map[string]PathSummary{
			"/pets": {Operations: map[string]OperationSummary{"get": {}}},
		},
	}
	current := &SpecSummary{
		Paths: map[string]PathSummary{
			"/pets":  {Operations: map[string]OperationSummary{"get": {}}},
			"/users": {Operations: map[string]OperationSummary{"get": {}}},
		},
	}

	changes := DetectBreakingChanges(base, current)
	if len(changes) != 0 {
		t.Errorf("expected 0 breaking changes for additive change, got %d", len(changes))
	}
}

func TestDetectBreakingChanges_NilInputs(t *testing.T) {
	changes := DetectBreakingChanges(nil, nil)
	if changes != nil {
		t.Error("expected nil for nil inputs")
	}
}

func TestBreakingChangesToDiagnostics(t *testing.T) {
	changes := []BreakingChange{
		{Kind: BreakRemovedPath, Path: "/pets", Detail: "Path removed"},
	}
	diags := BreakingChangesToDiagnostics(changes)
	if len(diags) != 1 {
		t.Fatalf("expected 1 diagnostic, got %d", len(diags))
	}
	if diags[0].Code != "breaking-change" {
		t.Errorf("expected code 'breaking-change', got %s", diags[0].Code)
	}
}
