package golden

import (
	"context"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/sailpoint-oss/telescope/server/core/graph"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/sdk"
)

func TestPipelineGolden(t *testing.T) {
	dir := testdataDir(t)
	fixtures := LoadAll(t, dir)

	for _, f := range fixtures {
		t.Run(f.Name, func(t *testing.T) {
			expected := f.ParseDiagnostics(t)

			w, err := sdk.New(sdk.WithBuiltinRules(true))
			if err != nil {
				t.Fatalf("new workspace: %v", err)
			}
			defer w.Close()

			for name, content := range f.Specs {
				uri := "file:///" + f.Name + "/" + name
				src := graph.NewSyntheticSource(uri, content, graph.ClassificationHint{})
				w.AddSource(src)
			}

			result, err := w.Analyze(context.Background())
			if err != nil {
				t.Fatalf("analyze: %v", err)
			}

			var allDiags []ctypes.Diagnostic
			for _, diags := range result.Diagnostics {
				allDiags = append(allDiags, diags...)
			}

			if len(expected) == 0 {
				if len(allDiags) > 0 {
					for _, d := range allDiags {
						t.Logf("unexpected: %s (%s): %s", d.Code, severityStr(d.Severity), d.Message)
					}
				}
				return
			}

			for _, exp := range expected {
				found := false
				for _, d := range allDiags {
					if d.Code != exp.Code {
						continue
					}
					if exp.Severity != "" && severityStr(d.Severity) != exp.Severity {
						continue
					}
					if exp.Message != "" && !strings.Contains(d.Message, exp.Message) {
						continue
					}
					found = true
					break
				}
				if !found {
					t.Errorf("expected diagnostic not found: code=%s severity=%s message=%q",
						exp.Code, exp.Severity, exp.Message)
				}
			}
		})
	}
}

func severityStr(s ctypes.Severity) string {
	switch s {
	case ctypes.SeverityError:
		return "error"
	case ctypes.SeverityWarning:
		return "warning"
	case ctypes.SeverityInfo:
		return "info"
	case ctypes.SeverityHint:
		return "hint"
	default:
		return "unknown"
	}
}

func init() {
	_, filename, _, _ := runtime.Caller(0)
	_ = filepath.Dir(filename)
}
