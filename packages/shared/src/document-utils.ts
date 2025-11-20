import { URI } from "vscode-uri";
import YAML from "yaml";
import { identifyDocumentType } from "./document-type-utils.js";

/**
 * Normalize a URI by removing hash and query parameters.
 * Returns the base URI for the document.
 */
export function normalizeBaseUri(uri: string): string {
  const s = uri.split("#")?.[0]?.split("?")?.[0];
  if (!s) {
    throw new Error(`Invalid URI: ${uri}`);
  }
  return s;
}

/**
 * Extract pathname from URI for file operations.
 */
function toPathname(uri: string): string | null {
  try {
    if (uri.startsWith("file://") || /^[a-zA-Z]+:\/\//.test(uri)) {
      return new URL(uri).pathname;
    }
  } catch {
    return uri;
  }
  return uri;
}

/**
 * Quick check to see if a file might be an OpenAPI document based on filename and content.
 * This is a fast heuristic check that doesn't require full parsing.
 */
export function mightBeOpenAPIDocument(uri: string, text: string): boolean {
  const path = toPathname(uri);
  if (!path) return true;

  const filename = path.toLowerCase();
  const knownNonOpenAPIFiles = [
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "tsconfig.json",
    "jsconfig.json",
    "biome.json",
    ".prettierrc.json",
    ".prettierrc.yaml",
    ".prettierrc.yml",
    ".eslintrc.json",
    ".eslintrc.yaml",
    ".eslintrc.yml",
  ];

  if (knownNonOpenAPIFiles.some((file) => filename.endsWith(file))) {
    return false;
  }

  // Exclude Telescope config file
  if (
    filename.includes("/.telescope/config.yaml") ||
    filename.endsWith(".telescope/config.yaml")
  ) {
    return false;
  }

  const lines = text.split("\n").slice(0, 10).join("\n");
  const hasOpenAPIIndicator =
    /"openapi":/i.test(lines) || /^openapi:/m.test(lines);

  if (/\.json$/i.test(path) && !hasOpenAPIIndicator) {
    if (/"name":|"version":|"dependencies":|"devDependencies":/i.test(lines)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a file is a valid OpenAPI or partial OpenAPI document by parsing and checking document type.
 * Returns true if the document type is not "unknown".
 */
export function isValidOpenApiFile(uri: string, text: string): boolean {
  // First do a quick heuristic check
  if (!mightBeOpenAPIDocument(uri, text)) {
    return false;
  }

  try {
    // Parse the document based on format
    let ast: unknown;
    const path = toPathname(uri);
    const isYaml = path && /\.ya?ml$/i.test(path);

    if (isYaml || /^\s*openapi:/m.test(text)) {
      // YAML format
      const document = YAML.parseDocument(text);
      if (document.errors.length > 0) {
        return false;
      }
      ast = document.toJSON();
    } else {
      // JSON format
      ast = JSON.parse(text);
    }

    // Check document type - skip "unknown" types
    const docType = identifyDocumentType(ast);
    return docType !== "unknown";
  } catch {
    // If parsing fails, it's not a valid OpenAPI document
    return false;
  }
}
