# Cache Performance Analysis

## Current Cache Limits (After Expansion)

1. **DocumentTypeCache**: 500 entries
2. **Core.irCache**: 500 entries  
3. **ProjectContextCache**: 50 entries (unchanged - most expensive)

## What Happens When Cache Limits Are Exceeded

### LRU (Least Recently Used) Eviction Strategy

All caches use LRU eviction:
- When cache is full and a new entry needs to be added
- The **least recently accessed** entry is evicted
- The new entry is added and marked as "most recently used"

### DocumentTypeCache (500 limit)

**What it caches per entry:**
- Document type (`openapi-root`, `openapi-partial`, `schema`, `parameter`, etc.)
- Parsed document AST (when `getDocument()` is called)
- Root document tracking

**When evicted and re-accessed:**
1. **Cache hit (fast)**: Returns cached type immediately (~0ms)
2. **Cache miss (slow)**: 
   - Must call `loadDocument()` which:
     - Reads file from filesystem (~1-10ms)
     - Parses YAML/JSON (~5-50ms depending on size)
     - Builds AST (~10-100ms for large files)
     - Identifies document type (~1ms)
   - Total: **~20-160ms per evicted document**

**Impact of exceeding 500 files:**
- Files accessed frequently stay in cache (good)
- Files accessed rarely get evicted and must be reloaded (acceptable)
- **Performance degradation**: Linear with number of evictions
- **Memory saved**: ~500KB-5MB per evicted document (depending on size)

### Core.irCache (500 limit)

**What it caches per entry:**
- IR document (complete intermediate representation)
- Atom index (operations, schemas, parameters, etc.)
- Line offsets array (for position conversion)
- Document version

**When evicted and re-accessed:**
1. **Cache hit (fast)**: Returns cached IR immediately (~0ms)
2. **Cache miss (slow)**:
   - Must call `updateDocument()` which:
     - Parses JSON/YAML (~5-50ms)
     - Builds IR from AST (~20-200ms for large files)
     - Extracts atoms (~10-100ms)
     - Updates graph index (~5-50ms)
     - Updates operation ID index (~5-50ms)
     - Builds line offsets (~5-20ms)
   - Total: **~50-470ms per evicted document**

**Impact of exceeding 500 files:**
- Active/open files stay in cache (excellent)
- Closed files get evicted (acceptable)
- **Performance degradation**: Significant for frequently accessed evicted files
- **Memory saved**: ~1-10MB per evicted document (IR + indexes are large)

## Performance Implications of Caching Everything

### Ideal Scenario: Cache Everything

**Benefits:**
- ✅ **Zero re-parsing**: All documents ready instantly
- ✅ **Consistent performance**: No cache misses
- ✅ **Faster rule execution**: All documents pre-loaded
- ✅ **Better user experience**: No delays when switching files

**Costs:**
- ❌ **Memory usage**: 
  - DocumentTypeCache: ~500KB-5MB per document × 1000 files = **500MB-5GB**
  - IR Cache: ~1-10MB per document × 1000 files = **1-10GB**
  - Total: **1.5-15GB** for 1000 files
- ❌ **Startup time**: Must parse all files upfront
- ❌ **Memory pressure**: Can cause GC pauses, swap usage

### Realistic Scenario: LRU with 500 Limit

**Benefits:**
- ✅ **Reasonable memory**: ~500MB-5GB for 500 most active files
- ✅ **Fast access**: Frequently used files stay cached
- ✅ **Graceful degradation**: Rarely used files evicted

**Costs:**
- ⚠️ **Cache misses**: ~20-470ms penalty when evicted file accessed
- ⚠️ **Thrashing risk**: If working with >500 files actively, constant eviction/reload

## Recommendations

### For Workspaces with <500 Files
- **Current limits are perfect**: Everything stays cached
- **No performance impact**: Zero cache misses

### For Workspaces with 500-1000 Files
- **Current limits are good**: Most active files stay cached
- **Acceptable performance**: Occasional cache misses for rarely accessed files
- **Consider**: Monitor cache hit rates, increase if needed

### For Workspaces with >1000 Files
- **Options:**
  1. **Increase limits** (e.g., 1000-2000): Better performance, more memory
  2. **Keep current limits**: Accept occasional cache misses
  3. **Make configurable**: Let users choose based on their workspace size

### Performance Monitoring

Consider adding metrics to track:
- Cache hit/miss rates
- Average cache miss penalty
- Memory usage per cache
- Eviction frequency

This would help identify if limits need adjustment.

## Memory Estimates

### Per-Document Memory Usage

**DocumentTypeCache entry:**
- Type string: ~50 bytes
- ParsedDocument (if loaded): ~500KB-5MB (depends on file size)
- **Average**: ~1MB per entry

**IR Cache entry:**
- IR document: ~1-5MB (depends on file size)
- Atom index: ~100KB-1MB
- Line offsets: ~10-100KB
- **Average**: ~2-6MB per entry

**ProjectContextCache entry:**
- Full project graph: ~10-100MB (depends on project size)
- **Average**: ~20-50MB per entry

### Total Memory at Limits

- DocumentTypeCache (500): ~500MB-2.5GB
- IR Cache (500): ~1GB-3GB  
- ProjectContextCache (50): ~1GB-2.5GB
- **Total**: ~2.5GB-8GB (reasonable for modern development machines)

## Conclusion

The expanded limits (500 for DocumentTypeCache and IR Cache) provide a good balance:
- **Most workspaces** (<500 files): Everything cached, optimal performance
- **Large workspaces** (500-1000 files): Most active files cached, acceptable performance
- **Very large workspaces** (>1000 files): Consider making limits configurable

The LRU eviction strategy ensures that **frequently accessed files stay cached**, which is exactly what you want for optimal performance during rule execution.

