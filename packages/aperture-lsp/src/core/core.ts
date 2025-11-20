/**
 * Core - central coordinator for IR, indexes, and diagnostics.
 * This is the heart of the Volar-first architecture.
 */

import type { CancellationToken } from "@volar/language-service";
import { parseTree } from "jsonc-parser";
import type { AtomIndex, IRDocument, Loc } from "lens";
import {
  buildIRFromJson,
  buildIRFromYaml,
  extractAtoms,
  GraphIndex,
  getValueAtPointerIR,
  isRootDocument,
  OperationIdIndex,
} from "lens";
import { mightBeOpenAPIDocument } from "shared/document-utils";
import { computeDocumentHash } from "shared/hash-utils";
import { buildLineOffsets, getLineCol } from "shared/line-offset-utils";
import type { Range } from "vscode-languageserver-protocol";
import YAML from "yaml";
import type { ApertureVolarContext } from "../workspace/context.js";

/**
 * Per-document cache entry.
 */
interface DocumentCacheEntry {
  ir: IRDocument;
  atoms: AtomIndex;
  version: number | null;
  lineOffsets: number[] | null; // Cached line offsets for offset-to-range conversion
}

/**
 * Core instance managing IR, indexes, and affected URIs.
 * Uses LRU eviction to limit memory usage.
 */
export class Core {
  private readonly irCache = new Map<string, DocumentCacheEntry>();
  private readonly graphIndex = new GraphIndex();
  private readonly opIdIndex = new OperationIdIndex();
  private readonly affectedUris = new Set<string>();
  private readonly resultIdCache = new Map<string, string>();
  private readonly maxCacheSize: number;
  private readonly accessOrder: string[] = []; // Track access order for LRU

  constructor(
    private readonly context: ApertureVolarContext,
    maxCacheSize: number = 500
  ) {
    this.maxCacheSize = maxCacheSize;
  }

  /**
   * Update Core with document text (called on open/change).
   */
  updateDocument(
    uri: string,
    text: string,
    languageId: string,
    version: number | null,
    token?: CancellationToken
  ): void {
    if (token?.isCancellationRequested) {
      return;
    }

    // Early validation: skip non-OpenAPI files before parsing
    if (!mightBeOpenAPIDocument(uri, text)) {
      this.context
        .getLogger()
        .log(`[Core] Skipping ${uri} - not an OpenAPI document`);
      // Remove from cache if it was previously tracked
      if (this.irCache.has(uri)) {
        this.removeDocument(uri);
      }
      return;
    }

    const startTime = Date.now();
    try {
      // Parse based on format
      let ir: IRDocument;
      const hash = computeDocumentHash(text);
      const mtimeMs = Date.now();

      if (languageId === "json") {
        const errors: Array<{ error: number; offset: number; length: number }> =
          [];
        const ast = JSON.parse(text);
        const tree = parseTree(text, errors);
        const version = this.detectVersion(ast);
        ir = buildIRFromJson(
          uri,
          ast,
          tree ?? null,
          text,
          hash,
          mtimeMs,
          version
        );
      } else {
        // YAML
        const lineCounter = new YAML.LineCounter();
        const document = YAML.parseDocument(text, { lineCounter });
        if (document.errors.length) {
          throw new Error(`YAML parse error: ${document.errors[0]?.message}`);
        }
        const version = this.detectVersion(document.toJSON());
        ir = buildIRFromYaml(uri, document, text, hash, mtimeMs, version);
      }

      const parseTime = Date.now() - startTime;

      // Extract atoms
      const atomStartTime = Date.now();
      const atoms = extractAtoms(ir);
      const atomTime = Date.now() - atomStartTime;

      // Update graph index
      const graphStartTime = Date.now();
      this.graphIndex.updateFromIR(uri, ir.root);
      const graphTime = Date.now() - graphStartTime;

      // Update semantic indexes
      const semanticStartTime = Date.now();
      const changedOpIds = this.opIdIndex.updateForUri(uri, atoms.operations);
      const semanticTime = Date.now() - semanticStartTime;

      // Build and cache line offsets
      const irText = ir.rawText ?? "";
      const lineOffsets = buildLineOffsets(irText);

      // Evict least recently used if cache is full
      this.evictIrCacheIfNeeded();

      // Cache entry
      this.irCache.set(uri, { ir, atoms, version, lineOffsets });
      this.updateIrCacheAccessOrder(uri);

      // Notify context if this is a root document (for file watcher tracking)
      if (this.context && isRootDocument(getValueAtPointerIR(ir, "#"))) {
        this.context.addRootDocument(uri);
      }

      // Compute affected URIs
      this.computeAffectedUris(uri, changedOpIds);

      // Clear resultId cache for this URI
      this.resultIdCache.delete(uri);

      const totalTime = Date.now() - startTime;
      if (totalTime > 50) {
        // Log slow operations
        this.context
          .getLogger()
          .log(
            `[Core] Updated ${uri} in ${totalTime}ms (parse: ${parseTime}ms, atoms: ${atomTime}ms, graph: ${graphTime}ms, semantic: ${semanticTime}ms)`
          );
      }
    } catch (error) {
      // Log but don't throw - graceful degradation
      this.context
        .getLogger()
        .error(
          `[Core] Failed to update document ${uri}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
    }
  }

  /**
   * Batch update multiple documents efficiently.
   * Useful for workspace operations where multiple files change at once.
   */
  batchUpdateDocuments(
    updates: Array<{
      uri: string;
      text: string;
      languageId: string;
      version: number | null;
    }>,
    token?: CancellationToken
  ): void {
    if (token?.isCancellationRequested) {
      return;
    }

    // Process updates in sequence to maintain consistency
    // Could be parallelized in the future if needed
    for (const update of updates) {
      if (token?.isCancellationRequested) {
        break;
      }
      this.updateDocument(
        update.uri,
        update.text,
        update.languageId,
        update.version,
        token
      );
    }
  }

  /**
   * Get IR for a URI.
   */
  getIR(uri: string): IRDocument | undefined {
    const entry = this.irCache.get(uri);
    if (entry) {
      this.updateIrCacheAccessOrder(uri);
    }
    return entry?.ir;
  }

  /**
   * Get atoms for a URI.
   */
  getAtoms(uri: string): AtomIndex | undefined {
    const entry = this.irCache.get(uri);
    if (entry) {
      this.updateIrCacheAccessOrder(uri);
    }
    return entry?.atoms;
  }

  /**
   * Get graph index.
   */
  getGraphIndex(): GraphIndex {
    return this.graphIndex;
  }

  /**
   * Get operation ID index.
   */
  getOpIdIndex(): OperationIdIndex {
    return this.opIdIndex;
  }

  /**
   * Get affected URIs and clear the set.
   */
  getAffectedUris(): string[] {
    const uris = Array.from(this.affectedUris);
    this.affectedUris.clear();
    return uris;
  }

  /**
   * Mark URIs as affected.
   */
  markAffected(...uris: string[]): void {
    for (const uri of uris) {
      this.affectedUris.add(uri);
    }
  }

  /**
   * Get or compute resultId for diagnostics.
   * ResultId is stable for unchanged diagnostics (same hash + version).
   * This enables Volar's delta diagnostics to work correctly.
   */
  getResultId(uri: string, diagnosticsHash: string): string {
    // Get document version from cache entry
    const entry = this.irCache.get(uri);
    const version = entry?.version ?? null;

    // Combine version + hash for stable resultId
    // If version is null, use hash only (for documents not in cache)
    const resultIdKey =
      version !== null ? `${version}:${diagnosticsHash}` : diagnosticsHash;

    const cached = this.resultIdCache.get(uri);
    if (cached === resultIdKey) {
      return cached;
    }

    // Store and return new resultId
    this.resultIdCache.set(uri, resultIdKey);
    return resultIdKey;
  }

  /**
   * Get all URIs linked to the given URI (dependencies and dependents).
   * Useful for cross-file rule checks.
   */
  getLinkedUris(uri: string): string[] {
    if (!uri) {
      return [];
    }
    try {
      const deps = this.graphIndex.dependenciesOf(uri) ?? [];
      const rdeps = this.graphIndex.dependentsOfUri(uri) ?? [];
      return Array.from(new Set([...deps, ...rdeps])).filter((u) => u != null);
    } catch (_error) {
      // Graph index might not be initialized, return empty array
      return [];
    }
  }

  /**
   * Convert IR Loc (byte offsets) to LSP Range (line/character).
   * Uses the cached rawText from the IR document.
   */
  locToRange(uri: string, loc: Loc): Range | null {
    if (!uri || !loc) {
      return null;
    }
    const entry = this.irCache.get(uri);
    if (!entry || !entry.ir) {
      return null;
    }

    // Use cached line offsets if available, otherwise build them
    let lineOffsets = entry.lineOffsets;
    if (!lineOffsets) {
      const text = entry.ir.rawText;
      if (!text) {
        return null;
      }
      lineOffsets = buildLineOffsets(text);
      // Cache for next time
      entry.lineOffsets = lineOffsets;
    }

    if (!lineOffsets || lineOffsets.length === 0) {
      return null;
    }

    const startPos = getLineCol(loc.start ?? 0, lineOffsets);
    const endPos = getLineCol(loc.end ?? loc.start ?? 0, lineOffsets);

    if (!startPos || !endPos) {
      return null;
    }

    return {
      start: {
        line: Math.max(0, startPos.line - 1),
        character: Math.max(0, startPos.col - 1),
      },
      end: {
        line: Math.max(0, endPos.line - 1),
        character: Math.max(0, endPos.col - 1),
      },
    };
  }

  /**
   * Remove document from cache (on close).
   */
  removeDocument(uri: string): void {
    this.irCache.delete(uri);
    // Remove from access order
    const index = this.accessOrder.indexOf(uri);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
    this.graphIndex.removeEdgesForUri(uri);
    this.opIdIndex.updateForUri(uri, []); // Remove all operations for this URI
    this.resultIdCache.delete(uri);
    // Remove from root document tracking
    if (this.context) {
      this.context.removeRootDocument(uri);
    }
  }

  /**
   * Check if a document is a root OpenAPI document using its IR.
   */
  isRootDocument(uri: string): boolean {
    const ir = this.getIR(uri);
    if (!ir) {
      return false;
    }
    // Get the root AST value from IR
    const rootValue = getValueAtPointerIR(ir, "#");
    return isRootDocument(rootValue);
  }

  /**
   * Clear all caches.
   */
  clear(): void {
    this.irCache.clear();
    this.graphIndex.removeEdgesForUri(""); // Clear all
    this.opIdIndex.updateForUri("", []); // Clear all
    this.affectedUris.clear();
    this.resultIdCache.clear();
  }

  private computeAffectedUris(uri: string, changedOpIds: Set<string>): void {
    // This document is affected
    this.affectedUris.add(uri);

    // Dependents are affected
    const dependents = this.graphIndex.dependentsOfUri(uri);
    for (const dep of dependents) {
      this.affectedUris.add(dep);
    }

    // URIs with changed operationIds are affected
    for (const opId of changedOpIds) {
      const occurrences = this.opIdIndex.getOccurrences(opId);
      for (const occ of occurrences) {
        this.affectedUris.add(occ.uri);
      }
    }
  }

  /**
   * Update access order for LRU eviction.
   */
  private updateIrCacheAccessOrder(uri: string): void {
    const index = this.accessOrder.indexOf(uri);
    if (index !== -1) {
      // Move to end (most recently used)
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(uri);
  }

  /**
   * Evict least recently used entry if cache is full.
   */
  private evictIrCacheIfNeeded(): void {
    if (this.irCache.size >= this.maxCacheSize && this.accessOrder.length > 0) {
      const lruUri = this.accessOrder[0];
      if (lruUri) {
        this.irCache.delete(lruUri);
        this.accessOrder.shift();
      }
    }
  }

  private detectVersion(ast: unknown): string {
    if (!ast || typeof ast !== "object") return "unknown";
    const data = ast as Record<string, unknown>;
    const openapi = data.openapi;
    if (typeof openapi === "string") {
      if (openapi.startsWith("3.2")) return "3.2";
      if (openapi.startsWith("3.1")) return "3.1";
      if (openapi.startsWith("3.0")) return "3.0";
    }
    return "unknown";
  }
}
