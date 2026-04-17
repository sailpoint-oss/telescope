package analyzers

import (
	"testing"

	"github.com/sailpoint-oss/barrelman"
	navigator "github.com/sailpoint-oss/navigator"
)

func TestFilterParameters_FlagsEmptyDescription(t *testing.T) {
	ctx := &barrelman.AnalysisContext{
		URI: "file:///t.yaml",
		Index: &navigator.Index{
			Document: &navigator.Document{
				Paths: map[string]*navigator.PathItem{
					"/users": {
						Parameters: []*navigator.Parameter{
							{Name: "filters", In: "query"},
						},
					},
				},
			},
		},
	}
	diags := runFilterParametersMatchDescription(ctx)
	if len(diags) != 1 {
		t.Fatalf("expected 1 diagnostic for empty description, got %+v", diags)
	}
}

func TestFilterParameters_FlagsDescriptionWithoutOperators(t *testing.T) {
	ctx := &barrelman.AnalysisContext{
		URI: "file:///t.yaml",
		Index: &navigator.Index{
			Document: &navigator.Document{
				Paths: map[string]*navigator.PathItem{
					"/users": {
						Get: &navigator.Operation{
							Parameters: []*navigator.Parameter{
								{
									Name: "filters", In: "query",
									Description: navigator.DescriptionValue{
										Text: "You can filter the results somehow",
									},
								},
							},
						},
					},
				},
			},
		},
	}
	diags := runFilterParametersMatchDescription(ctx)
	if len(diags) != 1 {
		t.Fatalf("expected 1 diagnostic for description without operators, got %d", len(diags))
	}
}

func TestFilterParameters_AcceptsOperatorEnumeration(t *testing.T) {
	ctx := &barrelman.AnalysisContext{
		URI: "file:///t.yaml",
		Index: &navigator.Index{
			Document: &navigator.Document{
				Paths: map[string]*navigator.PathItem{
					"/users": {
						Post: &navigator.Operation{
							Parameters: []*navigator.Parameter{
								{
									Name: "filters", In: "query",
									Description: navigator.DescriptionValue{
										Text: "name: eq, ne. created: ge, gt, le, lt.",
									},
								},
							},
						},
					},
				},
			},
		},
	}
	if d := runFilterParametersMatchDescription(ctx); len(d) != 0 {
		t.Fatalf("proper enumeration should produce no diagnostic, got %+v", d)
	}
}

func TestFilterParameters_IgnoresNonFilterParameters(t *testing.T) {
	ctx := &barrelman.AnalysisContext{
		URI: "file:///t.yaml",
		Index: &navigator.Index{
			Document: &navigator.Document{
				Paths: map[string]*navigator.PathItem{
					"/users": {
						Parameters: []*navigator.Parameter{
							{Name: "limit", In: "query"},
							{Name: "id", In: "path", Required: true},
						},
					},
				},
			},
		},
	}
	if d := runFilterParametersMatchDescription(ctx); len(d) != 0 {
		t.Fatalf("non-filter parameters should not be flagged, got %+v", d)
	}
}

func TestFilterParameters_IgnoresHeaderFiltersName(t *testing.T) {
	// A header named "filters" is NOT the filter-parameter we care about.
	ctx := &barrelman.AnalysisContext{
		URI: "file:///t.yaml",
		Index: &navigator.Index{
			Document: &navigator.Document{
				Paths: map[string]*navigator.PathItem{
					"/users": {
						Parameters: []*navigator.Parameter{
							{Name: "filters", In: "header"},
						},
					},
				},
			},
		},
	}
	if d := runFilterParametersMatchDescription(ctx); len(d) != 0 {
		t.Fatalf("header-named filters should not be flagged, got %+v", d)
	}
}

func TestVersionSegment(t *testing.T) {
	cases := map[string]struct {
		want string
		ok   bool
	}{
		"../v2024/paths/accounts.yaml":   {"v2024", true},
		"v2026/paths/x.yaml":             {"v2026", true},
		"../v3/schemas/Pet.yaml":         {"v3", true},
		"../v2/foo.yaml":                 {"v2", true},
		"../beta/x.yaml":                 {"", false},
		"../shared/errors.yaml":          {"", false},
		"v2024beta/paths/something.yaml": {"v2024beta", true},
	}
	for ref, want := range cases {
		got, ok := versionSegment(ref)
		if ok != want.ok {
			t.Errorf("versionSegment(%q) ok = %v, want %v", ref, ok, want.ok)
			continue
		}
		if got != want.want {
			t.Errorf("versionSegment(%q) = %q, want %q", ref, got, want.want)
		}
	}
}

func TestNewPathsInNewestVersion_NoopWithoutConfig(t *testing.T) {
	// Without TELESCOPE_NEWEST_VERSION_SEGMENT the rule is a strict no-op.
	t.Setenv("TELESCOPE_NEWEST_VERSION_SEGMENT", "")
	ctx := &barrelman.AnalysisContext{
		URI: "file:///t.yaml",
		Index: &navigator.Index{
			Document: &navigator.Document{
				Paths: map[string]*navigator.PathItem{
					"/a": {Ref: "../v2024/paths/a.yaml"},
				},
			},
		},
	}
	if d := runNewPathsInNewestVersion(ctx); len(d) != 0 {
		t.Fatalf("unconfigured rule must be a no-op, got %+v", d)
	}
}

func TestNewPathsInNewestVersion_FlagsOlderVersion(t *testing.T) {
	t.Setenv("TELESCOPE_NEWEST_VERSION_SEGMENT", "v2026")
	ctx := &barrelman.AnalysisContext{
		URI: "file:///t.yaml",
		Index: &navigator.Index{
			Document: &navigator.Document{
				Paths: map[string]*navigator.PathItem{
					"/a": {Ref: "../v2024/paths/a.yaml"},
					"/b": {Ref: "../v2026/paths/b.yaml"},
				},
			},
		},
	}
	diags := runNewPathsInNewestVersion(ctx)
	if len(diags) != 1 {
		t.Fatalf("expected 1 diagnostic for the older-version path, got %+v", diags)
	}
	if !contains(diags[0].Message, "v2026") {
		t.Errorf("message should mention the newest version: %q", diags[0].Message)
	}
}

func contains(s, substr string) bool {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
