import { accessor, defineRule, type Rule } from "../../api.js";

interface OperationNode {
	responses?: Record<string, ResponseNode>;
	parameters?: ParameterNode[];
}

interface ResponseNode {
	$ref?: string;
	content?: Record<string, MediaTypeNode>;
}

interface MediaTypeNode {
	schema?: SchemaNode;
}

interface SchemaNode {
	$ref?: string;
	type?: string;
	minimum?: number;
	maximum?: number;
}

interface ParameterNode {
	$ref?: string;
	name?: string;
	in?: string;
	schema?: SchemaNode;
}

function returnsArrayPayload(operation: OperationNode): boolean {
	const responses = operation.responses;
	if (!responses || typeof responses !== "object") return false;

	for (const [code, response] of Object.entries(responses)) {
		if (!code.startsWith("2")) continue;
		if (!response || typeof response !== "object") continue;
		if (response.$ref) continue;

		const content = response.content;
		if (!content || typeof content !== "object") continue;

		for (const media of Object.values(content)) {
			if (!media || typeof media !== "object") continue;
			const schema = media.schema;
			if (!schema || typeof schema !== "object") continue;
			if (schema.$ref) continue;
			if (schema.type === "array") return true;
		}
	}

	return false;
}

function collectQueryParams(
	operation: OperationNode,
	opPointer: string,
): Array<{ name: string; pointer: string; param: ParameterNode }> {
	const params: Array<{
		name: string;
		pointer: string;
		param: ParameterNode;
	}> = [];
	const parameters = operation.parameters;

	if (Array.isArray(parameters)) {
		parameters.forEach((param, index) => {
			if (param && typeof param === "object" && !param.$ref) {
				if (param.in === "query" && typeof param.name === "string") {
					params.push({
						name: param.name,
						pointer: `${opPointer}/parameters/${index}`,
						param,
					});
				}
			}
		});
	}

	return params;
}

/**
 * SailPoint Pagination Rule
 *
 * Validates that GET list operations returning arrays expose proper
 * limit and offset query parameters with bounds.
 */
const operationPagination: Rule = defineRule({
	meta: {
		id: "operation-pagination",
		number: 159,
		type: "problem",
		description:
			"GET list operations returning arrays must expose limit and offset query parameters with proper bounds",
	},
	check(ctx) {
		return {
			Operation(op) {
				if (op.method !== "get") return;

				const $ = accessor(op.node);
				const operation = $.raw() as OperationNode;
				if (!returnsArrayPayload(operation)) return;

				const queryParams = collectQueryParams(operation, op.pointer);
				const limitParam = queryParams.find((p) => p.name === "limit");
				const offsetParam = queryParams.find((p) => p.name === "offset");

				// Check offset parameter
				if (!offsetParam) {
					ctx.reportAt(op, "parameters", {
						message:
							"GET list operations that return arrays must declare an `offset` query parameter",
						severity: "error",
					});
				} else {
					const schema = offsetParam.param.schema;
					if (schema && !schema.$ref && schema.type !== "integer") {
						ctx.reportAt(
							{ uri: op.uri, pointer: offsetParam.pointer },
							["schema", "type"],
							{
								message: "`offset` must be defined as an integer",
								severity: "error",
							},
						);
					}
				}

				// Check limit parameter
				if (!limitParam) {
					ctx.reportAt(op, "parameters", {
						message:
							"GET list operations that return arrays must declare a `limit` query parameter",
						severity: "error",
					});
					return;
				}

				const schema = limitParam.param.schema;
				if (!schema || schema.$ref) {
					ctx.reportHere(
						{ uri: op.uri, pointer: limitParam.pointer },
						{
							message:
								"`limit` must provide an inline schema with minimum and maximum bounds",
							severity: "error",
						},
					);
					return;
				}

				if (schema.type !== "integer") {
					ctx.reportAt(
						{ uri: op.uri, pointer: limitParam.pointer },
						["schema", "type"],
						{
							message: "`limit` must be defined as an integer",
							severity: "error",
						},
					);
				}

				if (schema.minimum === undefined) {
					ctx.reportAt(
						{ uri: op.uri, pointer: limitParam.pointer },
						["schema", "minimum"],
						{
							message: "`limit` must specify a minimum value",
							severity: "error",
						},
					);
				}

				if (schema.maximum === undefined) {
					ctx.reportAt(
						{ uri: op.uri, pointer: limitParam.pointer },
						["schema", "maximum"],
						{
							message: "`limit` must specify a maximum value",
							severity: "error",
						},
					);
				}
			},
		};
	},
});

export default operationPagination;
