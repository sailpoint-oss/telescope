import {
	defineRule,
	getValueAtPointer,
	joinPointer,
	type Rule,
	splitPointer,
} from "lens";

function returnsArrayPayload(doc: unknown, opPointer: string): boolean {
	const responsesPointer = joinPointer([
		...splitPointer(opPointer),
		"responses",
	]);
	const responses = getValueAtPointer(doc, responsesPointer);
	if (!responses || typeof responses !== "object" || Array.isArray(responses))
		return false;

	for (const [code, response] of Object.entries(responses)) {
		if (!code.startsWith("2")) continue;
		if (!response || typeof response !== "object") continue;
		if ("$ref" in response) continue;

		const content = (response as Record<string, unknown>).content;
		if (!content || typeof content !== "object") continue;

		for (const media of Object.values(content)) {
			if (!media || typeof media !== "object") continue;
			const schema = (media as Record<string, unknown>).schema;
			if (!schema || typeof schema !== "object") continue;
			if ("$ref" in schema) continue;
			if ((schema as Record<string, unknown>).type === "array") return true;
		}
	}

	return false;
}

function collectQueryParams(
	doc: unknown,
	opPointer: string,
): Array<{ name: string; pointer: string }> {
	const params: Array<{ name: string; pointer: string }> = [];
	const parametersPointer = joinPointer([
		...splitPointer(opPointer),
		"parameters",
	]);
	const parameters = getValueAtPointer(doc, parametersPointer);

	if (Array.isArray(parameters)) {
		parameters.forEach((param, index) => {
			const paramPointer = joinPointer([
				...splitPointer(parametersPointer),
				String(index),
			]);
			const paramObj = getValueAtPointer(doc, paramPointer);
			if (paramObj && typeof paramObj === "object" && !("$ref" in paramObj)) {
				const inValue = (paramObj as Record<string, unknown>).in;
				const name = (paramObj as Record<string, unknown>).name;
				if (inValue === "query" && typeof name === "string") {
					params.push({ name, pointer: paramPointer });
				}
			}
		});
	}

	return params;
}

const operationPagination: Rule = defineRule({
	meta: {
		id: "operation-pagination",
		number: 159,
		type: "problem",
		docs: {
			description:
				"GET list operations returning arrays must expose limit and offset query parameters with proper bounds",
			recommended: true,
		},
		oas: ["2.0", "3.0", "3.1", "3.2"],
	},
	create(ctx) {
		return {
			Operation(op) {
				if (op.method !== "get") return;

				const doc = ctx.project.docs.get(op.uri);
				if (!doc) return;

				if (!returnsArrayPayload(doc.ast, op.pointer)) return;

				const queryParams = collectQueryParams(doc.ast, op.pointer);
				const limitParam = queryParams.find((p) => p.name === "limit");
				const offsetParam = queryParams.find((p) => p.name === "offset");

				const parametersPointer = joinPointer([
					...splitPointer(op.pointer),
					"parameters",
				]);
				const parametersRange =
					ctx.locate(op.uri, parametersPointer) ??
					ctx.locate(op.uri, op.pointer);

				if (!offsetParam) {
					if (!parametersRange) return;
					ctx.report({
						message:
							"GET list operations that return arrays must declare an `offset` query parameter",
						severity: "error",
						uri: op.uri,
						range: parametersRange,
					});
				} else {
					const offsetSchemaPointer = joinPointer([
						...splitPointer(offsetParam.pointer),
						"schema",
						"type",
					]);
					const offsetParamObj = getValueAtPointer(
						doc.ast,
						offsetParam.pointer,
					);
					if (
						offsetParamObj &&
						typeof offsetParamObj === "object" &&
						!("$ref" in offsetParamObj)
					) {
						const schema = (offsetParamObj as Record<string, unknown>).schema;
						if (schema && typeof schema === "object" && !("$ref" in schema)) {
							const type = (schema as Record<string, unknown>).type;
							if (type !== "integer") {
								const range =
									ctx.locate(op.uri, offsetSchemaPointer) ??
									ctx.locate(op.uri, offsetParam.pointer);
								if (!range) return;
								ctx.report({
									message: "`offset` must be defined as an integer",
									severity: "error",
									uri: op.uri,
									range,
								});
							}
						}
					}
				}

				if (!limitParam) {
					if (!parametersRange) return;
					ctx.report({
						message:
							"GET list operations that return arrays must declare a `limit` query parameter",
						severity: "error",
						uri: op.uri,
						range: parametersRange,
					});
					return;
				}

				const limitParamObj = getValueAtPointer(doc.ast, limitParam.pointer);
				if (
					!limitParamObj ||
					typeof limitParamObj !== "object" ||
					"$ref" in limitParamObj
				) {
					const range = ctx.locate(op.uri, limitParam.pointer);
					if (!range) return;
					ctx.report({
						message:
							"`limit` must provide an inline schema with minimum and maximum bounds",
						severity: "error",
						uri: op.uri,
						range,
					});
					return;
				}

				const schema = (limitParamObj as Record<string, unknown>).schema;
				if (!schema || typeof schema !== "object" || "$ref" in schema) {
					const range = ctx.locate(op.uri, limitParam.pointer);
					if (!range) return;
					ctx.report({
						message:
							"`limit` must provide an inline schema with minimum and maximum bounds",
						severity: "error",
						uri: op.uri,
						range,
					});
					return;
				}

				const schemaObj = schema as Record<string, unknown>;

				if (schemaObj.type !== "integer") {
					const typePointer = joinPointer([
						...splitPointer(limitParam.pointer),
						"schema",
						"type",
					]);
					const range =
						ctx.locate(op.uri, typePointer) ??
						ctx.locate(op.uri, limitParam.pointer);
					if (!range) return;
					ctx.report({
						message: "`limit` must be defined as an integer",
						severity: "error",
						uri: op.uri,
						range,
					});
				}

				if (schemaObj.minimum === undefined) {
					const minPointer = joinPointer([
						...splitPointer(limitParam.pointer),
						"schema",
						"minimum",
					]);
					const range =
						ctx.locate(op.uri, minPointer) ??
						ctx.locate(op.uri, limitParam.pointer);
					if (!range) return;
					ctx.report({
						message: "`limit` must specify a minimum value",
						severity: "error",
						uri: op.uri,
						range,
					});
				}

				if (schemaObj.maximum === undefined) {
					const maxPointer = joinPointer([
						...splitPointer(limitParam.pointer),
						"schema",
						"maximum",
					]);
					const range =
						ctx.locate(op.uri, maxPointer) ??
						ctx.locate(op.uri, limitParam.pointer);
					if (!range) return;
					ctx.report({
						message: "`limit` must specify a maximum value",
						severity: "error",
						uri: op.uri,
						range,
					});
				}
			},
		};
	},
});

export default operationPagination;
