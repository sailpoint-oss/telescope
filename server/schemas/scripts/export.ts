/**
 * Export Zod schemas as JSON Schema files.
 *
 * Usage: npx tsx scripts/export.ts
 *
 * Reads the Zod schema definitions from src/ and produces
 * JSON Schema (draft-2020-12) files in generated/.
 */

import { mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

// Root schemas (full document)
import { OpenAPI2Schema } from "../src/openapi-2.0-module.ts";
import { OpenAPI30Schema } from "../src/openapi-3.0-module.ts";
import { OpenAPI31Schema } from "../src/openapi-3.1-module.ts";
import { OpenAPI32Schema } from "../src/openapi-3.2-module.ts";

// Standalone 3.x schemas (for partial document validation)
import { PathItem32Schema } from "../src/openapi-3.2-module.ts";
import { Operation32Schema } from "../src/openapi-3.2-module.ts";
import { Parameter32Schema } from "../src/openapi-3.2-module.ts";
import { RequestBody32Schema } from "../src/openapi-3.2-module.ts";
import { Response32Schema } from "../src/openapi-3.2-module.ts";
import { Header32Schema } from "../src/openapi-3.2-module.ts";
import { SecurityScheme32Schema } from "../src/openapi-3.2-module.ts";
import { Components32Schema } from "../src/openapi-3.2-module.ts";
import { SchemaObject32Schema } from "../src/openapi-3.2-module.ts";
import { Server32Schema } from "../src/openapi-3.2-module.ts";

const schemas: Record<string, z.ZodType> = {
	// Full document roots
	"openapi-2.0-root": OpenAPI2Schema,
	"openapi-3.0-root": OpenAPI30Schema,
	"openapi-3.1-root": OpenAPI31Schema,
	"openapi-3.2-root": OpenAPI32Schema,

	// Standalone document types (latest 3.x version)
	"openapi-3.x-path-item": PathItem32Schema,
	"openapi-3.x-operation": Operation32Schema,
	"openapi-3.x-parameter": Parameter32Schema,
	"openapi-3.x-request-body": RequestBody32Schema,
	"openapi-3.x-response": Response32Schema,
	"openapi-3.x-header": Header32Schema,
	"openapi-3.x-security-scheme": SecurityScheme32Schema,
	"openapi-3.x-components": Components32Schema,
	"openapi-3.x-schema": SchemaObject32Schema,
	"openapi-3.x-server": Server32Schema,
};

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "generated");
mkdirSync(outDir, { recursive: true });

let count = 0;
for (const [key, zodSchema] of Object.entries(schemas)) {
	const jsonSchema = z.toJSONSchema(zodSchema, {
		target: "draft-2020-12",
		reused: "ref",
		unrepresentable: "any",
	});

	const outPath = resolve(outDir, `${key}.json`);
	writeFileSync(outPath, JSON.stringify(jsonSchema, null, 2) + "\n");
	count++;
	console.log(`  exported: ${key}.json`);
}

console.log(`\nExported ${count} JSON Schema files to generated/`);
