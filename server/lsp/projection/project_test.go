package projection

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/barrelman"
	"github.com/sailpoint-oss/cartographer/sourceloc"
	"github.com/sailpoint-oss/cartographer/sourcemap"
)

func TestOperationFromPointer(t *testing.T) {
	cases := []struct {
		pointer   string
		wantM, wP string
		ok        bool
	}{
		{"/paths/~1foo/get", "GET", "/foo", true},
		{"/paths/~1foo/post/responses/200", "POST", "/foo", true},
		{"/components/schemas/Foo", "", "", false},
		{"", "", "", false},
		{"/paths", "", "", false},
	}
	for _, c := range cases {
		m, p, ok := OperationFromPointer(c.pointer)
		if ok != c.ok || m != c.wantM || p != c.wP {
			t.Errorf("OperationFromPointer(%q)=(%q,%q,%v), want (%q,%q,%v)",
				c.pointer, m, p, ok, c.wantM, c.wP, c.ok)
		}
	}
}

func TestSchemaAndFieldFromPointer(t *testing.T) {
	if s, ok := SchemaFromPointer("/components/schemas/User"); !ok || s != "User" {
		t.Errorf("SchemaFromPointer: got (%q,%v)", s, ok)
	}
	if s, f, ok := FieldFromPointer("/components/schemas/User/properties/age"); !ok || s != "User" || f != "age" {
		t.Errorf("FieldFromPointer: got (%q,%q,%v)", s, f, ok)
	}
	if _, _, ok := FieldFromPointer("/components/schemas/User"); ok {
		t.Errorf("FieldFromPointer should not match schema-only pointer")
	}
}

func TestResolverProject(t *testing.T) {
	sm := sourcemap.New()
	sm.PutOperation("GET", "/foo", sourceloc.Location{File: "a.go", Line: 10, Column: 1})
	r := NewResolver(sm)
	loc, ok := r.Project("/paths/~1foo/get/responses/200")
	if !ok || loc.File != "a.go" || loc.Line != 10 {
		t.Fatalf("expected a.go:10, got %+v ok=%v", loc, ok)
	}
	if _, ok := r.Project("/paths/~1nope/get"); ok {
		t.Errorf("expected miss on unknown operation")
	}
}

func TestContributionsForFile(t *testing.T) {
	sm := sourcemap.New()
	sm.PutOperation("GET", "/foo", sourceloc.Location{File: "handler.go", Line: 10})
	sm.PutOperation("POST", "/bar", sourceloc.Location{File: "other.go", Line: 20})

	fc := ContributionsForFile(sm, "handler.go")
	if fc == nil {
		t.Fatal("expected non-nil FileContributions")
	}
	if len(fc.Operations) != 1 || fc.Operations[0].Path != "/foo" {
		t.Errorf("expected one GET /foo operation, got %+v", fc.Operations)
	}
	if md := fc.HoverMarkdown(); md == "" || !containsAll(md, "GET /foo", "operation") {
		t.Errorf("HoverMarkdown missing content: %q", md)
	}
}

func containsAll(s string, subs ...string) bool {
	for _, sub := range subs {
		if !containsFold(s, sub) {
			return false
		}
	}
	return true
}

func containsFold(s, sub string) bool {
	return len(sub) == 0 || indexFold(s, sub) >= 0
}

func indexFold(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if equalFold(s[i:i+len(sub)], sub) {
			return i
		}
	}
	return -1
}

func equalFold(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if toLower(a[i]) != toLower(b[i]) {
			return false
		}
	}
	return true
}

func toLower(b byte) byte {
	if b >= 'A' && b <= 'Z' {
		return b + ('a' - 'A')
	}
	return b
}

func TestTrackerUpdateAndDroppedURIs(t *testing.T) {
	var nilT *Tracker
	if dropped := nilT.Update("root", nil); dropped != nil {
		t.Fatalf("nil tracker Update: got %v", dropped)
	}
	nilT.Reset("root")

	tr := NewTracker()
	u1 := protocol.DocumentURI("file:///a.yaml")
	u2 := protocol.DocumentURI("file:///b.yaml")

	if dropped := tr.Update("r1", map[protocol.DocumentURI]struct{}{u1: {}, u2: {}}); len(dropped) != 0 {
		t.Fatalf("first Update should not drop, got %v", dropped)
	}
	if dropped := tr.Update("r1", map[protocol.DocumentURI]struct{}{u2: {}}); len(dropped) != 1 || dropped[0] != u1 {
		t.Fatalf("expected u1 dropped, got %v", dropped)
	}
	if dropped := tr.Update("r1", map[protocol.DocumentURI]struct{}{u2: {}}); len(dropped) != 0 {
		t.Fatalf("no-op update should drop nothing, got %v", dropped)
	}
	tr.Reset("r1")
	if dropped := tr.Update("r1", map[protocol.DocumentURI]struct{}{u1: {}}); len(dropped) != 0 {
		t.Fatalf("after Reset prev should be empty, got %v", dropped)
	}
}

func TestPublisherProjectProjectsToSource(t *testing.T) {
	sm := sourcemap.New()
	sm.PutOperation("GET", "/foo", sourceloc.Location{File: "handler.go", Line: 2, Column: 3})

	specURI := protocol.DocumentURI("file:///workspace/spec.yaml")
	specDiags := []protocol.Diagnostic{{Message: "lint", Severity: protocol.SeverityWarning, Code: "R1"}}
	barrelDiags := []barrelman.Diagnostic{{Code: "R1"}}

	pub := &Publisher{Resolver: NewResolver(sm), WorkspaceRoot: "/workspace"}
	pointerFor := func(d barrelman.Diagnostic) string {
		_ = d
		return "/paths/~1foo/get"
	}
	out := pub.Project(specURI, specDiags, barrelDiags, pointerFor)
	if len(out) < 2 {
		t.Fatalf("expected spec + source URIs, got %d maps", len(out))
	}
	if _, ok := out[specURI]; !ok {
		t.Fatal("spec URI missing from output")
	}
	var srcKey protocol.DocumentURI
	for u := range out {
		if u != specURI {
			srcKey = u
			break
		}
	}
	if srcKey == "" {
		t.Fatal("expected a projected source URI")
	}
	proj := out[srcKey]
	if len(proj) != 1 {
		t.Fatalf("expected 1 projected diagnostic, got %d", len(proj))
	}
	if proj[0].Range.Start.Line != 1 || proj[0].Range.Start.Character != 2 {
		t.Fatalf("unexpected range %+v", proj[0].Range)
	}
}

func TestPublisherProjectGuards(t *testing.T) {
	specURI := protocol.DocumentURI("file:///spec.yaml")
	specDiags := []protocol.Diagnostic{{Message: "m"}}
	barrelDiags := []barrelman.Diagnostic{{}}

	var nilPub *Publisher
	out := nilPub.Project(specURI, specDiags, barrelDiags, func(d barrelman.Diagnostic) string { return "/p" })
	if len(out) != 1 || len(out[specURI]) != 1 {
		t.Fatalf("nil publisher: %+v", out)
	}

	pub := &Publisher{Resolver: nil}
	out = pub.Project(specURI, specDiags, barrelDiags, func(d barrelman.Diagnostic) string { return "/p" })
	if len(out) != 1 {
		t.Fatalf("nil resolver: %+v", out)
	}

	sm := sourcemap.New()
	sm.PutOperation("GET", "/x", sourceloc.Location{File: "a.go", Line: 1, Column: 1})
	pub = &Publisher{Resolver: NewResolver(sm)}
	out = pub.Project(specURI, specDiags, barrelDiags, nil)
	if len(out) != 1 {
		t.Fatalf("nil pointerFor: %+v", out)
	}
	out = pub.Project(specURI, specDiags, nil, func(d barrelman.Diagnostic) string { return "/paths/~1x/get" })
	if len(out) != 1 {
		t.Fatalf("length mismatch: %+v", out)
	}
	out = pub.Project(specURI, specDiags, barrelDiags, func(d barrelman.Diagnostic) string { return "" })
	if len(out) != 1 || len(out[specURI]) != 1 {
		t.Fatalf("empty pointer: %+v", out)
	}
	out = pub.Project(specURI, specDiags, barrelDiags, func(d barrelman.Diagnostic) string { return "/paths/~1nope/get" })
	if len(out) != 1 {
		t.Fatalf("unknown operation should only publish spec: %+v", out)
	}
}

func TestPublisherSourceURIAndAbsoluteFile(t *testing.T) {
	root := filepath.Join(t.TempDir(), "ws")
	pub := &Publisher{WorkspaceRoot: root}
	if u := pub.sourceURI(""); u != "" {
		t.Fatalf("empty file: %q", u)
	}
	absFile := filepath.Join(t.TempDir(), "abs.go")
	absFile, err := filepath.Abs(absFile)
	if err != nil {
		t.Fatal(err)
	}
	if u := pub.sourceURI(absFile); u == "" || !strings.HasPrefix(string(u), "file://") {
		t.Fatalf("absolute file URI: %q", u)
	}
	if u := pub.sourceURI("rel.go"); u == "" || !strings.HasPrefix(string(u), "file://") {
		t.Fatalf("expected joined file URI: %q", u)
	}
	loc := sourceloc.Location{Line: 1, Column: 1}
	r := sourceLocToRange(loc)
	if r.Start.Line != 0 || r.Start.Character != 0 || r.End.Character != r.Start.Character+1 {
		t.Fatalf("sourceLocToRange zero-ish: %+v", r)
	}
}

func TestResolverProjectSchemaAndFieldPaths(t *testing.T) {
	sm := sourcemap.New()
	sm.SchemaMap["Pet"] = sourceloc.Location{File: "types.go", Line: 10, Column: 1}
	sm.FieldMap["Pet.id"] = sourceloc.Location{File: "types.go", Line: 11, Column: 2}
	r := NewResolver(sm)

	loc, ok := r.Project("/components/schemas/Pet")
	if !ok || loc.Line != 10 {
		t.Fatalf("schema pointer: %+v ok=%v", loc, ok)
	}
	loc, ok = r.Project("/components/schemas/Pet/properties/id")
	if !ok || loc.Line != 11 {
		t.Fatalf("field pointer: %+v ok=%v", loc, ok)
	}
}

func TestContributionsForFileFieldsSchemasAndNil(t *testing.T) {
	if ContributionsForFile(nil, "x.go") != nil {
		t.Fatal("nil sourcemap")
	}
	sm := sourcemap.New()
	if ContributionsForFile(sm, "") != nil {
		t.Fatal("empty file")
	}
	sm.OperationMap["get:/bad"] = sourceloc.Location{File: "a.go", Line: 1}
	sm.SchemaMap["S"] = sourceloc.Location{File: "b.go", Line: 2}
	sm.FieldMap["X."] = sourceloc.Location{File: "c.go", Line: 3}
	sm.FieldMap["BadFieldKey"] = sourceloc.Location{File: "d.go", Line: 4}
	if fc := ContributionsForFile(sm, "a.go"); fc != nil {
		t.Fatalf("invalid operation key should be skipped, got %+v", fc)
	}
	if fc := ContributionsForFile(sm, "c.go"); fc != nil {
		t.Fatalf("invalid field key should be skipped, got %+v", fc)
	}
	if fc := ContributionsForFile(sm, "d.go"); fc != nil {
		t.Fatalf("field key without dot should be skipped, got %+v", fc)
	}

	sm2 := sourcemap.New()
	sm2.PutOperation("GET", "/p", sourceloc.Location{File: "/repo/pkg/handler.go", Line: 5})
	fc := ContributionsForFile(sm2, "pkg/handler.go")
	if fc == nil || len(fc.Operations) != 1 {
		t.Fatalf("sameFile suffix match: %+v", fc)
	}

	sm3 := sourcemap.New()
	sm3.SchemaMap["A"] = sourceloc.Location{File: "s.go", Line: 1}
	sm3.SchemaMap["B"] = sourceloc.Location{File: "s.go", Line: 2}
	sm3.FieldMap["Pet.name"] = sourceloc.Location{File: "s.go", Line: 3}
	fc = ContributionsForFile(sm3, "s.go")
	if fc == nil {
		t.Fatal("expected contributions")
	}
	md := fc.HoverMarkdown()
	if !containsAll(md, "schema", "A", "B", "field") {
		t.Fatalf("HoverMarkdown: %q", md)
	}
	if (*FileContributions)(nil).HoverMarkdown() != "" {
		t.Fatal("nil receiver HoverMarkdown")
	}
}
