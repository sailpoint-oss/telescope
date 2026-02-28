package script_test

import (
	"strings"
	"testing"

	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/plugin/script"
)

func TestParseScriptMeta(t *testing.T) {
	tests := []struct {
		name   string
		source string
		wantOK bool
		wantID string
	}{
		{
			name: "valid meta",
			source: `exports.meta = {
				id: "test-rule",
				description: "A test rule",
				severity: "warn",
				category: "testing",
			};
			exports.check = function(ctx) {};`,
			wantOK: true,
			wantID: "test-rule",
		},
		{
			name:   "missing meta",
			source: `exports.check = function(ctx) {};`,
			wantOK: false,
		},
		{
			name: "missing id",
			source: `exports.meta = {
				description: "No ID",
			};`,
			wantOK: false,
		},
		{
			name:   "syntax error",
			source: `exports.meta = {{{`,
			wantOK: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			meta, ok := script.ParseScriptMeta(tt.source)
			if ok != tt.wantOK {
				t.Fatalf("ParseScriptMeta ok = %v, want %v", ok, tt.wantOK)
			}
			if ok && meta.ID != tt.wantID {
				t.Errorf("meta.ID = %q, want %q", meta.ID, tt.wantID)
			}
		})
	}
}

func TestScriptRuleExecute(t *testing.T) {
	source := `
exports.meta = {
    id: "require-description",
    description: "Operations must have descriptions",
    severity: "warn",
    category: "documentation",
};

exports.check = function(ctx) {
    ctx.operations(function(path, method, op) {
        if (!op.description || !op.description.text || op.description.text === "") {
            ctx.report(op.loc, method + " " + path + " is missing a description");
        }
    });
};`

	meta, ok := script.ParseScriptMeta(source)
	if !ok {
		t.Fatal("failed to parse meta")
	}

	rule := &script.ScriptRule{
		Path:   "test.js",
		Meta:   meta,
		Source: source,
	}

	spec := []byte(`openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /users:
    get:
      operationId: getUsers
      responses:
        "200":
          description: OK
    post:
      operationId: createUser
      description: Create a user
      responses:
        "201":
          description: Created`)

	idx := openapi.ParseAndIndex(spec)
	if idx == nil {
		t.Fatal("failed to parse spec")
	}

	diags := rule.Execute(idx)

	// The GET operation has no description, should produce 1 diagnostic
	foundMissing := false
	for _, d := range diags {
		if d.Message == "get /users is missing a description" {
			foundMissing = true
		}
	}
	if !foundMissing {
		t.Errorf("expected diagnostic for missing description on GET /users, got %d diags", len(diags))
		for _, d := range diags {
			t.Logf("  %s", d.Message)
		}
	}
}

func TestScriptTimeout(t *testing.T) {
	source := `
exports.meta = {
    id: "infinite-loop",
    description: "This rule loops forever",
    severity: "error",
    category: "testing",
};

exports.check = function(ctx) {
    while (true) {}
};`

	meta, ok := script.ParseScriptMeta(source)
	if !ok {
		t.Fatal("failed to parse meta")
	}

	rule := &script.ScriptRule{
		Path:   "timeout.js",
		Meta:   meta,
		Source: source,
	}

	spec := []byte(`openapi: "3.1.0"
info:
  title: Test
  version: "1.0"`)

	idx := openapi.ParseAndIndex(spec)

	// Should not hang - timeout will interrupt the VM
	diags := rule.Execute(idx)
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics from timed-out rule, got %d", len(diags))
	}
}

func TestTranspileTS(t *testing.T) {
	tests := []struct {
		name    string
		source  string
		wantErr bool
		check   func(t *testing.T, js string)
	}{
		{
			name:   "strips type annotations",
			source: `const x: number = 42; exports.default = x;`,
			check: func(t *testing.T, js string) {
				if strings.Contains(js, ": number") {
					t.Error("type annotation was not stripped")
				}
				if !strings.Contains(js, "42") {
					t.Error("value 42 missing from output")
				}
			},
		},
		{
			name: "transpiles interfaces and arrow functions",
			source: `
interface Foo { bar: string; }
const greet = (name: string): string => "hello " + name;
exports.default = greet("world");`,
			check: func(t *testing.T, js string) {
				if strings.Contains(js, "interface") {
					t.Error("interface was not stripped")
				}
				if !strings.Contains(js, "hello") {
					t.Error("runtime code missing")
				}
			},
		},
		{
			name: "handles template literals",
			source: "const msg: string = `count: ${1 + 2}`; exports.default = msg;",
			check: func(t *testing.T, js string) {
				if strings.Contains(js, ": string") {
					t.Error("type annotation was not stripped")
				}
			},
		},
		{
			name:    "reports syntax errors",
			source:  `const x: number = ;`,
			wantErr: true,
		},
		{
			name: "produces CommonJS format",
			source: `
exports.meta = { id: "test" };
exports.check = (ctx: any) => {};`,
			check: func(t *testing.T, js string) {
				if !strings.Contains(js, "exports") {
					t.Error("CommonJS exports missing from output")
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			js, err := script.TranspileTS(tt.source)
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tt.check != nil {
				tt.check(t, js)
			}
		})
	}
}

func TestTypeScriptRuleExecute(t *testing.T) {
	tsSource := `
interface Loc {
    startLine: number;
    startChar: number;
    endLine: number;
    endChar: number;
}

interface Operation {
    operationId: string;
    summary: string;
    tags: string[];
    loc: Loc;
}

interface RuleContext {
    operations(fn: (path: string, method: string, op: Operation) => void): void;
    report(loc: Loc, message: string): void;
}

exports.meta = {
    id: "require-tags-ts",
    description: "Every operation must have at least one tag (TS)",
    severity: "warn",
    category: "documentation",
};

exports.check = (ctx: RuleContext) => {
    ctx.operations((path: string, method: string, op: Operation) => {
        if (!op.tags || op.tags.length === 0) {
            ctx.report(op.loc, method.toUpperCase() + " " + path + " is missing tags");
        }
    });
};`

	js, err := script.TranspileTS(tsSource)
	if err != nil {
		t.Fatalf("transpile failed: %v", err)
	}

	meta, ok := script.ParseScriptMeta(js)
	if !ok {
		t.Fatal("failed to parse meta from transpiled JS")
	}
	if meta.ID != "require-tags-ts" {
		t.Errorf("meta.ID = %q, want %q", meta.ID, "require-tags-ts")
	}

	rule := &script.ScriptRule{
		Path:   "test.ts",
		Meta:   meta,
		Source: js,
	}

	spec := []byte(`openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /users:
    get:
      operationId: getUsers
      responses:
        "200":
          description: OK
    post:
      operationId: createUser
      tags:
        - users
      responses:
        "201":
          description: Created`)

	idx := openapi.ParseAndIndex(spec)
	if idx == nil {
		t.Fatal("failed to parse spec")
	}

	diags := rule.Execute(idx)

	foundMissing := false
	for _, d := range diags {
		if strings.Contains(d.Message, "/users") && strings.Contains(d.Message, "missing tags") {
			foundMissing = true
		}
	}
	if !foundMissing {
		t.Errorf("expected diagnostic for missing tags on GET /users, got %d diags", len(diags))
		for _, d := range diags {
			t.Logf("  %s", d.Message)
		}
	}
}

func TestTypeScriptTranspileError(t *testing.T) {
	badTS := `
exports.meta = {
    id: "bad-rule",
    severity: "error",
};

// Intentional syntax error
const x: number = ;`

	_, err := script.TranspileTS(badTS)
	if err == nil {
		t.Fatal("expected transpile error for bad TypeScript, got nil")
	}
	if !strings.Contains(err.Error(), "esbuild") {
		t.Errorf("error should mention esbuild, got: %v", err)
	}
}
