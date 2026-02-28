package script

import (
	"time"

	"github.com/dop251/goja"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

const defaultTimeout = 5 * time.Second

// gojaRuntime wraps a goja VM for executing a single JS rule.
type gojaRuntime struct {
	source string
	meta   ScriptMeta
}

func newGojaRuntime(source string, meta ScriptMeta) *gojaRuntime {
	return &gojaRuntime{source: source, meta: meta}
}

func (r *gojaRuntime) execute(idx *openapi.Index) []ScriptDiagnostic {
	vm := goja.New()

	// Set up timeout to prevent infinite loops
	timer := time.AfterFunc(defaultTimeout, func() {
		vm.Interrupt("script execution timeout")
	})
	defer timer.Stop()

	// Set up CommonJS-style exports object
	exports := vm.NewObject()
	_ = vm.Set("exports", exports)

	// Run the script to populate exports
	if _, err := vm.RunString(r.source); err != nil {
		return nil
	}

	// Get the check function
	checkVal := exports.Get("check")
	if checkVal == nil || goja.IsUndefined(checkVal) || goja.IsNull(checkVal) {
		return nil
	}
	checkFn, ok := goja.AssertFunction(checkVal)
	if !ok {
		return nil
	}

	// Build the bridge context
	bridge := newBridge(vm, idx)
	ctx := bridge.buildContext()

	// Call check(ctx)
	if _, err := checkFn(goja.Undefined(), ctx); err != nil {
		return nil
	}

	return bridge.diagnostics()
}

// ParseScriptMeta extracts the meta export from a JS file without running check().
func ParseScriptMeta(source string) (ScriptMeta, bool) {
	vm := goja.New()

	timer := time.AfterFunc(2*time.Second, func() {
		vm.Interrupt("meta parse timeout")
	})
	defer timer.Stop()

	exports := vm.NewObject()
	_ = vm.Set("exports", exports)

	if _, err := vm.RunString(source); err != nil {
		return ScriptMeta{}, false
	}

	metaVal := exports.Get("meta")
	if metaVal == nil || goja.IsUndefined(metaVal) || goja.IsNull(metaVal) {
		return ScriptMeta{}, false
	}

	metaObj := metaVal.ToObject(vm)
	if metaObj == nil {
		return ScriptMeta{}, false
	}

	id := getString(metaObj, "id")
	if id == "" {
		return ScriptMeta{}, false
	}

	return ScriptMeta{
		ID:          id,
		Description: getString(metaObj, "description"),
		Severity:    getString(metaObj, "severity"),
		Category:    getString(metaObj, "category"),
	}, true
}

func getString(obj *goja.Object, key string) string {
	v := obj.Get(key)
	if v == nil || goja.IsUndefined(v) || goja.IsNull(v) {
		return ""
	}
	return v.String()
}
