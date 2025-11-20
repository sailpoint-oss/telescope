import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { z } from "zod";
import { createJiti } from "jiti";

export interface SchemaResult {
	jsonSchema: Record<string, unknown>;
	zodSchema?: z.ZodType<unknown>;
}

/**
 * Load a schema from a file path.
 * Supports .json (standard JSON Schema) and .ts (Zod schema export).
 *
 * @param filePath - Absolute path to the schema file
 * @returns Promise resolving to the schema result (JSON schema + optional Zod schema)
 */
export async function loadSchema(filePath: string): Promise<SchemaResult | null> {
	try {
		if (filePath.endsWith(".json")) {
			const content = readFileSync(filePath, "utf-8");
			return {
				jsonSchema: JSON.parse(content),
			};
		}

		if (filePath.endsWith(".ts") || filePath.endsWith(".js")) {
			// Use jiti to load the module, handling TS compilation seamlessly
			const jiti = createJiti(filePath);
			const module = await jiti.import(filePath) as { default?: unknown };
			
			const schema = module.default;

			if (!schema || typeof schema !== "object") {
				console.warn(
					`[SchemaLoader] No default export found in ${filePath} or export is not an object`,
				);
				return null;
			}

			// Verify it looks like a Zod schema (has safeParse method)
			if (!("safeParse" in schema)) {
				console.warn(
					`[SchemaLoader] Default export in ${filePath} does not look like a Zod schema`,
				);
				return null;
			}

			const zodSchema = schema as z.ZodType<unknown>;

			// Generate JSON Schema from Zod schema
			const jsonSchema = zodToJsonSchema(zodSchema, {
				name: "telescope-generated-schema",
			});

			return {
				jsonSchema: jsonSchema as Record<string, unknown>,
				zodSchema,
			};
		}

		console.warn(`[SchemaLoader] Unsupported file extension: ${filePath}`);
		return null;
	} catch (error) {
		console.error(
			`[SchemaLoader] Failed to load schema from ${filePath}:`,
			error,
		);
		return null;
	}
}

