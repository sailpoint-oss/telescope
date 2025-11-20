import { buildLineOffsets, getLineCol } from "shared/line-offset-utils";
import type {
  Diagnostic,
  EngineRunOptions,
  EngineRunResult,
  FilePatch,
  ProjectContext,
  Rule,
  RuleContext,
  Visitors,
} from "../rules/types.js";

export function runEngine(
  project: ProjectContext,
  files: string[],
  options: EngineRunOptions
): EngineRunResult {
  // Debug logging removed - use logger.debug() if needed
  const diagnostics: Diagnostic[] = [];
  const fixes: FilePatch[] = [];
  const visitorSets = new Map<string, Visitors[]>();

  for (const fileUri of files) {
    // Create a context for each rule so we can pass the rule to report()
    const visitors = options.rules.map((rule) => {
      const ctx = createRuleContext(project, fileUri, diagnostics, fixes, rule);
      return rule.create(ctx);
    });
    visitorSets.set(fileUri, visitors);
  }

  for (const fileUri of files) {
    const visitors = visitorSets.get(fileUri);
    if (!visitors) {
      continue;
    }
    dispatch(visitors, "Document", {
      uri: fileUri,
      pointer: "",
      node: project.docs.get(fileUri)?.ast,
    });

    const fileIndex = project.index;
    for (const [, pathItemRefs] of fileIndex.pathsByString.entries()) {
      for (const ref of pathItemRefs) {
        if (ref.uri !== fileUri) continue;
        dispatch(visitors, "PathItem", ref);
        const ownerKey = `${ref.uri}#${ref.pointer}`;
        const ops = fileIndex.operationsByOwner.get(ownerKey) ?? [];
        for (const op of ops) {
          dispatch(visitors, "Operation", op);
        }
      }
    }
    for (const bucket of Object.values(fileIndex.components)) {
      for (const component of bucket.values()) {
        if (component.uri !== fileUri) continue;
        dispatch(visitors, "Component", component);
      }
    }

    // Dispatch Schema visitors for all schemas (components, fragments, inline)
    for (const schema of fileIndex.schemas.values()) {
      if (schema.uri !== fileUri) continue;
      dispatch(visitors, "Schema", schema);
    }

    // Dispatch Parameter visitors for all parameters (components, path-level, operation-level, fragments)
    for (const parameter of fileIndex.parameters.values()) {
      if (parameter.uri !== fileUri) continue;
      dispatch(visitors, "Parameter", parameter);
    }

    // Dispatch Response visitors for all responses (components, operation-level, fragments)
    for (const response of fileIndex.responses.values()) {
      if (response.uri !== fileUri) continue;
      dispatch(visitors, "Response", response);
    }

    // Dispatch RequestBody visitors for all request bodies (components, operation-level, fragments)
    for (const requestBody of fileIndex.requestBodies.values()) {
      if (requestBody.uri !== fileUri) continue;
      dispatch(visitors, "RequestBody", requestBody);
    }

    // Dispatch Header visitors for all headers (components, response-level, fragments)
    for (const header of fileIndex.headers.values()) {
      if (header.uri !== fileUri) continue;
      dispatch(visitors, "Header", header);
    }

    // Dispatch MediaType visitors for all media types (requestBody.content, response.content)
    for (const mediaType of fileIndex.mediaTypes.values()) {
      if (mediaType.uri !== fileUri) continue;
      dispatch(visitors, "MediaType", mediaType);
    }

    // Dispatch SecurityRequirement visitors for all security requirements (root, operation-level)
    for (const securityReq of fileIndex.securityRequirements.values()) {
      if (securityReq.uri !== fileUri) continue;
      dispatch(visitors, "SecurityRequirement", securityReq);
    }

    // Dispatch Example visitors for all examples (components, inline under media types, parameters, headers)
    for (const example of fileIndex.examples.values()) {
      if (example.uri !== fileUri) continue;
      dispatch(visitors, "Example", example);
    }

    // Dispatch Link visitors for all links (components, response-level)
    for (const link of fileIndex.links.values()) {
      if (link.uri !== fileUri) continue;
      dispatch(visitors, "Link", link);
    }

    // Dispatch Callback visitors for all callbacks (components, operation-level)
    for (const callback of fileIndex.callbacks.values()) {
      if (callback.uri !== fileUri) continue;
      dispatch(visitors, "Callback", callback);
    }

    // Dispatch Reference visitors for all $ref nodes throughout the document
    for (const reference of fileIndex.references.values()) {
      if (reference.uri !== fileUri) continue;
      dispatch(visitors, "Reference", reference);
    }
  }
  return { diagnostics, fixes };
}

export function createRuleContext(
  project: ProjectContext,
  fileUri: string,
  diagnostics: Diagnostic[],
  fixes: FilePatch[],
  rule?: Rule
): RuleContext {
  const document = project.docs.get(fileUri);
  if (!document) {
    throw new Error(`Document not found for ${fileUri}`);
  }

  // Build line offsets cache for offset-to-range conversion

  return {
    project,
    file: { uri: fileUri, document },
    report(diag) {
      // Use ruleId from diagnostic if provided, otherwise use rule.meta.id
      const ruleId = diag.ruleId ?? rule?.meta.id ?? "unknown";
      // Construct composite diagnostic code from rule number and id
      let compositeRuleId = ruleId;
      if (rule && rule.meta.number !== undefined) {
        compositeRuleId = `rule-${rule.meta.number}-${ruleId}`;
      }
      diagnostics.push({
        ...diag,
        ruleId: compositeRuleId,
      });
    },
    fix(patch) {
      if (Array.isArray(patch)) fixes.push(...patch);
      else fixes.push(patch);
    },
    getScopeContext(uri, pointer) {
      return project.index.scopeProvider?.(uri, pointer) ?? null;
    },
    locate(uri, pointer) {
      return project.docs.get(uri)?.sourceMap.pointerToRange(pointer) ?? null;
    },
    offsetToRange(uri, startOffset, endOffset) {
      const doc = project.docs.get(uri);
      if (!doc || !doc.rawText) return null;

      const lineOffsets = buildLineOffsets(doc.rawText);
      const end = endOffset ?? startOffset + 1;
      const startPos = getLineCol(startOffset, lineOffsets);
      const endPos = getLineCol(end, lineOffsets);

      return {
        start: { line: startPos.line - 1, character: startPos.col - 1 },
        end: { line: endPos.line - 1, character: endPos.col - 1 },
      };
    },
    findKeyRange(uri, parentPointer, keyName) {
      const doc = project.docs.get(uri);
      if (!doc || !doc.rawText) return null;

      // Get the value range for the key (pointer points to the value)
      const valuePointer = `${parentPointer}/${keyName}`;
      const valueRange = project.docs
        .get(uri)
        ?.sourceMap.pointerToRange(valuePointer);
      if (!valueRange) return null;

      // Get parent range to know where to search
      const parentRange = project.docs
        .get(uri)
        ?.sourceMap.pointerToRange(parentPointer);
      if (!parentRange) return null;

      const rawText = doc.rawText;
      const lineOffsets = buildLineOffsets(rawText);

      // Convert value range start to byte offset
      const valueStartLine = valueRange.start.line;
      const valueStartChar = valueRange.start.character;
      const valueStartOffset =
        (lineOffsets[valueStartLine] ?? 0) + valueStartChar;

      // Search backwards from value start to find the key name
      // Look for the key name followed by ":" or ": "
      const searchStart = Math.max(
        0,
        valueStartOffset - keyName.length - 10 // Search up to 10 chars back
      );
      const searchText = rawText.slice(searchStart, valueStartOffset);
      const keyPattern = new RegExp(
        `(${keyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\s*:`
      );
      const match = searchText.match(keyPattern);
      if (!match || !match.index) return null;

      const keyStartOffset = searchStart + match.index;
      const keyEndOffset = keyStartOffset + keyName.length;

      const startPos = getLineCol(keyStartOffset, lineOffsets);
      const endPos = getLineCol(keyEndOffset, lineOffsets);

      return {
        start: { line: startPos.line - 1, character: startPos.col - 1 },
        end: { line: endPos.line - 1, character: endPos.col - 1 },
      };
    },
    getRootDocuments(targetUri?: string, pointer?: string): string[] {
      const uri = targetUri ?? fileUri;
      const ptr = pointer ?? "#";
      return project.rootResolver.findRootsForNode(uri, ptr);
    },
    getPrimaryRoot(targetUri?: string, pointer?: string): string | null {
      const uri = targetUri ?? fileUri;
      const ptr = pointer ?? "#";
      return project.rootResolver.getPrimaryRoot(uri, ptr);
    },
  };
}

function dispatch(visitors: Visitors[], kind: keyof Visitors, payload: any) {
  for (const visitor of visitors) {
    const fn = visitor[kind];
    if (typeof fn === "function") {
      fn(payload as any);
    }
  }
}
