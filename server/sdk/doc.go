// Package sdk provides a batteries-included SDK for building Telescope
// plugins as standalone Go binaries.
//
// Plugins are compiled Go programs that communicate with the Telescope
// host over RPC (via hashicorp/go-plugin). The SDK re-exports all
// necessary types from the openapi and rules packages so plugin authors
// only need a single import.
//
// # Quick Start
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
