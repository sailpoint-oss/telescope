package project

import (
	"log/slog"
	"runtime"
	"strings"
	"testing"

	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

func TestPathToURI(t *testing.T) {
	tests := []struct {
		name string
		path string
		want string // substring to check
	}{
		{
			name: "absolute unix path",
			path: "/home/user/api.yaml",
			want: "file:///home/user/api.yaml",
		},
		{
			name: "path with spaces",
			path: "/home/user/my docs/api.yaml",
			want: "file:///home/user/my%20docs/api.yaml",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := PathToURI(tt.path)
			if !strings.HasPrefix(got, "file://") {
				t.Errorf("PathToURI(%q) = %q, expected file:// prefix", tt.path, got)
			}
			if !strings.Contains(got, "api.yaml") {
				t.Errorf("PathToURI(%q) = %q, expected to contain 'api.yaml'", tt.path, got)
			}
		})
	}
}

func TestURIToPath(t *testing.T) {
	tests := []struct {
		name string
		uri  string
		want string // substring that must appear
	}{
		{
			name: "file URI to path",
			uri:  "file:///home/user/api.yaml",
			want: "api.yaml",
		},
		{
			name: "non-file URI returns as-is",
			uri:  "https://example.com/spec.yaml",
			want: "https://example.com/spec.yaml",
		},
		{
			name: "plain path returns as-is",
			uri:  "/home/user/api.yaml",
			want: "/home/user/api.yaml",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := URIToPath(tt.uri)
			if !strings.Contains(got, tt.want) {
				t.Errorf("URIToPath(%q) = %q, expected to contain %q", tt.uri, got, tt.want)
			}
		})
	}
}

func TestPathToURIRoundTrip(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("round-trip test uses unix paths")
	}

	original := "/tmp/test/openapi.yaml"
	uri := PathToURI(original)
	back := URIToPath(uri)

	if back != original {
		t.Errorf("round-trip failed: %q -> %q -> %q", original, uri, back)
	}
}

func TestHasWindowsDrivePrefix(t *testing.T) {
	tests := []struct {
		name string
		path string
		want bool
	}{
		{"uppercase drive", "/C:/Users/test", true},
		{"lowercase drive", "/c:/Users/test", true},
		{"unix path", "/home/user", false},
		{"no leading slash", "C:/Users/test", false},
		{"too short", "/C", false},
		{"no colon", "/Cx/Users", false},
		{"number not letter", "/1:/Users", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := hasWindowsDrivePrefix(tt.path)
			if got != tt.want {
				t.Errorf("hasWindowsDrivePrefix(%q) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}

func TestDiscoveryFileByURI(t *testing.T) {
	d := NewDiscovery(nil)
	d.mu.Lock()
	d.files["/tmp/test.yaml"] = &DiscoveredFile{
		Path: "/tmp/test.yaml",
		URI:  PathToURI("/tmp/test.yaml"),
		Role: RoleRoot,
	}
	d.mu.Unlock()

	t.Run("found by URI", func(t *testing.T) {
		uri := PathToURI("/tmp/test.yaml")
		got := d.FileByURI(uri)
		if got == nil {
			t.Fatal("expected file, got nil")
		}
		if got.Role != RoleRoot {
			t.Errorf("Role = %d, want %d", got.Role, RoleRoot)
		}
	})

	t.Run("not found returns nil", func(t *testing.T) {
		got := d.FileByURI("file:///nonexistent.yaml")
		if got != nil {
			t.Errorf("expected nil for missing URI, got %v", got)
		}
	})
}

func TestDiscoveryIsRoot(t *testing.T) {
	d := NewDiscovery(nil)
	rootURI := "file:///tmp/api.yaml"
	fragURI := "file:///tmp/components.yaml"

	d.mu.Lock()
	d.roots = []string{rootURI}
	d.files["/tmp/api.yaml"] = &DiscoveredFile{
		Path: "/tmp/api.yaml",
		URI:  rootURI,
		Role: RoleRoot,
	}
	d.files["/tmp/components.yaml"] = &DiscoveredFile{
		Path: "/tmp/components.yaml",
		URI:  fragURI,
		Role: RoleFragment,
	}
	d.mu.Unlock()

	if !d.IsRoot(rootURI) {
		t.Error("expected root URI to be a root")
	}
	if d.IsRoot(fragURI) {
		t.Error("expected fragment URI to not be a root")
	}
	if d.IsRoot("file:///unknown.yaml") {
		t.Error("expected unknown URI to not be a root")
	}
}

func TestShouldExclude(t *testing.T) {
	tests := []struct {
		name     string
		patterns []string
		relPath  string
		want     bool
	}{
		{
			name:     "exact match",
			patterns: []string{"vendor"},
			relPath:  "vendor",
			want:     true,
		},
		{
			name:     "no match",
			patterns: []string{"vendor"},
			relPath:  "src/api.yaml",
			want:     false,
		},
		{
			name:     "glob match",
			patterns: []string{"*.bak"},
			relPath:  "openapi.bak",
			want:     true,
		},
		{
			name:     "double star pattern",
			patterns: []string{"**/node_modules/**"},
			relPath:  "sub/node_modules/foo/bar.yaml",
			want:     true,
		},
		{
			name:     "empty patterns match nothing",
			patterns: nil,
			relPath:  "anything.yaml",
			want:     false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			d := NewDiscovery(tt.patterns)
			got := d.shouldExclude(tt.relPath)
			if got != tt.want {
				t.Errorf("shouldExclude(%q) = %v, want %v", tt.relPath, got, tt.want)
			}
		})
	}
}

func TestInferComponentType(t *testing.T) {
	tests := []struct {
		name string
		ref  string
		want string
	}{
		{"schema", "#/components/schemas/Pet", "Schema Object"},
		{"response", "#/components/responses/NotFound", "Response Object"},
		{"parameter", "#/components/parameters/Limit", "Parameter Object"},
		{"requestBody", "#/components/requestBodies/CreatePet", "Request Body"},
		{"header", "#/components/headers/X-Rate-Limit", "Header Object"},
		{"securityScheme", "#/components/securitySchemes/BearerAuth", "Security Scheme"},
		{"link", "#/components/links/GetUser", "Link Object"},
		{"callback", "#/components/callbacks/onEvent", "Callback Object"},
		{"example", "#/components/examples/ExampleFoo", "Example Object"},
		{"swagger definitions", "#/definitions/Pet", "Schema Object"},
		{"unknown component", "#/components/unknown/Foo", "component"},
		{"no fragment", "external.yaml", "component"},
		{"external with fragment", "other.yaml#/components/schemas/Bar", "Schema Object"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := inferComponentType(tt.ref)
			if got != tt.want {
				t.Errorf("inferComponentType(%q) = %q, want %q", tt.ref, got, tt.want)
			}
		})
	}
}

func TestManagerSetAnalyzers(t *testing.T) {
	cache := openapi.NewIndexCache()
	m := NewManager(cache, slog.Default())

	if m.analyzers != nil {
		t.Fatal("expected nil analyzers initially")
	}

	analyzers := []rules.NamedAnalyzer{
		{ID: "test-rule"},
	}
	m.SetAnalyzers(analyzers)

	m.mu.RLock()
	got := m.analyzers
	m.mu.RUnlock()

	if len(got) != 1 || got[0].ID != "test-rule" {
		t.Errorf("SetAnalyzers: got %v, want [{ID: test-rule}]", got)
	}
}

func TestManagerSetResolver(t *testing.T) {
	cache := openapi.NewIndexCache()
	m := NewManager(cache, slog.Default())

	m.mu.RLock()
	initial := m.resolver
	m.mu.RUnlock()
	if initial != nil {
		t.Fatal("expected nil resolver initially")
	}

	m.SetResolver(nil)

	m.mu.RLock()
	afterNil := m.resolver
	m.mu.RUnlock()
	if afterNil != nil {
		t.Error("expected resolver to still be nil after SetResolver(nil)")
	}
}

func TestManagerProjectForFile(t *testing.T) {
	cache := openapi.NewIndexCache()
	m := NewManager(cache, slog.Default())

	got := m.ProjectForFile("file:///unknown.yaml")
	if got != nil {
		t.Error("expected nil for unknown file")
	}
}

func TestManagerResolverForFile(t *testing.T) {
	cache := openapi.NewIndexCache()
	m := NewManager(cache, slog.Default())

	got := m.ResolverForFile("file:///unknown.yaml")
	if got != nil {
		t.Error("expected nil resolver for unknown file")
	}
}
