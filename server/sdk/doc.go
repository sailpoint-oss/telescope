// Package sdk provides the public Go API for using Telescope as a library.
// It includes two main surfaces:
//
//  1. Workspace API — Programmatic linting for CLI tools and external consumers (e.g. Cartographer)
//  2. Plugin API — Building custom rules as standalone Go binaries (hashicorp/go-plugin RPC)
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
// # Plugin API (Custom Rules)
//
// Plugins are compiled Go programs that communicate with the Telescope
// host over RPC (via hashicorp/go-plugin). The SDK re-exports all
// necessary types from the openapi and rules packages so plugin authors
// only need a single import.
//
//	package main
//
//	import "github.com/sailpoint-oss/telescope/server/sdk"
//
//	func main() {
//	    p := sdk.NewPlugin("my-plugin", "1.0.0")
//
//	    sdk.Rule("my-rule", sdk.Meta{
//	        Description: "Operations must have summaries",
//	        Severity:    sdk.Warn,
//	        Category:    sdk.Documentation,
//	        Recommended: true,
//	    }).Operations(func(path, method string, op *sdk.Operation, r *sdk.Reporter) {
//	        if op.Summary.Text == "" {
//	            r.At(op.Loc, "%s %s needs a summary", method, path)
//	        }
//	    }).Register(p)
//
//	    p.Serve() // blocks until host disconnects
//	}
//
// Compile the plugin binary and place it in .telescope/plugins/ for
// automatic discovery, or reference it in .telescope.yaml.
//
// # Available Types
//
// All OpenAPI model types (Document, Operation, Schema, Parameter, etc.)
// and rule types (Reporter, Meta, Category, Validator) are re-exported
// as type aliases so plugin code needs only the sdk import path.
//
// # Validators
//
// Composable validators are available via the [V] variable:
//
//	sdk.V.Required()
//	sdk.V.CamelCase()
//	sdk.V.All(sdk.V.Required(), sdk.V.MinLength(3))
package sdk
