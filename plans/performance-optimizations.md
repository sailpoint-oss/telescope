# Performance Optimizations Plan

## Overview

This document outlines performance optimization opportunities identified during the comprehensive flow analysis. These optimizations focus on reducing latency, improving throughput, and minimizing resource usage for both LSP (interactive) and CLI (batch) contexts.

**Status**: Future work - Architecture changes must be completed first.

## Part 1: Performance Hotspots Identified

### Hotspot 1: Graph Building (`buildRefGraph`)

**Location**: `packages/indexer/src/ref-graph.ts`

**Current Cost**: O(n*m) where n = documents, m = nodes per document. Traverses entire AST for every document on every build.

**Impact**: High - affects every lint operation

**Optimization Strategy**:
- Cache graph structure, only rebuild changed subgraphs
- Use incremental updates when documents change
- Parallelize graph building for multiple documents
- Track graph version per document to detect changes

**Expected Improvement**: 50-80% reduction in rebuild time for incremental changes

**Implementation Notes**:
- Add `updateGraph(docs: Map, changedUris: string[])` method
- Track graph edges per document URI
- Only rebuild edges for changed documents
- Merge with existing graph structure

### Hotspot 2: Index Building (`buildIndex`)

**Location**: `packages/indexer/src/project-index.ts`

**Current Cost**: O(n*p) where n = documents, p = paths/components per document. Multiple full AST traversals.

**Impact**: High - affects every lint operation

**Optimization Strategy**:
- Build index incrementally during graph building
- Cache index structure, update only changed sections
- Use lazy evaluation for rarely-accessed index entries
- Parallelize index building across document sections

**Expected Improvement**: 40-70% reduction in index build time

**Implementation Notes**:
- Add `updateIndex(graph: RefGraph, changedUris: string[])` method
- Track index entries per document URI
- Only rebuild index sections for changed documents
- Cache index lookups

### Hotspot 3: Context Resolution (`resolveLintingContext`)

**Location**: `packages/lens/context/context-resolver.ts`

**Current Cost**: Can trigger full workspace scan, multiple document loads, graph/index builds.

**Impact**: Medium-High - affects LSP responsiveness

**Optimization Strategy**:
- Use `ProjectContextCache` everywhere (currently only CLI uses it)
- Cache workspace root discovery results
- Lazy-load documents only when needed
- Cache context resolution results per URI

**Expected Improvement**: 30-60% reduction in context resolution time for repeated files

**Implementation Notes**:
- Add `ProjectContextCache` to legacy server (before deletion)
- Add `ProjectContextCache` to Volar server
- Cache contexts keyed by URI + workspace state hash
- Invalidate cache on file changes

### Hotspot 4: Workspace Root Discovery (`discoverWorkspaceRoots`)

**Location**: `packages/lens/context/root-discovery.ts`

**Current Cost**: O(files) - scans all YAML/JSON files, loads each to check type.

**Impact**: Medium - affects startup time

**Optimization Strategy**:
- Cache discovery results with file watcher invalidation
- Use content hash to detect changes without loading
- Parallelize file type checking
- Skip known non-OpenAPI files earlier

**Expected Improvement**: 70-90% reduction in discovery time after initial scan

**Implementation Notes**:
- Cache discovered roots with file modification times
- Invalidate cache entries when files change
- Use `host.glob()` results as cache key
- Store root document URIs in persistent cache

### Hotspot 5: Rule Execution (`runEngine`)

**Location**: `packages/engine/src/runner.ts`

**Current Cost**: O(rules * nodes) - dispatches visitors for every node.

**Impact**: Medium - affects lint time

**Optimization Strategy**:
- Early exit when rule requirements not met
- Batch visitor dispatches
- Cache rule filtering results
- Skip rules that don't apply to current context

**Expected Improvement**: 10-30% reduction in rule execution time

**Implementation Notes**:
- Cache `filterRulesByContext()` results per context
- Early return from visitors when possible
- Batch diagnostic collection
- Parallelize rule execution where safe

## Part 2: Incremental Update System

### 2.1 Graph Incremental Updates

**Goal**: Only rebuild graph edges for changed documents.

**Design**:
```typescript
interface IncrementalGraphUpdate {
  addedDocs: Map<string, ParsedDocument>;
  changedDocs: Map<string, ParsedDocument>;
  removedUris: string[];
}

function updateGraph(
  existingGraph: RefGraph,
  update: IncrementalGraphUpdate
): RefGraph {
  // Remove edges for removed documents
  // Update edges for changed documents
  // Add edges for new documents
  // Merge with existing graph
}
```

**Key Challenges**:
- Tracking which edges belong to which document
- Handling cascading updates (if A references B, and B changes, A's edges may need update)
- Maintaining graph consistency during partial updates

### 2.2 Index Incremental Updates

**Goal**: Only rebuild index sections for changed documents.

**Design**:
```typescript
function updateIndex(
  existingIndex: ProjectIndex,
  graph: RefGraph,
  changedUris: string[]
): ProjectIndex {
  // Remove index entries for changed documents
  // Rebuild index sections for changed documents
  // Merge with existing index
}
```

**Key Challenges**:
- Index entries may reference multiple documents
- Need to update cross-references when documents change
- Maintaining index consistency

### 2.3 Document Change Detection

**Strategy**: Use content hash to detect changes without full comparison.

**Implementation**:
- Store hash with each cached document
- Compare hashes before rebuilding
- Track which documents actually changed
- Only rebuild graph/index for changed documents

## Part 3: Caching Strategy

### 3.1 ProjectContextCache Enhancements

**Current**: Caches full `ProjectContext` by root URI.

**Enhancements**:
- Cache by root URI + document hash set
- Invalidate on file change events
- Support partial cache invalidation
- Cache graph and index separately

**Memory Management**:
- LRU eviction for old cache entries
- Maximum cache size limit
- Clear cache on workspace close

### 3.2 Workspace Discovery Cache

**New Cache**: Cache `discoverWorkspaceRoots()` results.

**Strategy**:
- Cache root URIs with file modification times
- Invalidate on file watcher events
- Use glob pattern as cache key
- Store in memory with TTL

### 3.3 Rule Filtering Cache

**New Cache**: Cache `filterRulesByContext()` results.

**Strategy**:
- Cache filtered rules per context signature
- Context signature = document types + sections present
- Invalidate when rules change
- Small memory footprint

## Part 4: Lazy Loading Strategy

### 4.1 Document Loading

**Current**: Loads all documents eagerly during context resolution.

**Optimization**: Load documents only when needed for linting.

**Strategy**:
- Load root document first
- Load referenced documents on-demand
- Skip loading if document type already known to be invalid
- Use `DocumentTypeCache` more aggressively

**Implementation**:
- Modify `buildProjectContextForRoot()` to load lazily
- Load documents when graph traversal encounters them
- Cache loaded documents in `DocumentTypeCache`

### 4.2 Index Lazy Evaluation

**Strategy**: Build index entries only when accessed.

**Implementation**:
- Use Proxy for index maps
- Build index entry on first access
- Cache built entries
- Pre-build commonly accessed entries (paths, operations)

## Part 5: Parallelization Opportunities

### 5.1 Document Loading

**Opportunity**: Load multiple documents in parallel.

**Implementation**:
- Use `Promise.all()` for independent document loads
- Limit concurrency to avoid overwhelming file system
- Batch loads by dependency level

### 5.2 Graph Building

**Opportunity**: Build graph edges in parallel per document.

**Implementation**:
- Process each document's AST traversal in parallel
- Merge results sequentially to maintain order
- Use worker threads for very large documents

### 5.3 Rule Execution

**Opportunity**: Execute independent rules in parallel.

**Implementation**:
- Identify rules with no shared state
- Execute in parallel batches
- Collect results sequentially
- Careful: Some rules may have side effects

## Part 6: Memory Optimization

### 6.1 Reduce Object Allocations

**Strategy**: Reuse objects where possible.

**Implementation**:
- Object pooling for frequently created objects
- Reuse AST nodes when possible
- Minimize intermediate arrays/maps

### 6.2 Weak References

**Strategy**: Use WeakMap/WeakSet for caches that shouldn't prevent GC.

**Implementation**:
- Use WeakMap for origin tracking in resolver
- Use WeakSet for visited nodes during traversal
- Allow GC of unused documents

### 6.3 Cache Size Limits

**Strategy**: Limit cache sizes to prevent memory bloat.

**Implementation**:
- LRU eviction for all caches
- Maximum entries per cache
- Clear caches on low memory

## Part 7: Benchmarking Strategy

### 7.1 LSP Benchmarking (Interactive Context)

#### Metrics to Track

**Latency Metrics**:
- Time to first diagnostic (TTFD) - from document open to first diagnostic
- Diagnostic update latency - from document change to updated diagnostics
- Context resolution time - time to resolve linting context
- Graph/index build time - time to build project context

**Throughput Metrics**:
- Documents validated per second
- Diagnostics generated per second
- Memory usage per document

**Interactive Metrics**:
- Editor responsiveness during typing
- CPU usage during validation
- Memory growth over time

#### Benchmark Scenarios

**Scenario 1: Small Project (1 root, 5 fragments)**
- Measure: TTFD, update latency, memory usage
- Expected: <100ms TTFD, <50ms update latency

**Scenario 2: Medium Project (3 roots, 20 fragments)**
- Measure: Context resolution, graph building, diagnostic generation
- Expected: <500ms TTFD, <200ms update latency

**Scenario 3: Large Project (10 roots, 100+ fragments)**
- Measure: Workspace discovery, incremental updates, memory
- Expected: <2s TTFD, <500ms update latency

**Scenario 4: Rapid Typing**
- Measure: Diagnostic update frequency, CPU usage, queue depth
- Expected: Batched updates, <100ms debounce

#### Benchmark Implementation

**Tool**: Create `packages/aperture/benchmarks/lsp-benchmark.ts`

**Methodology**:
1. Use `vscode-test` or headless LSP client
2. Measure time between LSP requests and responses
3. Track memory usage with `process.memoryUsage()`
4. Simulate typing with incremental document changes
5. Generate reports with percentiles (p50, p95, p99)

**Key Benchmarks**:
- `benchmark-ttfd.ts` - Time to first diagnostic
- `benchmark-incremental.ts` - Incremental update performance
- `benchmark-memory.ts` - Memory usage over time
- `benchmark-workspace.ts` - Workspace discovery performance

### 7.2 CLI Benchmarking (Static Codebase)

#### Metrics to Track

**Performance Metrics**:
- Total lint time
- Per-file lint time
- Cache hit rate (when using --cache)
- Memory usage

**Scalability Metrics**:
- Time vs number of files (linearity)
- Time vs project size (graph complexity)
- Memory vs project size

#### Benchmark Scenarios

**Scenario 1: Single File**
- Measure: Parse, graph build, lint time
- Baseline: <50ms total

**Scenario 2: Small Project (10 files)**
- Measure: Context resolution, caching effectiveness
- Baseline: <500ms total

**Scenario 3: Large Project (100+ files)**
- Measure: Scalability, memory usage
- Baseline: <10s total

**Scenario 4: With --cache flag**
- Measure: Cache hit rate, performance improvement
- Expected: 50-80% time reduction on repeated runs

#### Benchmark Implementation

**Tool**: Create `packages/cli/benchmarks/cli-benchmark.ts`

**Methodology**:
1. Use `performance.now()` for timing
2. Test with real OpenAPI projects of varying sizes
3. Compare with/without caching
4. Generate CSV reports for analysis

**Key Benchmarks**:
- `benchmark-lint-time.ts` - Total lint time
- `benchmark-cache.ts` - Cache effectiveness
- `benchmark-scalability.ts` - Performance vs project size

## Part 8: Implementation Priority

### Phase 1: High-Impact Quick Wins (Week 1-2)
1. Add `ProjectContextCache` to Volar server
2. Add workspace discovery caching
3. Reduce console.log usage (replace with configurable logger)
4. Implement lazy document loading

**Expected Impact**: 30-50% improvement in common scenarios

### Phase 2: Incremental Updates (Week 3-4)
1. Implement incremental graph updates
2. Implement incremental index updates
3. Add change detection via content hash
4. Test with real projects

**Expected Impact**: 50-80% improvement for incremental changes

### Phase 3: Advanced Optimizations (Week 5-6)
1. Parallelize document loading
2. Parallelize graph building
3. Optimize rule execution
4. Memory optimization

**Expected Impact**: 20-40% additional improvement

### Phase 4: Benchmarking Infrastructure (Week 7)
1. Create LSP benchmark suite
2. Create CLI benchmark suite
3. Set up CI benchmarking
4. Document performance baselines

## Part 9: Success Criteria

### LSP Performance Targets

- **TTFD**: <100ms for small projects, <500ms for medium, <2s for large
- **Update Latency**: <50ms for small, <200ms for medium, <500ms for large
- **Memory**: <100MB for small, <500MB for medium, <2GB for large
- **CPU**: <10% during idle, <50% during validation

### CLI Performance Targets

- **Lint Time**: <50ms single file, <500ms small project, <10s large project
- **Cache Hit Rate**: >70% on repeated runs
- **Memory**: <200MB for small, <1GB for large

### Measurement

- Benchmarks run on every PR
- Performance regression tests
- Regular performance reviews
- Documented performance baselines

## Part 10: Risks and Considerations

### Risk 1: Cache Invalidation Complexity

**Risk**: Complex cache invalidation logic may introduce bugs.

**Mitigation**: 
- Comprehensive test coverage
- Clear invalidation rules
- Logging for cache operations
- Fallback to full rebuild on errors

### Risk 2: Memory Growth

**Risk**: Caching may cause memory to grow unbounded.

**Mitigation**:
- LRU eviction policies
- Maximum cache sizes
- Memory monitoring
- Clear caches on workspace close

### Risk 3: Stale Data

**Risk**: Incremental updates may miss some changes.

**Mitigation**:
- Comprehensive change detection
- Fallback to full rebuild
- Validation of incremental updates
- Extensive testing

### Risk 4: Complexity Increase

**Risk**: Optimizations may make code harder to maintain.

**Mitigation**:
- Clear documentation
- Well-tested code
- Code reviews
- Performance vs maintainability trade-offs

## Part 11: Future Considerations

### Potential Optimizations (Not Yet Prioritized)

1. **Incremental Rule Execution**: Only re-run rules for changed sections
2. **Rule Result Caching**: Cache rule results per document version
3. **Distributed Processing**: Use workers for large projects
4. **Persistent Cache**: Save cache to disk for faster startup
5. **Smart Preloading**: Preload likely-to-be-needed documents
6. **Graph Compression**: Compress graph structure for memory savings

### Research Areas

1. **AST Caching**: Cache parsed ASTs across sessions
2. **Incremental Parsing**: Only re-parse changed sections
3. **Lazy Rule Loading**: Load rules on-demand
4. **Streaming Processing**: Process documents as they're loaded

## Notes

- All optimizations should maintain correctness - performance is secondary
- Measure before and after each optimization
- Document performance impact of each change
- Consider maintainability alongside performance
- User experience (responsiveness) is more important than raw throughput

