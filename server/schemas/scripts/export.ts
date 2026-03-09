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

/**
 * Replace permissive `additionalProperties` with `false` on OpenAPI object schemas.
 *
 * Zod's `looseObject()` emits `additionalProperties: {}` (allow anything).
 * In practice, the generated schemas use `$defs` with `$ref` pointers, so the
 * pattern is: `"additionalProperties": { "$ref": "#/$defs/__schemaNN" }` where
 * the referenced def is `{}` (empty = allow everything).
 *
 * In OpenAPI, the only "extra" properties an object should allow are `x-*`
 * vendor extensions, which the Go validator already exempts by convention.
 * Setting `additionalProperties: false` lets the validator flag genuinely
 * unknown / mistyped keys.
 *
 * Objects that legitimately map arbitrary keys (paths, responses, components)
 * use `additionalProperties: { "$ref": ... }` pointing to a NON-empty schema,
 * so they are unaffected.
 */
function tightenAdditionalProperties(schema: Record<string, unknown>): Record<string, unknown> {
	const defs = (schema.$defs ?? schema.definitions ?? {}) as Record<string, unknown>;

	// Build a set of def names that are empty schemas (i.e., `{}`)
	const emptyDefs = new Set<string>();
	for (const [name, def] of Object.entries(defs)) {
		if (
			def !== null &&
			typeof def === "object" &&
			!Array.isArray(def) &&
			Object.keys(def as Record<string, unknown>).length === 0
		) {
			emptyDefs.add(name);
		}
	}

	function isEmptySchemaRef(val: unknown): boolean {
		if (val === null || typeof val !== "object" || Array.isArray(val)) return false;
		const obj = val as Record<string, unknown>;
		const ref = obj.$ref;
		if (typeof ref !== "string") return false;
		const match = ref.match(/^#\/\$defs\/(.+)$/);
		if (!match) return false;
		return emptyDefs.has(match[1]);
	}

	function walk(obj: unknown): unknown {
		if (Array.isArray(obj)) return obj.map(walk);
		if (obj !== null && typeof obj === "object") {
			const out: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
				if (k === "additionalProperties" && (isEmptySchemaRef(v) || isEmptyObj(v))) {
					out[k] = false;
				} else {
					out[k] = walk(v);
				}
			}
			return out;
		}
		return obj;
	}

	function isEmptyObj(v: unknown): boolean {
		return v !== null && typeof v === "object" && !Array.isArray(v) &&
			Object.keys(v as Record<string, unknown>).length === 0;
	}

	const result = walk(schema) as Record<string, unknown>;

	// Remove the now-unused empty defs
	if (result.$defs && typeof result.$defs === "object") {
		const cleanedDefs = { ...(result.$defs as Record<string, unknown>) };
		for (const name of emptyDefs) {
			delete cleanedDefs[name];
		}
		result.$defs = cleanedDefs;
	}

	return result;
}

let count = 0;
for (const [key, zodSchema] of Object.entries(schemas)) {
	const jsonSchema = z.toJSONSchema(zodSchema, {
		target: "draft-2020-12",
		reused: "ref",
		unrepresentable: "any",
	});

	const tightened = tightenAdditionalProperties(jsonSchema as Record<string, unknown>);
	const outPath = resolve(outDir, `${key}.json`);
	writeFileSync(outPath, JSON.stringify(tightened, null, 2) + "\n");
	count++;
	console.log(`  exported: ${key}.json`);
}

console.log(`\nExported ${count} JSON Schema files to generated/`);
