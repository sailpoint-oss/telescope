package analyzers

import (
	"strings"
	"testing"

	"github.com/sailpoint-oss/barrelman"
	navigator "github.com/sailpoint-oss/navigator"
)

func TestContactProperties_MissingFields(t *testing.T) {
	doc := &navigator.Document{
		Info: &navigator.Info{
			Contact: &navigator.Contact{Name: "Support"}, // url/email missing
		},
	}
	ctx := &barrelman.AnalysisContext{URI: "file:///t.yaml", Index: &navigator.Index{Document: doc}}
	diags := runContactProperties(ctx)
	if len(diags) != 1 {
		t.Fatalf("expected 1 diagnostic, got %d: %+v", len(diags), diags)
	}
	if !strings.Contains(diags[0].Message, "url") || !strings.Contains(diags[0].Message, "email") {
		t.Fatalf("expected message to call out url and email: %q", diags[0].Message)
	}
}

func TestContactProperties_Complete(t *testing.T) {
	doc := &navigator.Document{
		Info: &navigator.Info{
			Contact: &navigator.Contact{
				Name:  "Support",
				URL:   "https://example.com/support",
				Email: "support@example.com",
			},
		},
	}
	ctx := &barrelman.AnalysisContext{URI: "file:///t.yaml", Index: &navigator.Index{Document: doc}}
	if d := runContactProperties(ctx); len(d) != 0 {
		t.Fatalf("complete contact should produce no diagnostics, got %+v", d)
	}
}

func TestContactProperties_NoContact(t *testing.T) {
	doc := &navigator.Document{Info: &navigator.Info{}}
	ctx := &barrelman.AnalysisContext{URI: "file:///t.yaml", Index: &navigator.Index{Document: doc}}
	if d := runContactProperties(ctx); len(d) != 0 {
		t.Fatalf("missing contact is a separate rule (info-contact); we should not double-fire")
	}
}

func TestLicenseURL_MissingAndNoIdentifier(t *testing.T) {
	doc := &navigator.Document{
		Info: &navigator.Info{
			License: &navigator.License{Name: "Apache 2.0"}, // url + identifier missing
		},
	}
	ctx := &barrelman.AnalysisContext{URI: "file:///t.yaml", Index: &navigator.Index{Document: doc}}
	diags := runLicenseURL(ctx)
	if len(diags) != 1 {
		t.Fatalf("expected 1 diagnostic, got %d", len(diags))
	}
	if !strings.Contains(diags[0].Message, "url") {
		t.Fatalf("expected message to mention url: %q", diags[0].Message)
	}
}

func TestLicenseURL_IdentifierSatisfies(t *testing.T) {
	// OpenAPI 3.1 lets identifier stand in for url.
	doc := &navigator.Document{
		Info: &navigator.Info{
			License: &navigator.License{Name: "Apache 2.0", Identifier: "Apache-2.0"},
		},
	}
	ctx := &barrelman.AnalysisContext{URI: "file:///t.yaml", Index: &navigator.Index{Document: doc}}
	if d := runLicenseURL(ctx); len(d) != 0 {
		t.Fatalf("identifier should satisfy license-url, got %+v", d)
	}
}

func TestLicenseURL_HappyPath(t *testing.T) {
	doc := &navigator.Document{
		Info: &navigator.Info{
			License: &navigator.License{Name: "MIT", URL: "https://opensource.org/licenses/MIT"},
		},
	}
	ctx := &barrelman.AnalysisContext{URI: "file:///t.yaml", Index: &navigator.Index{Document: doc}}
	if d := runLicenseURL(ctx); len(d) != 0 {
		t.Fatalf("valid url should produce no diagnostic, got %+v", d)
	}
}

func TestLicenseURL_NilSafe(t *testing.T) {
	if runLicenseURL(nil) != nil {
		t.Fatal("nil ctx should return nil")
	}
	if runLicenseURL(&barrelman.AnalysisContext{}) != nil {
		t.Fatal("empty ctx should return nil")
	}
}

func TestNativeSpectralRegistry(t *testing.T) {
	rules := telescopeNativeRules()
	ids := make(map[string]bool, len(rules))
	for _, r := range rules {
		ids[r.ID] = true
	}
	for _, wanted := range []string{"example-matches-format", "contact-properties", "license-url"} {
		if !ids[wanted] {
			t.Errorf("native rule %q not registered", wanted)
		}
	}
}
