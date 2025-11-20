import { extname } from "node:path";
import type {
  IScriptSnapshot,
  LanguagePlugin,
  VirtualCode,
} from "@volar/language-core";
import { isValidOpenApiFile } from "shared/document-utils";
import type { URI } from "vscode-uri";
import type { ApertureVolarContext, DiagnosticsLogger } from "../workspace/context.js";
import type { Core } from "../core/core.js";
import type { OpenAPIDocumentStore } from "../workspace/documents.js";

export interface OpenApiVirtualCode extends VirtualCode {
  readonly sourceUri: string;
}

export function createOpenAPILanguagePlugin(
  store: OpenAPIDocumentStore,
  core: Core,
  context: ApertureVolarContext,
  logger?: DiagnosticsLogger
): LanguagePlugin<URI, OpenApiVirtualCode> {
  const warn = logger?.warn
    ? (message: string) => logger.warn?.(message)
    : undefined;
  return {
    getLanguageId(scriptId) {
      const uri = scriptId.toString();

      // First check if file has JSON or YAML extension
      const fileExtension = extname(uri).toLowerCase();
      let inferredLangId: "yaml" | "json" | "openapi";
      switch (fileExtension) {
        case ".yaml":
        case ".yml":
          inferredLangId = "yaml";
          break;
        case ".json":
          inferredLangId = "json";
          break;
        default:
          logger?.log?.(
            `[Language Plugin] getLanguageId(${uri}) = undefined (not JSON/YAML/OpenAPI)`
          );
          return undefined;
      }

      logger?.log?.(
        `[Language Plugin] getLanguageId(${uri}) = ${inferredLangId}`
      );

      // Check if file matches OpenAPI patterns from configuration
      const matchesOpenApiPatterns = context.shouldProcessFile(uri);

      if (matchesOpenApiPatterns) {
        // File matches OpenAPI patterns, return "openapi" language ID
        logger?.log?.(
          `[Language Plugin] getLanguageId(${uri}) = openapi (matches OpenAPI patterns)`
        );
        return "openapi";
      } else {
        // File doesn't match patterns, return inferred language ID for standard language services
        logger?.log?.(
          `[Language Plugin] getLanguageId(${uri}) = ${inferredLangId} (does not match OpenAPI patterns)`
        );
        return inferredLangId;
      }
    },
    createVirtualCode(scriptId, languageId, snapshot) {
      const uri = scriptId.toString();
      logger?.log?.(
        `[Language Plugin] createVirtualCode(${uri}, ${languageId})`
      );

      // If language ID is not "openapi", return minimal virtual code for standard language services
      if (languageId !== "openapi") {
        logger?.log?.(
          `[Language Plugin] Returning minimal virtual code for ${uri} - languageId is ${languageId}, not "openapi"`
        );
        return toVirtualCode(uri, languageId, snapshot, warn, logger);
      }

      // Get text from snapshot to check if it's a valid OpenAPI document
      const text = snapshot.getText(0, snapshot.getLength());

      // Check if this is a valid OpenAPI or partial OpenAPI document
      if (!isValidOpenApiFile(uri, text)) {
        logger?.log?.(
          `[Language Plugin] Skipping ${uri} - not a valid OpenAPI document`
        );
        // Return a minimal virtual code that won't be processed
        // This allows Volar to handle the file but we won't lint it
        return toVirtualCode(uri, languageId, snapshot, warn, logger);
      }

      const record = store.updateFromSnapshot(uri, languageId, snapshot);
      // Update Core when virtual code is created
      // Core.updateDocument will automatically track root documents
      core.updateDocument(uri, record.text, record.languageId, record.version);
      const virtualCode = toVirtualCode(
        uri,
        record.languageId,
        record.snapshot,
        warn,
        logger
      );
      logger?.log?.(
        `[Language Plugin] Virtual code created - id: ${
          virtualCode.id
        }, languageId: ${virtualCode.languageId}, mappings count: ${
          virtualCode.mappings.length
        }, first mapping data: ${JSON.stringify(virtualCode.mappings[0]?.data)}`
      );
      return virtualCode;
    },
    updateVirtualCode(scriptId, virtualCode, snapshot) {
      const uri = scriptId.toString();

      // If language ID is not "openapi", return updated virtual code for standard language services
      if (virtualCode.languageId !== "openapi") {
        logger?.log?.(
          `[Language Plugin] Updating minimal virtual code for ${uri} - languageId is ${virtualCode.languageId}, not "openapi"`
        );
        const record = store.updateFromSnapshot(
          uri,
          virtualCode.languageId,
          snapshot
        );
        return {
          ...virtualCode,
          snapshot: record.snapshot,
          languageId: record.languageId,
        };
      }

      // Get text from snapshot to check if it's a valid OpenAPI document
      const text = snapshot.getText(0, snapshot.getLength());

      // Check if this is a valid OpenAPI or partial OpenAPI document
      if (!isValidOpenApiFile(uri, text)) {
        logger?.log?.(
          `[Language Plugin] Skipping update for ${uri} - not a valid OpenAPI document`
        );
        // If it was previously tracked, remove it from core
        core.removeDocument(uri);
        // Return updated virtual code without processing
        const record = store.updateFromSnapshot(
          uri,
          virtualCode.languageId,
          snapshot
        );
        return {
          ...virtualCode,
          snapshot: record.snapshot,
          languageId: record.languageId,
        };
      }

      const record = store.updateFromSnapshot(
        uri,
        virtualCode.languageId,
        snapshot
      );
      // Update Core when virtual code is updated
      // Core.updateDocument will automatically track root documents
      core.updateDocument(uri, record.text, record.languageId, record.version);
      return {
        ...virtualCode,
        snapshot: record.snapshot,
        languageId: record.languageId,
      };
    },
    disposeVirtualCode(scriptId) {
      const uri = scriptId.toString();
      store.delete(uri);
      // Remove from Core when virtual code is disposed
      // Core.removeDocument will automatically remove from root tracking
      core.removeDocument(uri);
    },
  };
}

let warnedInvalidEmbeddedId = false;

function normalizeEmbeddedId(
  id: string,
  warn?: (message: string) => void
): string {
  const cleaned = id.replace(/#.*/u, "").toLowerCase();
  if (!warnedInvalidEmbeddedId && (id.includes("#") || id !== cleaned)) {
    warn?.(`Normalized embedded content id from "${id}" to "${cleaned}"`);
    warnedInvalidEmbeddedId = true;
  }
  return cleaned;
}

function toVirtualCode(
  uri: string,
  languageId: string,
  snapshot: IScriptSnapshot,
  _warn?: (message: string) => void,
  _logger?: DiagnosticsLogger
): OpenApiVirtualCode {
  const id = normalizeEmbeddedId("openapi", _warn);
  const length = snapshot.getLength();
  // Create a mapping that covers the entire document to enable diagnostics
  // Since we're not transforming the code, source and generated are the same
  const mappings = [
    {
      sourceOffsets: [0],
      generatedOffsets: [0],
      lengths: [length],
      data: {
        verification: true,
        definition: true,
      },
    },
  ];

  return {
    id,
    languageId,
    snapshot,
    mappings,
    sourceUri: uri,
  };
}
