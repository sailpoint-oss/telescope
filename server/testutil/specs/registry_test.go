package specs_test

import (
	"testing"

	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/testutil/specs"
)

func TestAll(t *testing.T) {
	all := specs.All()
	if len(all) == 0 {
		t.Fatal("no specs loaded")
	}
	for _, s := range all {
		if s.Name == "" {
			t.Error("spec with empty name")
		}
		if len(s.Content) == 0 {
			t.Errorf("spec %q has no content", s.Name)
		}
		if s.Lines == 0 {
			t.Errorf("spec %q has 0 lines", s.Name)
		}
	}
	t.Logf("loaded %d specs", len(all))
}

func TestByName(t *testing.T) {
	s := specs.ByName("api-standalone")
	if len(s.Content) == 0 {
		t.Fatal("ByName(api-standalone) returned empty spec")
	}
	if s.Format != openapi.FormatYAML {
		t.Errorf("format = %v, want YAML", s.Format)
	}
	if s.Version != openapi.Version31 {
		t.Errorf("version = %v, want 3.1", s.Version)
	}
}

func TestByNameJSON(t *testing.T) {
	s := specs.ByName("api-v3")
	if len(s.Content) == 0 {
		t.Fatal("ByName(api-v3) returned empty spec")
	}
	if s.Format != openapi.FormatJSON {
		t.Errorf("format = %v, want JSON", s.Format)
	}
}

func TestBenchmarkSpecs(t *testing.T) {
	bs := specs.BenchmarkSpecs()
	if len(bs) != 4 {
		t.Fatalf("BenchmarkSpecs() returned %d specs, want 4", len(bs))
	}
	expected := []specs.SpecSize{specs.Small, specs.Medium, specs.Large, specs.XLarge}
	for i, s := range bs {
		if s.Size != expected[i] {
			t.Errorf("BenchmarkSpecs()[%d].Size = %v, want %v", i, s.Size, expected[i])
		}
		t.Logf("  %s: %s (%d lines, %d bytes)", s.Size, s.Name, s.Lines, len(s.Content))
	}
}

func TestBySize(t *testing.T) {
	for _, size := range []specs.SpecSize{specs.Small, specs.Medium, specs.Large, specs.XLarge} {
		got := specs.BySize(size)
		if len(got) == 0 {
			t.Errorf("BySize(%v) returned no specs", size)
		}
	}
}

func TestByTag(t *testing.T) {
	invalid := specs.ByTag("invalid")
	if len(invalid) == 0 {
		t.Error("ByTag(invalid) returned no specs")
	}
	valid := specs.ByTag("valid")
	if len(valid) == 0 {
		t.Error("ByTag(valid) returned no specs")
	}
}

func TestYAMLAndJSON(t *testing.T) {
	yamlSpecs := specs.YAML()
	jsonSpecs := specs.JSON()
	if len(yamlSpecs) == 0 {
		t.Error("YAML() returned no specs")
	}
	if len(jsonSpecs) == 0 {
		t.Error("JSON() returned no specs")
	}
	total := len(yamlSpecs) + len(jsonSpecs)
	all := len(specs.All())
	if total != all {
		t.Errorf("YAML(%d) + JSON(%d) = %d, want %d (All)", len(yamlSpecs), len(jsonSpecs), total, all)
	}
}

func TestSpecURI(t *testing.T) {
	s := specs.ByName("api-standalone")
	uri := s.URI()
	if uri != "file:///testutil/specs/api-standalone.yaml" {
		t.Errorf("URI = %q", uri)
	}

	j := specs.ByName("api-v3")
	if j.URI() != "file:///testutil/specs/api-v3.json" {
		t.Errorf("JSON URI = %q", j.URI())
	}
}
