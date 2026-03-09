# Telescope Go SDK Guide

The Telescope SDK provides a stable public Go API for using Telescope as a library. It wraps the core graph engine, pipeline runner, and snapshot manager into a single high-level interface suitable for CLI tools and external consumers such as [Cartographer](https://github.com/sailpoint-oss/openapi-generation).

## Quick Start

```go
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/sailpoint-oss/telescope/server/core/graph"
	"github.com/sailpoint-oss/telescope/server/sdk"
)

func main() {
	ctx := context.Background()

	ws, err := sdk.New()
	if err != nil {
		log.Fatal(err)
	}
	defer ws.Close()

	// Add a synthetic OpenAPI document
	content := []byte(`openapi: "3.1.0"
info:
  title: My API
  version: "1.0"
paths:
  /users:
    get:
      operationId: listUsers
      summary: List users
      responses:
        "200":
          description: OK
`)

	src := graph.NewSyntheticSource("file:///spec.yaml", content, graph.ClassificationHint{
		IsOpenAPI:      true,
		OpenAPIVersion: "3.1",
	})
	ws.AddSource(src)

	result, err := ws.Analyze(ctx)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("Analyzed %d documents in %v\n", result.NodeCount, result.Duration)
	fmt.Printf("Total diagnostics: %d\n", result.TotalDiagnostics())
	if result.HasErrors() {
		for uri, diags := range result.Diagnostics {
			for _, d := range diags {
				if d.Severity == sdk.SeverityError {
					fmt.Printf("%s: %s\n", uri, d.Message)
				}
			}
		}
	}
}
```

## Creating a Workspace

Use `sdk.New()` with optional configuration:

```go
ws, err := sdk.New(
	sdk.WithBuiltinRules(true),       // Enable built-in Telescope rules (default: true)
	sdk.WithCustomRules(false),       // Enable Bun sidecar for TS custom rules
	sdk.WithLogger(slog.Default()),
	sdk.WithConfig(cfg),              // Use a specific Telescope config
	sdk.WithGoroutinePoolSize(8),     // Limit concurrent analysis goroutines
	sdk.WithStages(customStages),     // Override default pipeline stages (advanced)
)
```

| Option | Description |
|--------|-------------|
| `WithBuiltinRules(bool)` | Enable or disable built-in rules. Default: `true`. |
| `WithCustomRules(bool)` | Enable Bun sidecar for TypeScript custom rules. Default: `false`. |
| `WithLogger(*slog.Logger)` | Set the logger for pipeline and workspace operations. |
| `WithConfig(*config.Config)` | Set a specific Telescope configuration. |
| `WithGoroutinePoolSize(int)` | Limit the number of concurrent analysis goroutines. |
| `WithStages([]graph.Stage)` | Override the default pipeline stages. Use for custom processing. |

## Adding Documents

### Synthetic Source (Programmatic)

For in-memory content (e.g., Cartographer linting extracted specs):

```go
content := []byte(`openapi: "3.1.0" ...`)
src := graph.NewSyntheticSource(
	"file:///path/to/spec.yaml",
	content,
	graph.ClassificationHint{
		IsOpenAPI:      true,
		OpenAPIVersion: "3.1",
		IsFragment:     false,
	},
)
ws.AddSource(src)
```

`ClassificationHint` helps the classifier avoid re-scanning content. If `IsOpenAPI` is true, the document is treated as OpenAPI; `IsFragment` indicates a `$ref` fragment rather than a root document.

### Filesystem Source

For files on disk:

```go
src := graph.NewFilesystemSource("/path/to/openapi.yaml", graph.ClassificationHint{})
ws.AddSource(src)
```

### Updating Synthetic Content

If you need to update content after adding:

```go
if src, ok := node.Source.(*graph.SyntheticSource); ok {
	src.Update(newContent)
}
ws.Graph().Invalidate(uri)
```

## Running Analysis

### Full Workspace Analysis

```go
result, err := ws.Analyze(ctx)
if err != nil {
	return err
}

// Result contains:
// - Diagnostics: map[URI][]Diagnostic
// - NodeCount, EdgeCount, RootDocuments
// - Duration, SnapshotID
```

### Single Document Analysis

```go
diags, err := ws.AnalyzeURI(ctx, "file:///spec.yaml")
if err != nil {
	return err
}
for _, d := range diags {
	fmt.Printf("%s: %s\n", d.Code, d.Message)
}
```

## Working with Results

### AnalysisResult

| Field | Type | Description |
|-------|------|-------------|
| `Diagnostics` | `map[string][]ctypes.Diagnostic` | URI → diagnostics |
| `NodeCount` | `int` | Number of documents in the graph |
| `EdgeCount` | `int` | Number of `$ref` edges |
| `RootDocuments` | `[]string` | Root OpenAPI document URIs |
| `Duration` | `time.Duration` | Analysis duration |
| `SnapshotID` | `uint64` | ID of the built snapshot |
| `StageDurations` | `map[string]time.Duration` | Per-stage cumulative timing |
| `RuleDurations` | `map[string]time.Duration` | Per-rule cumulative timing |

### Helper Methods

```go
total := result.TotalDiagnostics()
diags := result.DiagnosticsForURI("file:///spec.yaml")
hasErr := result.HasErrors()
```

## Graph Access

For advanced use cases, get a read-only view of the workspace graph:

```go
g := ws.Graph()

// Query structure
nodes := g.AllNodes()
roots := g.Roots()
deps := g.Dependencies(uri)
dependents := g.Dependents(uri)
edges := g.EdgesFrom(uri)
cycles := g.DetectCycles()
```

## Snapshots

Snapshots are immutable point-in-time views of the graph. Built automatically after `Analyze()`:

```go
snap := ws.Snapshot()
if snap != nil {
	for uri, diags := range snap.Diagnostics {
		// Process diagnostics per document
	}
}
```

Register a callback for when new snapshots are built:

```go
ws.OnSnapshot(func(snap *graph.Snapshot) {
	fmt.Printf("Snapshot %d: %d nodes\n", snap.ID, len(snap.Nodes))
})
```

## Integration Patterns

### Cartographer Integration

Cartographer extracts OpenAPI specs from Java, Go, and TypeScript services. It uses the Telescope SDK to lint extracted specs before bundling:

```go
// Pseudocode: Cartographer lint flow
ws, _ := sdk.New()
for _, spec := range extractedSpecs {
	src := graph.NewSyntheticSource(spec.URI, spec.Content, graph.ClassificationHint{
		IsOpenAPI:      true,
		OpenAPIVersion: "3.2",
	})
	ws.AddSource(src)
}
result, _ := ws.Analyze(ctx)
if result.HasErrors() {
	// Fail gate or report
}
```

### CI Linter

```go
ws, _ := sdk.New()
for _, path := range os.Args[1:] {
	src := graph.NewFilesystemSource(path, graph.ClassificationHint{})
	ws.AddSource(src)
}
result, err := ws.Analyze(ctx)
if err != nil {
	os.Exit(1)
}
if result.HasErrors() {
	for uri, diags := range result.Diagnostics {
		for _, d := range diags {
			if d.Severity == sdk.SeverityError {
				fmt.Fprintf(os.Stderr, "%s:%d: %s\n", uri, d.Range.Start.Line+1, d.Message)
			}
		}
	}
	os.Exit(1)
}
```

## API Reference

### Workspace

| Method | Signature | Description |
|--------|------------|-------------|
| `New` | `New(opts ...Option) (*Workspace, error)` | Create a workspace. |
| `AddSource` | `AddSource(src graph.DocumentSource)` | Add a document source. |
| `RemoveSource` | `RemoveSource(uri string)` | Remove a document. |
| `Analyze` | `Analyze(ctx context.Context) (*AnalysisResult, error)` | Run full pipeline on all documents. |
| `AnalyzeURI` | `AnalyzeURI(ctx context.Context, uri string) ([]ctypes.Diagnostic, error)` | Run pipeline for a single document. |
| `Graph` | `Graph() graph.ReadOnlyGraph` | Read-only graph access. |
| `Snapshot` | `Snapshot() *graph.Snapshot` | Current snapshot (nil if none built). |
| `OnSnapshot` | `OnSnapshot(fn func(*graph.Snapshot))` | Register snapshot callback. |
| `Close` | `Close() error` | Release resources. |

### DocumentSource Implementations

| Type | Constructor | Use Case |
|------|--------------|----------|
| `SyntheticSource` | `graph.NewSyntheticSource(uri, content, hint)` | Programmatic injection |
| `FilesystemSource` | `graph.NewFilesystemSource(path, hint)` | Files on disk |
| `LSPSource` | `graph.NewLSPSource(uri, provider, hint)` | LSP document overlays |

### Core Types

Diagnostics use `core/types`:

- `ctypes.Diagnostic` — Range, Severity, Code, Message, Tags, Related, Data
- `ctypes.Range` — Start, End (Position)
- `ctypes.Severity` — Error (1), Warning (2), Info (3), Hint (4)
