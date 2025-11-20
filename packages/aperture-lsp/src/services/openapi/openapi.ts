/**
 * OpenAPI Service Plugin - provides diagnostics, code actions, definitions, etc.
 * This is the main service plugin for OpenAPI support in Volar.
 */

import { createHash } from "node:crypto";
// import type { IScriptSnapshot } from "@volar/language-core";
import type {
  CancellationToken,
  LanguageServiceContext,
  LanguageServicePlugin,
} from "@volar/language-service";
import {
  ComponentsSchema,
  ExampleSchema,
  OpenAPISchema,
  OperationSchema,
  ParameterSchema,
  PathItemSchema,
  ResponseSchema,
  SchemaObjectSchema,
  SecuritySchemeSchema,
} from "blueprint";
import {
  type AtomIndex,
  findNodeByPointer,
  getValueAtPointerIR,
  type IRDocument,
  type IRNode,
  type IRProjectContext,
  runEngineIR,
} from "lens";
import type { DocumentType } from "shared/document-type-utils";
import { isValidOpenApiFile, normalizeBaseUri } from "shared/document-utils";
import { globFiles, readFileWithMetadata } from "shared/file-system-utils";
import {
  getLanguageService,
  type LanguageService,
} from "vscode-json-languageservice";
// discoverWorkspaceRoots removed - using file watcher-based root tracking instead
import type {
  Diagnostic,
  LocationLink,
  Range,
  WorkspaceDocumentDiagnosticReport,
} from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import YAML from "yaml";
import type * as z from "zod";
import type { ApertureVolarContext } from "../../workspace/context.js";
import { isConfigFile } from "../config/config.js";

// Schema mapping from document types to Zod schemas
// @ts-expect-error - TS is saying this type definition is possibly infinite, I don't think thats accurate, could be a Zod cyclical definition quirk
const DOCUMENT_TYPE_TO_SCHEMA = new Map<DocumentType, z.ZodType>([
  ["openapi-root", OpenAPISchema],
  ["path-item", PathItemSchema],
  ["operation", OperationSchema],
  ["components", ComponentsSchema],
  ["parameter", ParameterSchema],
  ["response", ResponseSchema],
  ["components", ComponentsSchema],
  ["security-scheme", SecuritySchemeSchema],
  ["example", ExampleSchema],
  ["schema", SchemaObjectSchema],
]);

// Cache for converted JSON Schemas
const jsonSchemaCache = new Map<
  DocumentType | `${DocumentType}-${string}`,
  unknown
>();

// // JSON Language Service instance (shared, configured per document)
// let jsonLanguageService: LanguageService | undefined;

// function getJsonLanguageService(): LanguageService {
//   if (!jsonLanguageService) {
//     jsonLanguageService = getLanguageService({});
//   }
//   return jsonLanguageService;
// }

// /**
//  * Get or create JSON Schema for a document type.
//  * Caches converted schemas to avoid repeated conversion.
//  */
// function getJsonSchemaForDocumentType(
//   documentType: DocumentType,
//   version?: string
// ): unknown {
//   const cacheKey: DocumentType | `${DocumentType}-${string}` = version
//     ? `${documentType}-${version}`
//     : documentType;

//   // Check cache first
//   const cached = jsonSchemaCache.get(cacheKey);
//   if (cached) {
//     return cached;
//   }

//   // Get Zod schema based on document type
//   let zodSchema: z.ZodTypeAny;
//   if (documentType === "openapi-root") {
//     zodSchema = OpenAPISchema;
//   } else {
//     const foundSchema = DOCUMENT_TYPE_TO_SCHEMA.get(documentType);
//     if (!foundSchema) {
//       // Unknown type - return null to skip schema validation
//       return null;
//     }
//     zodSchema = foundSchema;
//   }

//   // Convert Zod schema to JSON Schema
//   try {
//     const jsonSchema = z.toJSONSchema(zodSchema, {
//       target: "openapi-3.0",
//     });
//     jsonSchemaCache.set(cacheKey, jsonSchema);
//     return jsonSchema;
//   } catch (error) {
//     // If conversion fails, log and return null
//     console.error(
//       `Failed to convert Zod schema to JSON Schema for ${documentType}: ${
//         error instanceof Error ? error.message : String(error)
//       }`
//     );
//     return null;
//   }
// }

// /**
//  * Extract OpenAPI version from AST.
//  * Returns major.minor version (e.g., "3.0", "3.1", "3.2") or undefined.
//  */
// function extractOpenApiVersion(ast: unknown): string | undefined {
//   if (!ast || typeof ast !== "object") {
//     return undefined;
//   }
//   const data = ast as Record<string, unknown>;
//   const openapi = data.openapi;
//   if (typeof openapi === "string") {
//     if (openapi.startsWith("3.2")) return "3.2";
//     if (openapi.startsWith("3.1")) return "3.1";
//     if (openapi.startsWith("3.0")) return "3.0";
//   }
//   return undefined;
// }

// /**
//  * Create a simple script snapshot from text.
//  * This mimics Volar's snapshot creation for unopened files.
//  */
// function createSnapshotFromText(text: string): IScriptSnapshot {
//   return {
//     getText(start: number, end: number): string {
//       return text.substring(start, end);
//     },
//     getLength(): number {
//       return text.length;
//     },
//     getChangeRange(): undefined {
//       return undefined;
//     },
//   };
// }

// /**
//  * Convert position to byte offset in document text.
//  */
// function positionToOffset(
//   text: string,
//   position: { line: number; character: number }
// ): number {
//   const lines = text.split("\n");
//   let offset = 0;
//   for (let i = 0; i < position.line && i < lines.length; i++) {
//     const line = lines[i];
//     if (line !== undefined) {
//       offset += line.length + 1; // +1 for newline
//     }
//   }
//   const line = lines[position.line];
//   if (line !== undefined) {
//     offset += Math.min(position.character, line.length);
//   }
//   return offset;
// }

// /**
//  * Find IR node at a specific byte offset by traversing the IR tree.
//  */
// function findNodeAtOffset(node: IRNode, offset: number): IRNode | null {
//   const loc = node.loc;
//   const start = loc.start ?? 0;
//   const end = loc.end ?? loc.valEnd ?? start;

//   // Check if offset is within this node's range
//   if (offset >= start && offset <= end) {
//     // Check children first (more specific)
//     if (node.children && Array.isArray(node.children)) {
//       for (const child of node.children) {
//         const found = findNodeAtOffset(child, offset);
//         if (found) {
//           return found;
//         }
//       }
//     }
//     // This node contains the offset
//     return node;
//   }

//   return null;
// }

// /**
//  * Find the $ref node (or its parent) at a specific position.
//  * Returns the node containing the $ref property and the ref value.
//  */
// function findRefNodeAtPosition(
//   ir: IRDocument | null,
//   text: string,
//   position: { line: number; character: number }
// ): { node: IRNode; ref: string } | null {
//   if (!ir || !ir.root) {
//     return null;
//   }

//   const offset = positionToOffset(text, position);
//   const node = findNodeAtOffset(ir.root, offset);
//   if (!node) {
//     return null;
//   }

//   // Check if this node is a $ref value (string child of an object with $ref key)
//   if (
//     node.kind === "string" &&
//     node.key === "$ref" &&
//     typeof node.value === "string"
//   ) {
//     return { node, ref: node.value };
//   }

//   // Check if this node's parent is a $ref object
//   // We need to traverse up to find the parent - for now, check if this node is within a $ref object
//   // by checking if any ancestor has a $ref child
//   function findRefInAncestors(
//     current: IRNode,
//     targetOffset: number
//   ): { node: IRNode; ref: string } | null {
//     // Check if current node has a $ref child
//     if (current.kind === "object" && current.children) {
//       const refChild = current.children.find((child) => child.key === "$ref");
//       if (
//         refChild &&
//         refChild.kind === "string" &&
//         typeof refChild.value === "string"
//       ) {
//         const refLoc = refChild.loc;
//         const refStart = refLoc.start ?? 0;
//         const refEnd = refLoc.end ?? refLoc.valEnd ?? refStart;
//         // Check if target offset is within the $ref value range
//         if (targetOffset >= refStart && targetOffset <= refEnd) {
//           return { node: refChild, ref: refChild.value };
//         }
//       }
//     }

//     // Recurse into children
//     if (current.children) {
//       for (const child of current.children) {
//         const childLoc = child.loc;
//         const childStart = childLoc.start ?? 0;
//         const childEnd = childLoc.end ?? childLoc.valEnd ?? childStart;
//         if (targetOffset >= childStart && targetOffset <= childEnd) {
//           const found = findRefInAncestors(child, targetOffset);
//           if (found) {
//             return found;
//           }
//         }
//       }
//     }

//     return null;
//   }

//   return findRefInAncestors(ir.root, offset);
// }

// /**
//  * Ensure a document is loaded in Core and document store.
//  *
//  * Simplified flow that relies on Volar's document lifecycle:
//  * 1. Check if already loaded in Core (fast path)
//  * 2. Try to trigger Volar's language plugin via project system
//  * 3. Fallback to manual loading if needed
//  *
//  * Returns true if document was successfully loaded, false otherwise.
//  */
// async function ensureDocumentLoaded(
//   uri: string,
//   shared: ApertureVolarContext,
//   core: typeof shared.core,
//   context: LanguageServiceContext,
//   token?: CancellationToken
// ): Promise<boolean> {
//   // Check cancellation at start
//   if (token?.isCancellationRequested) {
//     return false;
//   }

//   // Fast path: Already loaded in Core
//   if (core.getIR(uri) && core.getAtoms(uri)) {
//     return true;
//   }

//   // Early check: Skip non-OpenAPI files
//   if (!isOpenApiFile(uri)) {
//     return false;
//   }

//   // Try to access through Volar's project system to trigger language plugin
//   // The language plugin's createVirtualCode will update Core automatically
//   try {
//     if (token?.isCancellationRequested) {
//       return false;
//     }
//     const uriObj = URI.parse(uri);
//     const language = context.language as unknown as {
//       scripts?: Map<URI, { snapshot: IScriptSnapshot; languageId: string }>;
//     };
//     const virtualCode = language.scripts?.get(uriObj);

//     if (virtualCode) {
//       // Virtual code exists - language plugin was triggered and updated Core
//       // Just verify it's loaded (should always be true at this point)
//       return !!(core.getIR(uri) && core.getAtoms(uri));
//     }
//   } catch {
//     // If accessing through project system fails, fall through to manual loading
//   }

//   // Fallback: Manual load via Volar's fileSystem
//   try {
//     if (token?.isCancellationRequested) {
//       return false;
//     }
//     const readResult = await readFileWithMetadata(shared.getFileSystem(), uri);
//     if (!readResult) {
//       return false;
//     }
//     if (token?.isCancellationRequested) {
//       return false;
//     }

//     // Check if this is a valid OpenAPI document before loading
//     if (!isValidOpenApiFile(uri, readResult.text)) {
//       shared
//         .getLogger()
//         .log(
//           `[OpenAPI Workspace Diagnostics] Skipping ${uri} - not a valid OpenAPI document`
//         );
//       return false;
//     }

//     const snapshot = createSnapshotFromText(readResult.text);
//     const documentRecord = shared.documents.updateFromSnapshot(
//       uri,
//       languageId,
//       snapshot
//     );

//     if (!token?.isCancellationRequested) {
//       core.updateDocument(
//         uri,
//         documentRecord.text,
//         documentRecord.languageId,
//         documentRecord.version,
//         token
//       );
//     }

//     return core.getIR(uri) !== undefined && core.getAtoms(uri) !== undefined;
//   } catch (error) {
//     shared
//       .getLogger()
//       .error(
//         `[OpenAPI Service Workspace Diagnostics] Failed to load ${uri}: ${
//           error instanceof Error ? error.message : String(error)
//         }`
//       );
//     return false;
//   }
// }

/**
 * Create the OpenAPI service plugin.
 */
export function createOpenAPIServicePlugin(
  shared: ApertureVolarContext
): LanguageServicePlugin {
  const logger = shared.getLogger();
  const core = shared.core; // Use shared Core instance

  logger.log(`[OpenAPI Service] Creating OpenAPI service plugin`);

  return {
    name: "telescope-openapi-service",
    capabilities: {
      diagnosticProvider: {
        interFileDependencies: false,
        workspaceDiagnostics: true,
      },
      codeActionProvider: {
        resolveProvider: true,
      },
      definitionProvider: true,
      documentLinkProvider: {
        resolveProvider: true,
      },
    },
    create(context) {
      return {
        async provideDefinition(document, position, token) {
          if (token?.isCancellationRequested) {
            return null;
          }

          // Filter by OpenAPI language ID, this is set in the language plugin and acts as a filter of sorts for this service
          if (document.languageId !== "openapi") {
            return null;
          }

          // Handle embedded/virtual document URIs
          const documentUri = URI.parse(document.uri);
          const decoded = context.decodeEmbeddedDocumentUri(documentUri);
          const sourceUri = decoded ? decoded[0].toString() : document.uri;

          // Get IR from Core
          const ir = core.getIR(sourceUri);
          if (!ir) {
            return null;
          }

          // const text = document.getText();

          logger.log(
            `[OpenAPI Service] provideDefinition called for: ${sourceUri}`
          );
          return null;

          // // Find $ref node at position using IR
          // const refInfo = findRefNodeAtPosition(ir, text, position);
          // if (!refInfo) {
          //   return null;
          // }

          // const { node: refNode, ref } = refInfo;

          // // Get GraphIndex to find the ref edge
          // const graphIndex = core.getGraphIndex();
          // // Use getRefEdgesFrom to get RefEdge objects with ref property
          // const edges = graphIndex.getRefEdgesFrom(sourceUri, refNode.ptr);

          // // Find the edge that matches this ref value
          // const edge = edges.find((e) => e.ref === ref);
          // if (!edge) {
          //   return null;
          // }

          // // Get target document IR
          // const targetIr = core.getIR(edge.toUri);
          // if (!targetIr) {
          //   return null;
          // }

          // // Find target node by pointer
          // const targetNode = findNodeByPointer(targetIr, edge.toPtr);
          // if (!targetNode) {
          //   return null;
          // }

          // // Convert target node location to range
          // const targetRange = core.locToRange(edge.toUri, targetNode.loc);
          // if (!targetRange) {
          //   return null;
          // }

          // // Get origin selection range (the $ref value)
          // const originRange = core.locToRange(sourceUri, refNode.loc);
          // if (!originRange) {
          //   return null;
          // }

          // // Return LocationLink array (Volar's expected format)
          // return [
          //   {
          //     targetUri: edge.toUri,
          //     targetRange,
          //     originSelectionRange: originRange,
          //   },
          // ] as LocationLink[];
        },
        async provideDiagnostics(document, token) {
          if (token?.isCancellationRequested) {
            return null;
          }

          logger.log(
            `[OpenAPI Document Diagnostics] provideDiagnostics called for: ${document.uri}`
          );

          // // Debounce for large documents (with cancellation support)
          // const text = document.getText();

          // Check cancellation before async operations
          if (token?.isCancellationRequested) {
            return null;
          }

          try {
            // Get source document URI using Volar's context API
            const documentUri = URI.parse(document.uri);
            const decoded = context.decodeEmbeddedDocumentUri(documentUri);
            const sourceUri = decoded ? decoded[0].toString() : document.uri;
            const baseUri = normalizeBaseUri(sourceUri);

            // Explicitly exclude config files by path (hardcoded .telescope/config.yaml)
            // This check is path-based only - no content parsing needed
            if (isConfigFile(baseUri)) {
              logger.log(
                `[OpenAPI Service] Skipping ${baseUri} - config file (handled by Additional Validation service)`
              );
              return [];
            }

            // Get IR from Core (should already be cached via language plugin lifecycle)
            const ir = core.getIR(baseUri);
            const atoms = core.getAtoms(baseUri);
            if (!ir || !atoms) {
              logger.log(
                `[OpenAPI Service] No IR found for ${baseUri}, skipping diagnostics`
              );
              return [];
            }

            // Check cancellation before async operations
            if (token?.isCancellationRequested) {
              return [];
            }

            return null;

            // // Schema validation using document type detection
            // const schemaDiagnostics: Diagnostic[] = [];
            // try {
            //   // Get document type using existing document cache
            //   const documentType = await shared.documentCache.getDocumentType(
            //     baseUri,
            //     shared.getFileSystem()
            //   );

            //   // Skip schema validation for unknown types
            //   if (documentType !== "unknown") {
            //     // Determine version for root documents
            //     let version: string | undefined;
            //     if (documentType === "openapi-root") {
            //       // Extract AST from IR to get version
            //       const ast = getValueAtPointerIR(ir, "#");
            //       version = extractOpenApiVersion(ast);
            //     }

            //     // Get JSON Schema for this document type
            //     const jsonSchema = getJsonSchemaForDocumentType(
            //       documentType,
            //       version
            //     );

            //     if (jsonSchema) {
            //       // Configure JSON LS with schema for this document
            //       const jsonLS = getJsonLanguageService();
            //       jsonLS.configure({
            //         schemas: [
            //           {
            //             uri: `telescope-schema-${documentType}-${
            //               version ?? ""
            //             }`,
            //             fileMatch: [baseUri],
            //             schema: jsonSchema as Record<string, unknown>,
            //           },
            //         ],
            //         validate: true,
            //         allowComments: true,
            //       });

            //       // Convert document to JSON format for validation
            //       const documentText = document.getText();
            //       let jsonText: string;
            //       if (document.languageId === "yaml") {
            //         // For YAML, we need to convert to JSON for JSON LS validation
            //         // Note: This is a limitation - we should ideally use yaml-language-server
            //         // For now, parse YAML and stringify as JSON
            //         try {
            //           const parsed = YAML.parse(documentText);
            //           jsonText = JSON.stringify(parsed, null, 2);
            //         } catch {
            //           // If YAML parsing fails, skip schema validation
            //           jsonText = "";
            //         }
            //       } else {
            //         jsonText = documentText;
            //       }

            //       if (jsonText) {
            //         // Create text document for JSON LS
            //         const textDocument = {
            //           uri: document.uri,
            //           languageId: "json",
            //           version: document.version,
            //           getText: () => jsonText,
            //           positionAt: (offset: number) =>
            //             document.positionAt(offset),
            //           offsetAt: (position: {
            //             line: number;
            //             character: number;
            //           }) => document.offsetAt(position),
            //           lineCount: jsonText.split("\n").length,
            //         };

            //         const jsonDocument = jsonLS.parseJSONDocument(textDocument);
            //         const jsonLsDiagnostics = await jsonLS.doValidation(
            //           textDocument,
            //           jsonDocument,
            //           {}
            //         );

            //         // Convert to LSP format
            //         const diagnosticsArray = Array.isArray(jsonLsDiagnostics)
            //           ? jsonLsDiagnostics
            //           : [];
            //         for (const diag of diagnosticsArray) {
            //           schemaDiagnostics.push({
            //             ...diag,
            //             source: "telescope-openapi-schema",
            //           });
            //         }
            //       }
            //     }
            //   }
            // } catch (error) {
            //   // Log but don't fail - schema validation is supplementary
            //   logger.log?.(
            //     `[OpenAPI Service] Schema validation failed for ${baseUri}: ${
            //       error instanceof Error ? error.message : String(error)
            //     }`
            //   );
            // }

            // // Check cancellation before async operations
            // if (token?.isCancellationRequested) {
            //   return [];
            // }

            // // Get rules (includes custom OpenAPI rules)
            // const rules = shared.getRuleImplementations();
            // if (rules.length === 0) {
            //   logger.log(`[OpenAPI Service] WARNING: No rules loaded!`);
            //   return [];
            // }

            // // Filter rules to only OpenAPI rules (ruleType === "openapi" or undefined for builtin)
            // const openApiRules = rules.filter(
            //   (rule) => !rule.meta.ruleType || rule.meta.ruleType === "openapi"
            // );

            // // Check cancellation before processing linked URIs
            // if (token?.isCancellationRequested) {
            //   return [];
            // }

            // // Get linked URIs for cross-file rules
            // const linkedUris = core.getLinkedUris(baseUri) ?? [];
            // const irDocs = new Map<string, IRDocument>();
            // const irAtoms = new Map<string, AtomIndex>();

            // // Collect IR documents for current file and linked files
            // irDocs.set(baseUri, ir);
            // irAtoms.set(baseUri, atoms);

            // for (const linkedUri of linkedUris) {
            //   if (token?.isCancellationRequested) {
            //     return [];
            //   }
            //   if (!linkedUri) {
            //     continue;
            //   }
            //   const linkedIr = core.getIR(linkedUri);
            //   const linkedAtoms = core.getAtoms(linkedUri);
            //   if (linkedIr && linkedAtoms) {
            //     irDocs.set(linkedUri, linkedIr);
            //     irAtoms.set(linkedUri, linkedAtoms);
            //   }
            // }

            // // Check cancellation before rule execution
            // if (token?.isCancellationRequested) {
            //   return [];
            // }

            // // Create IR project context
            // const irProject: IRProjectContext = {
            //   docs: irDocs,
            //   atoms: irAtoms,
            //   graph: core.getGraphIndex(),
            //   core: {
            //     locToRange: (uri: string, loc) => core.locToRange(uri, loc),
            //     getLinkedUris: (uri: string) => core.getLinkedUris(uri),
            //   },
            // };

            // // Run rules using IR-based execution
            // const result = runEngineIR(
            //   irProject,
            //   [baseUri],
            //   { rules: openApiRules },
            //   token
            // );

            // // Check cancellation after rule execution
            // if (token?.isCancellationRequested) {
            //   return [];
            // }

            // // Convert to LSP format - guard against undefined diagnostics
            // const diagnostics = result?.diagnostics ?? [];
            // const lspDiagnostics = diagnostics;
            // // .filter((d) => d != null)
            // // .map(toLspDiagnostic)
            // // .filter((d) => d != null);

            // // Combine schema diagnostics with rule diagnostics
            // const allDiagnostics = [...schemaDiagnostics, ...lspDiagnostics];

            // logger.log(
            //   `[OpenAPI Service] Returning ${allDiagnostics.length} diagnostic(s) (${schemaDiagnostics.length} schema, ${lspDiagnostics.length} rule) for ${document.uri}`
            // );

            // return allDiagnostics;
          } catch (error) {
            const message =
              error instanceof Error
                ? error.stack ?? error.message
                : String(error);
            logger.error(
              `[OpenAPI Service] Failed to lint ${document.uri}: ${message}`
            );
            return [];
          }
        },

        async provideWorkspaceDiagnostics(
          token: CancellationToken,
          previousResultIds?: Map<string, string>
        ) {
          if (token?.isCancellationRequested) {
            return null;
          }

          // Get affected URIs from Core (already computed on document changes)
          const affectedUris = core.getAffectedUris();

          // Always discover workspace roots and merge with affected URIs
          // This ensures newly added files are detected even when no files are affected
          const result = await provideWorkspaceDiagnostics(
            shared,
            context,
            token,
            core,
            affectedUris,
            previousResultIds
          );
          return result;
        },

        provideDocumentLinks(document) {
          // Use Core IR and GraphIndex to find all $ref links
          const documentUri = URI.parse(document.uri);
          const decoded = context.decodeEmbeddedDocumentUri(documentUri);
          const sourceUri = decoded ? decoded[0].toString() : document.uri;

          // Get IR from Core
          const ir = core.getIR(sourceUri);
          if (!ir) {
            return [];
          }

          const links: Array<{ range: Range; target: string }> = [];

          // Find all $ref nodes in IR
          function collectRefNodes(node: IRNode): void {
            // Check if this node is a $ref value
            if (
              node.kind === "string" &&
              node.key === "$ref" &&
              typeof node.value === "string"
            ) {
              const ref = node.value;
              // Only include external refs (http/https)
              if (/^https?:/i.test(ref)) {
                const range = core.locToRange(sourceUri, node.loc);
                if (range) {
                  links.push({
                    range,
                    target: ref,
                  });
                }
              }
            }

            // Recurse into children
            if (node.children) {
              for (const child of node.children) {
                collectRefNodes(child);
              }
            }
          }

          collectRefNodes(ir.root);

          return links;
        },

        onDidChangeWatchedFiles({
          changes,
        }: {
          changes: Array<{ uri: string; type?: number }>;
        }) {
          for (const change of changes) {
            const uri = change.uri;
            const changeType = change.type; // 1 = created, 2 = changed, 3 = deleted

            // Explicitly exclude config files by path
            if (isConfigFile(uri)) {
              continue;
            }

            // Check include/exclude patterns (skip for deletions - always clean up)
            if (changeType !== 3 && !shared.shouldProcessFile(uri)) {
              logger.log?.(
                `[File Watcher] Skipping ${uri} - excluded by config patterns`
              );
              // Clean up if it was previously tracked
              shared.documents.delete(uri);
              core.removeDocument(uri);
              shared.removeRootDocument(uri);
              continue;
            }

            if (changeType === 3) {
              // File deleted - always clean up
              shared.documents.delete(uri);
              core.removeDocument(uri);
              shared.removeRootDocument(uri);
              shared.markAffected(uri);
            } else {
              // File created or changed - check content before processing
              try {
                // Try to read the file to check if it's a valid OpenAPI document
                const readResult = readFileWithMetadata(
                  shared.getFileSystem(),
                  uri
                );
                readResult
                  .then((result) => {
                    if (!result) {
                      return;
                    }
                    if (isValidOpenApiFile(uri, result.text)) {
                      // Valid OpenAPI file - process it
                      shared.documents.delete(uri);
                      core.removeDocument(uri);
                      shared.markAffected(uri);
                    } else {
                      // Not a valid OpenAPI file - clean up if it was previously tracked
                      logger.log(
                        `[File Watcher] Skipping ${uri} - not a valid OpenAPI document`
                      );
                      shared.documents.delete(uri);
                      core.removeDocument(uri);
                      shared.removeRootDocument(uri);
                    }
                  })
                  .catch((error) => {
                    // If we can't read the file, log and skip
                    logger.log(
                      `[File Watcher] Could not read ${uri}: ${
                        error instanceof Error ? error.message : String(error)
                      }`
                    );
                  });
              } catch (error) {
                // If reading fails synchronously, skip this file
                logger.log(
                  `[File Watcher] Error checking ${uri}: ${
                    error instanceof Error ? error.message : String(error)
                  }`
                );
              }
            }
          }
        },
      };
    },
  };
}

async function provideWorkspaceDiagnostics(
  shared: ApertureVolarContext,
  context: LanguageServiceContext,
  token: CancellationToken,
  core: typeof shared.core,
  affectedUris: string[],
  previousResultIds?: Map<string, string>
): Promise<WorkspaceDocumentDiagnosticReport[] | null> {
  const logger = shared.getLogger();

  if (token.isCancellationRequested) {
    return null;
  }

  logger.log(
    `[OpenAPI Service Workspace Diagnostics] provideWorkspaceDiagnostics called`
  );

  try {
    // On first run, discover all OpenAPI files in workspace
    const discoveredUris: string[] = [];
    if (!shared.hasInitialScanBeenPerformed()) {
      logger.log(
        `[OpenAPI Service Workspace Diagnostics] Performing initial workspace scan...`
      );
      try {
        const workspaceFolders = shared.getWorkspaceFolders();
        if (workspaceFolders.length > 0) {
          // Use globFiles() to discover all OpenAPI files
          // Note: Exclusion patterns are handled in walkDirectoryForExtension
          const globPatterns = ["**/*.yaml", "**/*.yml", "**/*.json"];
          const workspaceFolderUris = workspaceFolders.map((uri) =>
            URI.parse(uri)
          );
          const allFiles = await globFiles(
            shared.getFileSystem(),
            globPatterns,
            workspaceFolderUris
          );

          logger.log(
            `[OpenAPI Service Workspace Diagnostics] Found ${allFiles.length} potential OpenAPI files, validating...`
          );

          // Filter to valid OpenAPI files with better error handling
          let validatedCount = 0;
          let skippedCount = 0;
          for (const uri of allFiles) {
            if (token.isCancellationRequested) {
              break;
            }

            // Explicitly exclude config files by path (before any content checks)
            if (isConfigFile(uri)) {
              skippedCount++;
              continue;
            }

            // Check include/exclude patterns
            if (!shared.shouldProcessFile(uri)) {
              skippedCount++;
              continue;
            }

            try {
              const readResult = await readFileWithMetadata(
                shared.getFileSystem(),
                uri
              );
              if (!readResult) {
                skippedCount++;
                continue;
              }
              if (isValidOpenApiFile(uri, readResult.text)) {
                discoveredUris.push(uri);
                validatedCount++;
              } else {
                skippedCount++;
              }
            } catch {
              // Skip files we can't read
              skippedCount++;
            }
          }
          logger.log(
            `[OpenAPI Service Workspace Diagnostics] Initial scan complete: ${validatedCount} valid OpenAPI file(s), ${skippedCount} skipped`
          );
        }
        shared.markInitialScanPerformed();
      } catch (error) {
        logger.error(
          `[OpenAPI Service Workspace Diagnostics] Initial scan failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // Use cached root documents from file watcher tracking
    // Merge with affected URIs and discovered URIs (union - no duplicates)
    const cachedRoots = shared.getRootDocumentUris();
    const urisToProcessSet = new Set<string>([
      ...affectedUris,
      ...cachedRoots,
      ...discoveredUris,
    ]);

    // Filter URIs to only include valid OpenAPI files
    // Check each URI to ensure it's a valid OpenAPI document before processing
    const filteredUris: string[] = [];
    for (const uri of urisToProcessSet) {
      // For discovered URIs, we already validated them, so skip re-validation
      if (discoveredUris.includes(uri)) {
        filteredUris.push(uri);
        continue;
      }

      // Try to check if it's a valid OpenAPI document
      // If we can't verify (e.g., file doesn't exist), skip it
      try {
        const readResult = await readFileWithMetadata(
          shared.getFileSystem(),
          uri
        );
        if (!readResult) {
          continue;
        }
        if (isValidOpenApiFile(uri, readResult.text)) {
          filteredUris.push(uri);
        } else {
          logger.log(
            `[OpenAPI Service Workspace Diagnostics] Skipping ${uri} - not a valid OpenAPI document`
          );
        }
      } catch (error) {
        // If we can't read the file, skip it
        logger.log(
          `[OpenAPI Service Workspace Diagnostics] Could not verify ${uri}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    const urisToProcess = filteredUris;

    if (urisToProcess.length === 0) {
      // No files to process - return unchanged reports for previousResultIds if they exist
      if (previousResultIds && previousResultIds.size > 0) {
        const unchangedReports: WorkspaceDocumentDiagnosticReport[] = [];
        for (const [uri, resultId] of previousResultIds) {
          const version = shared.documents.get(uri)?.version ?? null;
          unchangedReports.push({
            kind: "unchanged",
            uri,
            version,
            resultId,
          });
        }
        return unchangedReports;
      }
      return [];
    }

    // Get rules once
    const rules = shared.getRuleImplementations();
    if (rules.length === 0) {
      logger.log(
        `[OpenAPI Service Workspace Diagnostics] WARNING: No rules loaded!`
      );
      return [];
    }

    const allDiagnostics = new Map<string, Diagnostic[]>();

    logger.log(
      `[OpenAPI Service Workspace Diagnostics] Processing ${urisToProcess.length} file(s) in batches`
    );

    return null;

    // // Process in batches
    // const batchSize = 10;
    // let processedCount = 0;
    // let skippedCount = 0;
    // for (let i = 0; i < urisToProcess.length; i += batchSize) {
    //   if (token.isCancellationRequested) {
    //     break;
    //   }

    //   const batch = urisToProcess.slice(i, i + batchSize);
    //   for (const uri of batch) {
    //     if (token.isCancellationRequested) {
    //       break;
    //     }

    //     try {
    //       // Ensure document is loaded through Volar's data flow
    //       // This tries to access through Volar's project system first (triggers language plugin),
    //       // then falls back to manual loading if needed
    //       const loaded = await ensureDocumentLoaded(
    //         uri,
    //         shared,
    //         core,
    //         context,
    //         token
    //       );
    //       if (!loaded) {
    //         skippedCount++;
    //         logger.log(
    //           `[OpenAPI Service Workspace Diagnostics] Skipping ${uri} - failed to load`
    //         );
    //         continue;
    //       }

    //       // Get IR and atoms from Core (should be available now)
    //       const ir = core.getIR(uri);
    //       const atoms = core.getAtoms(uri);
    //       if (!ir || !atoms) {
    //         skippedCount++;
    //         logger.log(
    //           `[OpenAPI Service Workspace Diagnostics] Skipping ${uri} - IR/atoms not available after load`
    //         );
    //         continue;
    //       }

    //       // Build IR project context
    //       const irDocs = new Map<string, IRDocument>();
    //       const irAtoms = new Map<string, AtomIndex>();
    //       irDocs.set(uri, ir);
    //       irAtoms.set(uri, atoms);

    //       // Check cancellation before processing linked URIs
    //       if (token.isCancellationRequested) {
    //         break;
    //       }

    //       // Get linked URIs for cross-file rules
    //       const linkedUris = core.getLinkedUris(uri);
    //       for (const linkedUri of linkedUris) {
    //         if (token.isCancellationRequested) {
    //           break;
    //         }
    //         const linkedIr = core.getIR(linkedUri);
    //         const linkedAtoms = core.getAtoms(linkedUri);
    //         if (linkedIr && linkedAtoms) {
    //           irDocs.set(linkedUri, linkedIr);
    //           irAtoms.set(linkedUri, linkedAtoms);
    //         }
    //       }

    //       // Check cancellation before rule execution
    //       if (token.isCancellationRequested) {
    //         break;
    //       }

    //       const irProject: IRProjectContext = {
    //         docs: irDocs,
    //         atoms: irAtoms,
    //         graph: core.getGraphIndex(),
    //         core: {
    //           locToRange: (u: string, loc) => core.locToRange(u, loc),
    //           getLinkedUris: (u: string) => core.getLinkedUris(u),
    //         },
    //       };

    //       // Run rules using IR-based execution
    //       const result = runEngineIR(irProject, [uri], { rules }, token);

    //       const normalizedUri = normalizeBaseUri(uri);
    //       const diagnostics = result?.diagnostics ?? [];
    //       const lspDiagnostics = diagnostics.filter(
    //         (d) => d != null && normalizeBaseUri(d.uri) === normalizedUri
    //       );
    //       // .map(toLspDiagnostic)
    //       // .filter((d) => d != null);

    //       const existingDiagnostics = allDiagnostics.get(normalizedUri);
    //       if (existingDiagnostics) {
    //         existingDiagnostics.push(...lspDiagnostics);
    //       } else {
    //         allDiagnostics.set(normalizedUri, lspDiagnostics);
    //       }

    //       processedCount++;
    //     } catch (error) {
    //       skippedCount++;
    //       logger.error(
    //         `[OpenAPI Service Workspace Diagnostics] Failed for ${uri}: ${
    //           error instanceof Error ? error.message : String(error)
    //         }`
    //       );
    //     }
    //   }
    // }

    // // Build reports with resultId support (delta pattern)
    // const reports: WorkspaceDocumentDiagnosticReport[] = [];
    // const processedUris = new Set<string>(allDiagnostics.keys());

    // // Process URIs that were actually checked
    // for (const uri of processedUris) {
    //   const diagnostics = allDiagnostics.get(uri) ?? [];
    //   // Get version from document store (Volar-managed)
    //   const version = shared.documents.get(uri)?.version ?? null;
    //   const hash = computeDiagnosticsHash(diagnostics, version);

    //   // Check if diagnostics are unchanged by comparing with previous resultId
    //   const previousResultId = previousResultIds?.get(uri);
    //   const currentResultId = core.getResultId(uri, hash);

    //   if (previousResultId && previousResultId === currentResultId) {
    //     // Diagnostics unchanged - return unchanged report
    //     reports.push({
    //       kind: "unchanged",
    //       uri,
    //       version,
    //       resultId: currentResultId,
    //     });
    //   } else {
    //     // Diagnostics changed or new - return full report
    //     reports.push({
    //       kind: "full",
    //       uri,
    //       version,
    //       resultId: currentResultId,
    //       items: diagnostics,
    //     });
    //   }
    // }

    // // For URIs in previousResultIds that weren't processed, check if they should be marked unchanged
    // // This handles files that were previously checked but weren't affected or discovered this time
    // if (previousResultIds) {
    //   for (const [uri, resultId] of previousResultIds) {
    //     // Skip if already processed (included above)
    //     if (processedUris.has(uri)) {
    //       continue;
    //     }

    //     // If URI is in discovered roots or affected URIs, it should have been processed
    //     // If not, it means it wasn't affected and wasn't in discovered roots
    //     // In this case, return unchanged (file still exists, just not changed)
    //     // Note: If file was deleted, Volar's file watcher should have marked it as affected
    //     if (!urisToProcess.includes(uri)) {
    //       const version = shared.documents.get(uri)?.version ?? null;
    //       reports.push({
    //         kind: "unchanged",
    //         uri,
    //         version,
    //         resultId,
    //       });
    //     }
    //   }
    // }

    // const duration = Date.now() - startTime;
    // logger.log(
    //   `[OpenAPI Service Workspace Diagnostics] Completed in ${duration}ms: ${processedCount} processed, ${skippedCount} skipped, ${reports.length} report(s)`
    // );

    // return reports;
  } catch (error) {
    logger.error(
      `[OpenAPI Service Workspace Diagnostics] Failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return [];
  }
}

function computeDiagnosticsHash(
  diagnostics: Diagnostic[],
  version: number | null
): string {
  const sortedDiagnostics = diagnostics.slice().sort((a, b) => {
    const startLineDiff = a.range.start.line - b.range.start.line;
    if (startLineDiff !== 0) return startLineDiff;
    const startCharDiff = a.range.start.character - b.range.start.character;
    if (startCharDiff !== 0) return startCharDiff;
    const endLineDiff = a.range.end.line - b.range.end.line;
    if (endLineDiff !== 0) return endLineDiff;
    const endCharDiff = a.range.end.character - b.range.end.character;
    if (endCharDiff !== 0) return endCharDiff;
    const severityDiff = (a.severity ?? 0) - (b.severity ?? 0);
    if (severityDiff !== 0) return severityDiff;
    const codeA = a.code === undefined ? "" : String(a.code);
    const codeB = b.code === undefined ? "" : String(b.code);
    const codeDiff = codeA.localeCompare(codeB);
    if (codeDiff !== 0) return codeDiff;
    return a.message.localeCompare(b.message);
  });

  const payload = {
    version,
    diagnostics: sortedDiagnostics.map((diag) => ({
      range: diag.range,
      severity: diag.severity,
      code: diag.code,
      source: diag.source,
      message: diag.message,
      tags: diag.tags,
      relatedInformation: diag.relatedInformation,
    })),
  };
  return createHash("sha1").update(JSON.stringify(payload)).digest("hex");
}
