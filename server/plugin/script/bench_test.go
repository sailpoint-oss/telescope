package script_test

import (
	"fmt"
	"testing"

	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/plugin/script"
	"github.com/sailpoint-oss/telescope/server/testutil/specs"
)

// --- JS rule sources used across benchmarks ---

const jsOperationsRule = `
exports.meta = {
    id: "bench-operations",
    description: "Benchmark operations visitor",
    severity: "warn",
    category: "documentation",
};
exports.check = function(ctx) {
    ctx.operations(function(path, method, op) {
        if (!op.summary || op.summary === "") {
            ctx.report(op.loc, method + " " + path + " is missing a summary");
        }
    });
};`

const jsSchemasRule = `
exports.meta = {
    id: "bench-schemas",
    description: "Benchmark schemas visitor",
    severity: "warn",
    category: "naming",
};
exports.check = function(ctx) {
    ctx.schemas(function(name, schema) {
        if (name.length > 0 && name[0] === name[0].toLowerCase()) {
            ctx.report(schema.loc, "Schema '" + name + "' should start with uppercase");
        }
    });
};`

const jsParametersRule = `
exports.meta = {
    id: "bench-parameters",
    description: "Benchmark parameters visitor",
    severity: "warn",
    category: "documentation",
};
exports.check = function(ctx) {
    ctx.parameters(function(param) {
        if (!param.description || !param.description.text || param.description.text === "") {
            ctx.report(param.loc, "Parameter '" + param.name + "' is missing a description");
        }
    });
};`

// --- TS rule source ---

const tsOperationsRule = `
interface Loc { startLine: number; startChar: number; endLine: number; endChar: number; }
interface Operation { operationId: string; summary: string; tags: string[]; loc: Loc; }
interface RuleContext {
    operations(fn: (path: string, method: string, op: Operation) => void): void;
    report(loc: Loc, message: string): void;
}
exports.meta = {
    id: "bench-ts-operations",
    description: "Benchmark TS operations visitor",
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

func mustParseRule(b *testing.B, source, path string) *script.ScriptRule {
	b.Helper()
	meta, ok := script.ParseScriptMeta(source)
	if !ok {
		b.Fatalf("failed to parse meta from %s", path)
	}
	return &script.ScriptRule{Path: path, Meta: meta, Source: source}
}

func benchSpecIndex(b *testing.B, spec specs.Spec) *openapi.Index {
	b.Helper()
	idx := openapi.ParseAndIndex(spec.Content)
	if idx == nil || idx.Document == nil {
		b.Skip("spec did not parse")
	}
	return idx
}

// BenchmarkJSRuleExecution measures the cost of executing a single JS rule
// (operations visitor) via goja across different spec sizes.
func BenchmarkJSRuleExecution(b *testing.B) {
	rule := mustParseRule(b, jsOperationsRule, "bench.js")
	for _, spec := range specs.BenchmarkSpecs() {
		idx := benchSpecIndex(b, spec)
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			b.ReportAllocs()
			b.SetBytes(int64(len(spec.Content)))
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_ = rule.Execute(idx)
			}
		})
	}
}

// BenchmarkTSTranspilation measures the isolated cost of transpiling TS to JS
// via esbuild, independent of rule execution.
func BenchmarkTSTranspilation(b *testing.B) {
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := script.TranspileTS(tsOperationsRule)
		if err != nil {
			b.Fatal(err)
		}
	}
}

// BenchmarkTSRuleExecution measures the end-to-end cost of transpiling a TS
// rule and executing it. The transpilation happens each iteration to capture
// the full per-rule overhead.
func BenchmarkTSRuleExecution(b *testing.B) {
	js, err := script.TranspileTS(tsOperationsRule)
	if err != nil {
		b.Fatal(err)
	}
	rule := mustParseRule(b, js, "bench.ts")

	for _, spec := range specs.BenchmarkSpecs() {
		idx := benchSpecIndex(b, spec)
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			b.ReportAllocs()
			b.SetBytes(int64(len(spec.Content)))
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_ = rule.Execute(idx)
			}
		})
	}
}

// BenchmarkTSTranspileAndExecute measures the full pipeline: transpile TS then
// execute, including transpilation cost in every iteration.
func BenchmarkTSTranspileAndExecute(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		idx := benchSpecIndex(b, spec)
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			b.ReportAllocs()
			b.SetBytes(int64(len(spec.Content)))
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				js, err := script.TranspileTS(tsOperationsRule)
				if err != nil {
					b.Fatal(err)
				}
				meta, ok := script.ParseScriptMeta(js)
				if !ok {
					b.Fatal("failed to parse transpiled meta")
				}
				rule := &script.ScriptRule{Path: "bench.ts", Meta: meta, Source: js}
				_ = rule.Execute(idx)
			}
		})
	}
}

// BenchmarkMultipleJSRules measures the cost of executing three different JS
// rules in sequence, simulating a real user ruleset.
func BenchmarkMultipleJSRules(b *testing.B) {
	ruleOps := mustParseRule(b, jsOperationsRule, "ops.js")
	ruleSchemas := mustParseRule(b, jsSchemasRule, "schemas.js")
	ruleParams := mustParseRule(b, jsParametersRule, "params.js")

	for _, spec := range specs.BenchmarkSpecs() {
		idx := benchSpecIndex(b, spec)
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			b.ReportAllocs()
			b.SetBytes(int64(len(spec.Content)))
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_ = ruleOps.Execute(idx)
				_ = ruleSchemas.Execute(idx)
				_ = ruleParams.Execute(idx)
			}
		})
	}
}

// BenchmarkJSMetaParse measures the cost of parsing exports.meta from JS
// source, which involves spinning up a goja VM.
func BenchmarkJSMetaParse(b *testing.B) {
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, ok := script.ParseScriptMeta(jsOperationsRule)
		if !ok {
			b.Fatal("failed to parse meta")
		}
	}
}

// BenchmarkJSRuleExecution_Schemas benchmarks a JS rule using the schemas
// visitor to compare visitor overhead across different types.
func BenchmarkJSRuleExecution_Schemas(b *testing.B) {
	rule := mustParseRule(b, jsSchemasRule, "schemas.js")
	for _, spec := range specs.BenchmarkSpecs() {
		idx := benchSpecIndex(b, spec)
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			b.ReportAllocs()
			b.SetBytes(int64(len(spec.Content)))
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_ = rule.Execute(idx)
			}
		})
	}
}
