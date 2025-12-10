import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { z } from "zod/v4";

/**
 * Optional logger interface for schema loading operations.
 * If not provided, errors are logged to console.
 */
export interface SchemaLoaderLogger {
	log: (message: string) => void;
	warn: (message: string) => void;
	error: (message: string) => void;
}

/** Default console logger for standalone usage */
const defaultLogger: SchemaLoaderLogger = {
	log: (msg) => console.log(`[SchemaLoader] ${msg}`),
	warn: (msg) => console.warn(`[SchemaLoader] ${msg}`),
	error: (msg) => console.error(`[SchemaLoader] ${msg}`),
};

export interface SchemaResult {
	/** The JSON Schema (Zod schemas can be converted to JSON Schema) */
	jsonSchema: Record<string, unknown>;
	/** Optional Zod schema for additional type safety */
	zodSchema?: z.ZodType;
}

/**
 * Load a JSON file using fs.readFile instead of dynamic import.
 * This avoids the ERR_IMPORT_ATTRIBUTE_MISSING error in Node.js v22+.
 */
async function loadJsonFile(
	filePath: string,
	logger: SchemaLoaderLogger,
): Promise<Record<string, unknown> | undefined> {
	try {
		const content = await readFile(filePath, "utf-8");
		return JSON.parse(content) as Record<string, unknown>;
	} catch (error) {
		logger.error(
			`Failed to read JSON schema from ${filePath}: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		return undefined;
	}
}

/**
 * Dynamically import a TypeScript/JavaScript module.
 */
async function importModule(
	filePath: string,
	logger: SchemaLoaderLogger,
): Promise<unknown | undefined> {
	try {
		return await import(filePath);
	} catch (error) {
		logger.error(
			`Failed to import schema from ${filePath}: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		return undefined;
	}
}

/**
 * Load a schema from a file path.
 * Supports:
 * - .json: Standard JSON Schema files (loaded via fs.readFile)
 * - .ts/.js: Zod schema exports (loaded via dynamic import)
 *
 * @param filePath - Absolute path to the schema file
 * @param logger - Optional logger for loading operations (defaults to console)
 * @returns Promise resolving to the schema result (JSON schema + optional Zod schema)
 */
export async function loadSchema(
	filePath: string,
	logger: SchemaLoaderLogger = defaultLogger,
): Promise<SchemaResult | undefined> {
	const extension = extname(filePath).toLowerCase();
	logger.log(`Loading schema from ${filePath} (extension: ${extension})`);

	// Handle JSON files directly with fs.readFile to avoid import assertion issues
	if (extension === ".json") {
		const jsonSchema = await loadJsonFile(filePath, logger);
		if (!jsonSchema) {
			return undefined;
		}
		return { jsonSchema };
	}

	// Handle TypeScript/JavaScript files via dynamic import
	if (extension === ".ts" || extension === ".js" || extension === ".mjs") {
		const content = await importModule(filePath, logger);
		if (!content) {
			return undefined;
		}

		// Check if it's a default export with a schema
		if (
			typeof content === "object" &&
			content !== null &&
			"default" in content &&
			typeof content.default === "object" &&
			content.default !== null
		) {
			const defaultExport = content.default as Record<string, unknown>;
			// JSON Schema properties
			if (
				"type" in defaultExport ||
				"anyOf" in defaultExport ||
				"oneOf" in defaultExport ||
				"$ref" in defaultExport ||
				"$defs" in defaultExport
			) {
				return {
					jsonSchema: defaultExport,
				};
			}
			// Check if it's a Zod schema (has _def property)
			if ("_def" in defaultExport) {
				// Try to convert to JSON Schema using z.toJSONSchema if available
				try {
					const { z } = await import("zod/v4");
					const jsonSchema = z.toJSONSchema(defaultExport as z.ZodType) as Record<
						string,
						unknown
					>;
					return {
						jsonSchema,
						zodSchema: defaultExport as z.ZodType,
					};
				} catch {
					// If conversion fails, treat as raw schema
					return {
						jsonSchema: defaultExport,
					};
				}
			}
		}

		// Check if the entire content is a valid JSON Schema (named export or direct)
		if (
			typeof content === "object" &&
			content !== null &&
			("$schema" in content ||
				"type" in content ||
				"anyOf" in content ||
				"oneOf" in content)
		) {
			return {
				jsonSchema: content as Record<string, unknown>,
			};
		}

		logger.warn(
			`Schema from ${filePath} doesn't appear to be a valid JSON Schema or Zod schema`,
		);
		return undefined;
	}

	logger.warn(`Unsupported schema file extension: ${extension}`);
	return undefined;
}
