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

// 3.0 fragment schemas
import { PathItem30Schema } from "../src/openapi-3.0-module.ts";
import { Operation30Schema } from "../src/openapi-3.0-module.ts";
import { Parameter30Schema } from "../src/openapi-3.0-module.ts";
import { RequestBody30Schema } from "../src/openapi-3.0-module.ts";
import { Response30Schema } from "../src/openapi-3.0-module.ts";
import { Header30Schema } from "../src/openapi-3.0-module.ts";
import { SecurityScheme30Schema } from "../src/openapi-3.0-module.ts";
import { Components30Schema } from "../src/openapi-3.0-module.ts";
import { SchemaObject30Schema } from "../src/openapi-3.0-module.ts";
import { Server30Schema } from "../src/openapi-3.0-module.ts";

// 3.1 fragment schemas
import { PathItem31Schema } from "../src/openapi-3.1-module.ts";
import { Operation31Schema } from "../src/openapi-3.1-module.ts";
import { Parameter31Schema } from "../src/openapi-3.1-module.ts";
import { RequestBody31Schema } from "../src/openapi-3.1-module.ts";
import { Response31Schema } from "../src/openapi-3.1-module.ts";
import { Header31Schema } from "../src/openapi-3.1-module.ts";
import { SecurityScheme31Schema } from "../src/openapi-3.1-module.ts";
import { Components31Schema } from "../src/openapi-3.1-module.ts";
import { SchemaObject31Schema } from "../src/openapi-3.1-module.ts";
import { Server31Schema } from "../src/openapi-3.1-module.ts";

// 3.2 fragment schemas
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

	// OpenAPI 3.0 fragment schemas
	"openapi-3.0-path-item": PathItem30Schema,
	"openapi-3.0-operation": Operation30Schema,
	"openapi-3.0-parameter": Parameter30Schema,
	"openapi-3.0-request-body": RequestBody30Schema,
	"openapi-3.0-response": Response30Schema,
	"openapi-3.0-header": Header30Schema,
	"openapi-3.0-security-scheme": SecurityScheme30Schema,
	"openapi-3.0-components": Components30Schema,
	"openapi-3.0-schema": SchemaObject30Schema,
	"openapi-3.0-server": Server30Schema,

	// OpenAPI 3.1 fragment schemas
	"openapi-3.1-path-item": PathItem31Schema,
	"openapi-3.1-operation": Operation31Schema,
	"openapi-3.1-parameter": Parameter31Schema,
	"openapi-3.1-request-body": RequestBody31Schema,
	"openapi-3.1-response": Response31Schema,
	"openapi-3.1-header": Header31Schema,
	"openapi-3.1-security-scheme": SecurityScheme31Schema,
	"openapi-3.1-components": Components31Schema,
	"openapi-3.1-schema": SchemaObject31Schema,
	"openapi-3.1-server": Server31Schema,

	// OpenAPI 3.2 fragment schemas
	"openapi-3.2-path-item": PathItem32Schema,
	"openapi-3.2-operation": Operation32Schema,
	"openapi-3.2-parameter": Parameter32Schema,
	"openapi-3.2-request-body": RequestBody32Schema,
	"openapi-3.2-response": Response32Schema,
	"openapi-3.2-header": Header32Schema,
	"openapi-3.2-security-scheme": SecurityScheme32Schema,
	"openapi-3.2-components": Components32Schema,
	"openapi-3.2-schema": SchemaObject32Schema,
	"openapi-3.2-server": Server32Schema,
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
