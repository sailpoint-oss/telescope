import Ajv from "ajv";
import addFormats from "ajv-formats";
import { parseYaml } from "@stoplight/spectral-parsers";
import type {
	ValidateSchemaRequest,
	SerializedDiagnostic,
	RuleRunError,
} from "./types";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const schemaCache = new Map<string, unknown>();

function clearSchemaCache(): void {
	schemaCache.clear();
	ajv.removeSchema();
}

async function loadJsonSchema(schemaPath: string): Promise<unknown> {
	const cached = schemaCache.get(schemaPath);
	if (cached) return cached;

	const file = Bun.file(schemaPath);
	const text = await file.text();
	const schema = JSON.parse(text);
	schemaCache.set(schemaPath, schema);
	return schema;
}

async function loadZodSchema(
	schemaPath: string,
): Promise<{ parse: (data: unknown) => unknown }> {
	const cached = schemaCache.get(schemaPath);
	if (cached) return cached as { parse: (data: unknown) => unknown };

	const mod = await import(schemaPath);
	const schema = mod.default;
	if (!schema || typeof schema.parse !== "function") {
		throw new Error(
			`Zod schema at ${schemaPath} must export a Zod schema via defineSchema()`,
		);
	}
	schemaCache.set(schemaPath, schema);
	return schema as { parse: (data: unknown) => unknown };
}

function pointerToRange(
	pointer: string,
	pointers: Record<string, [number, number, number, number]>,
): [number, number, number, number] {
	if (pointers[pointer]) return pointers[pointer];

	const parts = pointer.split("/");
	while (parts.length > 1) {
		parts.pop();
		const parent = parts.join("/") || "/";
		if (pointers[parent]) return pointers[parent];
	}
	return pointers[""] ?? pointers["/"] ?? [0, 0, 0, 1];
}

function ajvErrorToDiagnostic(
	error: { instancePath: string; message?: string; keyword: string },
	pointers: Record<string, [number, number, number, number]>,
	groupName: string,
): SerializedDiagnostic {
	const pointer = error.instancePath || "/";
	const range = pointerToRange(pointer, pointers);
	return {
		startLine: range[0],
		startChar: range[1],
		endLine: range[2],
		endChar: range[3],
		severity: 1,
		code: `json-schema.${error.keyword}`,
		message: error.message ?? `Schema validation failed (${error.keyword})`,
		source: groupName || "json-schema",
	};
}

export async function validateWithJsonSchema(
	req: ValidateSchemaRequest,
): Promise<{ diagnostics: SerializedDiagnostic[]; errors: RuleRunError[] }> {
	const diagnostics: SerializedDiagnostic[] = [];
	const errors: RuleRunError[] = [];

	try {
		const schema = await loadJsonSchema(req.schemaPath);
		const validate = ajv.compile(schema as object);

		let data: unknown;
		try {
			const parsed = parseYaml(req.document.rawText);
			data = parsed.data;
		} catch {
			data = JSON.parse(req.document.rawText);
		}

		const valid = validate(data);
		if (!valid && validate.errors) {
			for (const err of validate.errors) {
				diagnostics.push(
					ajvErrorToDiagnostic(err, req.document.pointers, req.groupName),
				);
			}
		}
	} catch (err) {
		errors.push({
			ruleID: `json-schema:${req.groupName}`,
			error: String(err),
			phase: "run",
		});
	}

	return { diagnostics, errors };
}

export async function validateWithZod(
	req: ValidateSchemaRequest,
): Promise<{ diagnostics: SerializedDiagnostic[]; errors: RuleRunError[] }> {
	const diagnostics: SerializedDiagnostic[] = [];
	const errors: RuleRunError[] = [];

	try {
		const schema = await loadZodSchema(req.schemaPath);

		let data: unknown;
		try {
			const parsed = parseYaml(req.document.rawText);
			data = parsed.data;
		} catch {
			data = JSON.parse(req.document.rawText);
		}

		try {
			schema.parse(data);
		} catch (zodError: unknown) {
			if (
				zodError &&
				typeof zodError === "object" &&
				"issues" in zodError &&
				Array.isArray((zodError as { issues: unknown[] }).issues)
			) {
				for (const issue of (zodError as { issues: Array<{ path: (string | number)[]; message: string; code: string }> }).issues) {
					const pointer =
						"/" + issue.path.map(String).join("/");
					const range = pointerToRange(pointer, req.document.pointers);
					diagnostics.push({
						startLine: range[0],
						startChar: range[1],
						endLine: range[2],
						endChar: range[3],
						severity: 1,
						code: `zod.${issue.code}`,
						message: issue.message,
						source: req.groupName || "zod-schema",
					});
				}
			} else {
				throw zodError;
			}
		}
	} catch (err) {
		errors.push({
			ruleID: `zod-schema:${req.groupName}`,
			error: String(err),
			phase: "run",
		});
	}

	return { diagnostics, errors };
}

export { clearSchemaCache };
