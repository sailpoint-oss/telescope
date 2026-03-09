import type { ZodType, ZodError } from "zod";
import type {
	SerializedDoc,
	SerializedDiagnostic,
	ZodSchemaConfig,
	RuleRunError,
} from "./types";

const schemaCache = new Map<string, ZodType>();

async function loadZodSchema(path: string): Promise<ZodType> {
	const cached = schemaCache.get(path);
	if (cached) return cached;

	const mod = await import(path);
	const schema = mod.default ?? mod.schema;
	if (!schema || typeof schema.parse !== "function") {
		throw new Error(`${path} does not export a valid Zod schema`);
	}
	schemaCache.set(path, schema);
	return schema;
}

function resolvePointerValue(
	ast: Record<string, unknown>,
	pointer: string,
): unknown {
	if (!pointer || pointer === "/") return ast;
	const parts = pointer
		.replace(/^\//, "")
		.split("/")
		.map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
	let current: unknown = ast;
	for (const part of parts) {
		if (current === null || current === undefined) return undefined;
		if (Array.isArray(current)) {
			const idx = parseInt(part, 10);
			if (isNaN(idx)) return undefined;
			current = current[idx];
		} else if (typeof current === "object") {
			current = (current as Record<string, unknown>)[part];
		} else {
			return undefined;
		}
	}
	return current;
}

function zodIssueToDiagnostic(
	issue: { path: (string | number)[]; message: string; code: string },
	pointer: string,
	doc: SerializedDoc,
): SerializedDiagnostic {
	const fullPath = pointer === "/" ? "" : pointer;
	const issuePath = issue.path.map((p) => String(p)).join("/");
	const lookupPointer = issuePath
		? `${fullPath}/${issuePath}`
		: fullPath || "/";

	const range = doc.pointers[lookupPointer];
	const startLine = range ? range[0] : 0;
	const startChar = range ? range[1] : 0;
	const endLine = range ? range[2] : 0;
	const endChar = range ? range[3] : 0;

	return {
		startLine,
		startChar,
		endLine,
		endChar,
		severity: 1,
		code: `zod/${issue.code}`,
		message: issue.message,
		source: "telescope-zod",
	};
}

export async function runZodOverlays(
	doc: SerializedDoc,
	schemas: ZodSchemaConfig[],
): Promise<{
	diagnostics: SerializedDiagnostic[];
	timings: Record<string, number>;
	errors: RuleRunError[];
}> {
	const diagnostics: SerializedDiagnostic[] = [];
	const timings: Record<string, number> = {};
	const errors: RuleRunError[] = [];

	for (const config of schemas) {
		const start = performance.now();
		try {
			const schema = await loadZodSchema(config.schemaPath);
			const pointers =
				config.pointers && config.pointers.length > 0
					? config.pointers
					: ["/"];

			for (const pointer of pointers) {
				const value = resolvePointerValue(doc.ast, pointer);
				if (value === undefined) continue;

				const result = schema.safeParse(value);
				if (!result.success) {
					const zodErr = result.error as ZodError;
					for (const issue of zodErr.issues) {
						diagnostics.push(zodIssueToDiagnostic(issue, pointer, doc));
					}
				}
			}
			timings[config.schemaPath] = performance.now() - start;
		} catch (err) {
			errors.push({
				ruleID: `zod:${config.schemaPath}`,
				error: String(err),
				phase: "run",
			});
			timings[config.schemaPath] = performance.now() - start;
		}
	}

	return { diagnostics, timings, errors };
}
