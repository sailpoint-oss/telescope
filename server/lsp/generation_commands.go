package lsp

import (
	"context"
	"fmt"
	"time"

	"github.com/sailpoint-oss/telescope/server/generation"
	"github.com/sailpoint-oss/telescope/server/lsp/projection"
)

// ExecuteGenerationCommand dispatches the generation-loop commands the VS
// Code extension invokes via workspace/executeCommand. Exported so tests and
// alternative server wirings can share the same handler shape.
func ExecuteGenerationCommand(ctx context.Context, mgr *generation.Manager, command string, args []interface{}) (interface{}, error) {
	if mgr == nil {
		return nil, fmt.Errorf("generation not enabled")
	}
	switch command {
	case "telescope.regenerate":
		return generationRegenerate(ctx, mgr, args)
	case "telescope.writeSpecNow":
		return generationWriteNow(mgr, args)
	case "telescope.openGeneratedSpec":
		return generationOpenGeneratedSpec(mgr, args)
	case "telescope.openSourceForSpec":
		return generationOpenSourceForSpec(mgr, args)
	case "telescope.getGeneratedSpecBytes":
		return generationGetSpecBytes(mgr, args)
	case "telescope.getGeneratedSpecTree":
		return generationGetSpecTree(mgr, args)
	case "telescope.getSourceContributions":
		return generationGetSourceContributions(mgr, args)
	case "telescope.getSourceMapForFile":
		return generationGetSourceContributions(mgr, args)
	}
	return nil, nil
}

// GenerationCommandNames lists the command ids the server registers so they
// can be advertised via ExecuteCommandProvider in InitializeResult.
func GenerationCommandNames() []string {
	return []string{
		"telescope.regenerate",
		"telescope.writeSpecNow",
		"telescope.openGeneratedSpec",
		"telescope.openSourceForSpec",
		"telescope.getGeneratedSpecBytes",
		"telescope.getGeneratedSpecTree",
		"telescope.getSourceContributions",
		"telescope.getSourceMapForFile",
	}
}

func generationRegenerate(ctx context.Context, mgr *generation.Manager, args []interface{}) (interface{}, error) {
	loop := pickLoop(mgr, firstStringArg(args))
	if loop == nil {
		return nil, fmt.Errorf("no generation loop")
	}
	res, err := loop.RegenerateNow(ctx, generation.TriggerOnDemand)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"root":        loop.Root(),
		"durationMs":  res.Duration.Milliseconds(),
		"operations":  res.Operations,
		"types":       res.Types,
		"generatedAt": res.GeneratedAt.Format(time.RFC3339),
	}, nil
}

func generationWriteNow(mgr *generation.Manager, args []interface{}) (interface{}, error) {
	loop := pickLoop(mgr, firstStringArg(args))
	if loop == nil {
		return nil, fmt.Errorf("no generation loop")
	}
	if err := loop.WriteNow(); err != nil {
		return nil, err
	}
	return map[string]any{"written": true, "path": loop.Writer().OutputPath()}, nil
}

func generationOpenGeneratedSpec(mgr *generation.Manager, args []interface{}) (interface{}, error) {
	loop := pickLoop(mgr, firstStringArg(args))
	if loop == nil {
		return nil, fmt.Errorf("no generation loop")
	}
	result, ok := loop.Current()
	if !ok {
		return nil, fmt.Errorf("no spec yet; run telescope.regenerate first")
	}
	// Prefer disk URI when a recent on-disk copy exists; otherwise the
	// virtual telescope-generated:// URI.
	if _, ok, _ := loop.Writer().OnDiskHash(result); ok {
		return map[string]any{"uri": "file://" + loop.Writer().OutputPath(), "kind": "disk"}, nil
	}
	return map[string]any{
		"uri":  GeneratedURIScheme + ":/" + loop.Root() + "/openapi.yaml",
		"kind": "virtual",
	}, nil
}

func generationOpenSourceForSpec(mgr *generation.Manager, args []interface{}) (interface{}, error) {
	if len(args) < 2 {
		return nil, fmt.Errorf("telescope.openSourceForSpec requires (specURI, pointer)")
	}
	pointer, _ := args[1].(string)
	loop := pickLoop(mgr, firstStringArg(args))
	if loop == nil {
		return nil, fmt.Errorf("no generation loop")
	}
	result, ok := loop.Current()
	if !ok || result.SourceMap == nil {
		return nil, fmt.Errorf("no source map yet")
	}
	resolver := projection.NewResolver(result.SourceMap)
	loc, ok := resolver.Project(pointer)
	if !ok || loc.IsZero() {
		return nil, fmt.Errorf("pointer %q does not resolve to a source location", pointer)
	}
	return map[string]any{
		"file": loc.File, "line": loc.Line, "column": loc.Column, "pointer": pointer,
	}, nil
}

func generationGetSpecBytes(mgr *generation.Manager, args []interface{}) (interface{}, error) {
	loop := pickLoop(mgr, firstStringArg(args))
	if loop == nil {
		return nil, fmt.Errorf("no generation loop")
	}
	result, ok := loop.Current()
	if !ok {
		return "", nil
	}
	return string(result.SpecBytes), nil
}

func generationGetSpecTree(mgr *generation.Manager, args []interface{}) (interface{}, error) {
	loop := pickLoop(mgr, firstStringArg(args))
	if loop == nil {
		return nil, fmt.Errorf("no generation loop")
	}
	result, ok := loop.Current()
	if !ok || result.SpecMap == nil {
		return map[string]any{"paths": []any{}, "schemas": []any{}}, nil
	}
	return specTreeFromMap(result.SpecMap), nil
}

func generationGetSourceContributions(mgr *generation.Manager, args []interface{}) (interface{}, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("requires (sourceURI)")
	}
	uri, _ := args[0].(string)
	for _, root := range mgr.Roots() {
		loop, ok := mgr.Get(root)
		if !ok {
			continue
		}
		res, ok := loop.Current()
		if !ok || res.SourceMap == nil {
			continue
		}
		file := uriToFSPath(uri)
		fc := projection.ContributionsForFile(res.SourceMap, file)
		if fc != nil {
			return fc, nil
		}
	}
	return nil, nil
}

// specTreeFromMap renders a lightweight {paths, schemas} shape for the
// Generated Spec TreeView. Diagnostic counts are filled in on the client
// side from the mux's last publish.
func specTreeFromMap(spec map[string]interface{}) map[string]any {
	tree := map[string]any{"paths": []any{}, "schemas": []any{}}
	if paths, ok := spec["paths"].(map[string]interface{}); ok {
		list := make([]any, 0, len(paths))
		for path, methodsRaw := range paths {
			methods, _ := methodsRaw.(map[string]interface{})
			opList := make([]any, 0)
			for m := range methods {
				opList = append(opList, map[string]any{"method": m, "path": path})
			}
			list = append(list, map[string]any{"path": path, "operations": opList})
		}
		tree["paths"] = list
	}
	if comps, ok := spec["components"].(map[string]interface{}); ok {
		if schemas, ok := comps["schemas"].(map[string]interface{}); ok {
			list := make([]any, 0, len(schemas))
			for name := range schemas {
				list = append(list, map[string]any{"name": name})
			}
			tree["schemas"] = list
		}
	}
	return tree
}

func pickLoop(mgr *generation.Manager, root string) *generation.Loop {
	if root != "" {
		if l, ok := mgr.Get(root); ok {
			return l
		}
	}
	roots := mgr.Roots()
	if len(roots) == 0 {
		return nil
	}
	l, _ := mgr.Get(roots[0])
	return l
}

func firstStringArg(args []interface{}) string {
	if len(args) == 0 {
		return ""
	}
	s, _ := args[0].(string)
	return s
}
