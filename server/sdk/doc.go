// Package sdk provides the public Go API for using Telescope as a library.
//
// # Workspace API (Programmatic Linting)
//
// Use [Workspace] to lint OpenAPI specs without running the LSP server:
//
//	ws, err := sdk.New()
//	if err != nil {
//	    log.Fatal(err)
//	}
//	defer ws.Close()
//
//	// Add files from disk or synthetic content
//	ws.AddSource(graph.NewFilesystemSource("openapi.yaml", graph.ClassificationHint{}))
//	// Or: ws.AddSource(graph.NewSyntheticSource("file:///spec.yaml", content, graph.ClassificationHint{}))
//
//	result, err := ws.Analyze(ctx)
//	if err != nil {
//	    log.Fatal(err)
//	}
//
//	for uri, diags := range result.Diagnostics {
//	    for _, d := range diags {
//	        fmt.Printf("%s:%d: [%s] %s\n", uri, d.Range.Start.Line+1, d.Code, d.Message)
//	    }
//	}
//
// See docs/SDK.md for the full guide.
//
// # Custom rules
//
// User-defined rules are authored as YAML (under openapi.rules and related
// config) and TypeScript/JavaScript executed by the optional Bun sidecar.
// There is no Go plugin or subprocess RPC surface for custom rules.
//
// # Available Types
//
// Re-exported OpenAPI model types (Document, Operation, Schema, Parameter,
// etc.) and rule helpers (Reporter, Meta, Category, Validator) are available
// as type aliases for consumers that embed Telescope.
//
// # Validators
//
// Composable validators are available via the [V] variable:
//
//	sdk.V.Required()
//	sdk.V.CamelCase()
//	sdk.V.All(sdk.V.Required(), sdk.V.MinLength(3))
package sdk
