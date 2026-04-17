package projection

import (
	"testing"

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
