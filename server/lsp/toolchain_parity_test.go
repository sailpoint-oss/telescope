package lsp_test

import (
	"fmt"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/barrelman"
	barrelAnalyzers "github.com/sailpoint-oss/barrelman/analyzers"
	barrelChecks "github.com/sailpoint-oss/barrelman/checks"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
	ruleAnalyzers "github.com/sailpoint-oss/telescope/server/rules/analyzers"
	ruleChecks "github.com/sailpoint-oss/telescope/server/rules/checks"
	"github.com/sailpoint-oss/telescope/server/testutil"
	"github.com/sailpoint-oss/telescope/server/testutil/specs"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

func TestToolchainFixtureParity_BarrelmanRulesAndLSP(t *testing.T) {
	fixtures := []struct {
		name  string
		codes []string
	}{
		{
			name:  "invalid-openapi-structural",
			codes: []string{"oas3-schema"},
		},
		{
			name:  "test-duplicate-operation-ids",
			codes: []string{"sailpoint-operation-id-unique"},
		},
		{
			name:  "missing-path-parameters",
			codes: []string{"path-params"},
		},
	}

	for _, tc := range fixtures {
		t.Run(tc.name, func(t *testing.T) {
			spec := specs.ByName(tc.name)
			if len(spec.Content) == 0 {
				t.Fatalf("fixture %q not found", tc.name)
			}
			include := includeSet(tc.codes)

			barrelmanKeys := filterKeys(barrelmanFixtureDiagnostics(t, spec), include)
			telescopeKeys := filterKeys(telescopeRuleDiagnostics(t, spec), include)
			lspKeys := filterKeys(lspFixtureDiagnostics(t, spec), include)
			if len(barrelmanKeys) == 0 || len(telescopeKeys) == 0 || len(lspKeys) == 0 {
				t.Fatalf("expected filtered diagnostics for %q, got barrelman=%v telescope=%v lsp=%v", tc.name, barrelmanKeys, telescopeKeys, lspKeys)
			}

			if !reflectStringSlicesEqual(barrelmanKeys, telescopeKeys) {
				t.Fatalf("barrelman/telescope parity mismatch\nbarrelman=%v\ntelescope=%v", barrelmanKeys, telescopeKeys)
			}
			if !reflectStringSlicesEqual(telescopeKeys, lspKeys) {
				t.Fatalf("telescope/lsp parity mismatch\ntelescope=%v\nlsp=%v", telescopeKeys, lspKeys)
			}
		})
	}
}

func barrelmanFixtureDiagnostics(t *testing.T, spec specs.Spec) []string {
	t.Helper()
	diags, err := barrelman.LintContent(spec.URI(), spec.Content, barrelman.LintOptions{
		Rules: toolchainRules(),
	})
	if err != nil {
		t.Fatalf("barrelman lint %q: %v", spec.Name, err)
	}
	if idx := openapi.ParseAndIndex(spec.Content); idx != nil {
		diags = stabilizeDuplicateOperationIDDiagnostics(diags, idx.Document)
	}
	return normalizeBarrelmanDiagnostics(diags)
}

func telescopeRuleDiagnostics(t *testing.T, spec specs.Spec) []string {
	t.Helper()
	tree, lang := parseFixtureTree(t, spec)

	idx := openapi.ParseAndIndex(spec.Content)
	allAnalyzers, allChecks := rules.CollectAll(ruleAnalyzers.RegisterAll, ruleChecks.RegisterAll)
	diags := rules.RunAnalyzers(allAnalyzers, idx, spec.URI(), tree)
	diags = append(diags, rules.RunChecks(allChecks, tree, lang)...)
	return normalizeProtocolDiagnostics(adapt.DiagnosticsToProtocol(diags))
}

func lspFixtureDiagnostics(t *testing.T, spec specs.Spec) []string {
	t.Helper()
	client := newTestServer(t)
	client.OpenWithLanguage(spec.URI(), spec.LanguageID(), string(spec.Content))
	diags := client.WaitForDiagnostics(spec.URI(), 5*time.Second)
	return normalizeProtocolDiagnostics(diags)
}

func parseFixtureTree(t *testing.T, spec specs.Spec) (*treesitter.Tree, *tree_sitter.Language) {
	t.Helper()
	if spec.Format == openapi.FormatJSON {
		raw := testutil.ParseJSON(t, spec.Content)
		return treesitter.NewTree(raw, spec.Content), testutil.JSONLanguage()
	}
	raw := testutil.ParseYAML(t, spec.Content)
	return treesitter.NewTree(raw, spec.Content), testutil.YAMLLanguage()
}

func toolchainRules() []barrelman.Rule {
	reg := barrelman.NewRegistry()
	barrelAnalyzers.RegisterAll(reg)
	barrelChecks.RegisterAll(reg)
	return reg.AllRules()
}

func normalizeBarrelmanDiagnostics(diags []barrelman.Diagnostic) []string {
	keys := make(map[string]struct{}, len(diags))
	for _, diag := range diags {
		key := fmt.Sprintf("%d|%s|%s", diag.Severity, diag.Code, diag.Message)
		keys[key] = struct{}{}
	}
	return sortedKeys(keys)
}

func stabilizeDuplicateOperationIDDiagnostics(diags []barrelman.Diagnostic, doc *openapi.Document) []barrelman.Diagnostic {
	if doc == nil || len(diags) == 0 {
		return diags
	}

	firsts := duplicateOperationIDFirsts(doc)
	if len(firsts) == 0 {
		return diags
	}

	stable := make([]barrelman.Diagnostic, len(diags))
	copy(stable, diags)

	for i := range stable {
		if stable[i].Code != "operation-operationId-unique" && stable[i].Code != "sailpoint-operation-id-unique" {
			continue
		}
		opID, ok := duplicateOperationIDFromMessage(stable[i].Message)
		if !ok {
			continue
		}
		first, ok := firsts[opID]
		if !ok {
			continue
		}
		stable[i].Message = fmt.Sprintf("operationId '%s' is already used at %s", opID, first)
	}

	return stable
}

func duplicateOperationIDFirsts(doc *openapi.Document) map[string]string {
	firsts := make(map[string]string)
	seen := make(map[string]string)

	for _, path := range sortedPaths(doc.Paths) {
		item := doc.Paths[path]
		for _, mo := range item.Operations() {
			opID := mo.Operation.OperationID
			if opID == "" {
				continue
			}
			desc := strings.ToUpper(mo.Method) + " " + path
			if first, ok := seen[opID]; ok {
				firsts[opID] = first
				continue
			}
			seen[opID] = desc
		}
	}

	return firsts
}

func duplicateOperationIDFromMessage(message string) (string, bool) {
	for _, prefix := range []string{"operationId '"} {
		rest, ok := strings.CutPrefix(message, prefix)
		if !ok {
			continue
		}
		opID, _, ok := strings.Cut(rest, "' is already used at ")
		if !ok || opID == "" {
			return "", false
		}
		return opID, true
	}
	return "", false
}

func sortedPaths(paths map[string]*openapi.PathItem) []string {
	keys := make([]string, 0, len(paths))
	for path := range paths {
		keys = append(keys, path)
	}
	sort.Strings(keys)
	return keys
}

func normalizeProtocolDiagnostics(diags []protocol.Diagnostic) []string {
	keys := make(map[string]struct{}, len(diags))
	for _, diag := range diags {
		code := ""
		switch v := diag.Code.(type) {
		case string:
			code = v
		case fmt.Stringer:
			code = v.String()
		case nil:
		default:
			code = fmt.Sprint(v)
		}
		key := fmt.Sprintf("%d|%s|%s", diag.Severity, code, diag.Message)
		keys[key] = struct{}{}
	}
	return sortedKeys(keys)
}

func includeSet(codes []string) map[string]struct{} {
	out := make(map[string]struct{}, len(codes))
	for _, code := range codes {
		out[code] = struct{}{}
	}
	return out
}

func filterKeys(keys []string, include map[string]struct{}) []string {
	var out []string
	for _, key := range keys {
		parts := strings.SplitN(key, "|", 3)
		if len(parts) != 3 {
			continue
		}
		if _, ok := include[parts[1]]; ok {
			out = append(out, key)
		}
	}
	return out
}

func sortedKeys(keys map[string]struct{}) []string {
	out := make([]string, 0, len(keys))
	for key := range keys {
		out = append(out, key)
	}
	sort.Strings(out)
	return out
}

func reflectStringSlicesEqual(a []string, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
