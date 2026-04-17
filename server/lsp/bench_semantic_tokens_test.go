package lsp_test

import (
	"fmt"
	"testing"

	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/lsp"
	"github.com/sailpoint-oss/telescope/server/testutil/specs"
)

// Viewport is the per-request line window we target for Range handler
// benchmarks. 200 lines is what a typical VS Code viewport shows for a YAML
// editor at a reasonable font size.
const semanticTokensViewport = 200

// BenchmarkSemanticTokens_Full_Large runs the Full handler against the
// largest spec in the registry. Serves as the cold-cache baseline and as
// the upper bound on what the Range handler is ever allowed to cost when it
// misses cache on viewport scrolls.
func BenchmarkSemanticTokens_Full_Large(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			env := setupBenchEnv(b, spec)
			cache := lsp.NewSemanticTokenCache(0)
			handler := lsp.NewSemanticTokensHandler(env.cache, nil, cache)
			params := &protocol.SemanticTokensParams{
				TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			}
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_, _ = handler(env.ctx, params)
			}
		})
	}
}

// BenchmarkSemanticTokens_Range_Small measures a tight viewport request with
// a cold cache on every iteration. The SemanticTokenCache is constructed
// fresh per iteration so the builder runs each time -- this is the worst
// case for Range handler latency during a scroll that keeps outrunning the
// cache insert.
func BenchmarkSemanticTokens_Range_Small(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			env := setupBenchEnv(b, spec)
			params := &protocol.SemanticTokensRangeParams{
				TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
				Range: protocol.Range{
					Start: protocol.Position{Line: uint32(spec.Lines / 2), Character: 0},
					End:   protocol.Position{Line: uint32(spec.Lines/2) + semanticTokensViewport, Character: 0},
				},
			}
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				cache := lsp.NewSemanticTokenCache(0)
				handler := lsp.NewSemanticTokensRangeHandler(env.cache, nil, cache)
				_, _ = handler(env.ctx, params)
			}
		})
	}
}

// BenchmarkSemanticTokens_Range_Hot covers the common case: first request
// builds + caches, subsequent requests for the same version binary-search
// into the cached slice. Reflects scroll responsiveness after the first
// keystroke lands.
func BenchmarkSemanticTokens_Range_Hot(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			env := setupBenchEnv(b, spec)
			cache := lsp.NewSemanticTokenCache(0)
			handler := lsp.NewSemanticTokensRangeHandler(env.cache, nil, cache)
			params := &protocol.SemanticTokensRangeParams{
				TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
				Range: protocol.Range{
					Start: protocol.Position{Line: uint32(spec.Lines / 2), Character: 0},
					End:   protocol.Position{Line: uint32(spec.Lines/2) + semanticTokensViewport, Character: 0},
				},
			}
			// Warm the cache once so the timed loop only exercises the hot path.
			if _, err := handler(env.ctx, params); err != nil {
				b.Fatalf("warmup: %v", err)
			}
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_, _ = handler(env.ctx, params)
			}
		})
	}
}

// BenchmarkSemanticTokens_Range_Scroll simulates scrolling: 25 successive
// range calls at increasing offsets, all against the same cached version.
// The first call builds + caches; the remaining 24 are pure binary-search.
// Useful for measuring steady-state scroll cost on real-world specs.
func BenchmarkSemanticTokens_Range_Scroll(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			env := setupBenchEnv(b, spec)
			cache := lsp.NewSemanticTokenCache(0)
			handler := lsp.NewSemanticTokensRangeHandler(env.cache, nil, cache)
			const scrollSteps = 25
			if spec.Lines < scrollSteps*semanticTokensViewport {
				b.Skip("spec too short to exercise scroll path")
			}
			stride := spec.Lines / scrollSteps
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				for step := 0; step < scrollSteps; step++ {
					start := uint32(step * stride)
					params := &protocol.SemanticTokensRangeParams{
						TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
						Range: protocol.Range{
							Start: protocol.Position{Line: start, Character: 0},
							End:   protocol.Position{Line: start + semanticTokensViewport, Character: 0},
						},
					}
					_, _ = handler(env.ctx, params)
				}
			}
		})
	}
}
