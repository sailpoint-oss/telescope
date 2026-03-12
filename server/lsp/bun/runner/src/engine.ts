import type { OpenAPIVisitors, GenericVisitors, RuleContext, GenericRuleContext } from "@sailpoint-oss/telescope";
import type { SerializedDoc, SerializedProjectIndex, LoadedRule, RunRulesRequest } from "./types";
import type { ContextInternal } from "./context";
import {
	buildRootRef,
	buildInfoRef,
	buildOperationRef,
	buildPathItemRef,
	buildSchemaRef,
	buildParameterRef,
	buildResponseRef,
	buildRequestBodyRef,
	buildComponentRef,
	buildTagRef,
	buildExampleRef,
	buildHeaderRef,
	buildSecuritySchemeRef,
	buildDocumentRef,
} from "./refs";

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;

function escapePointer(s: string): string {
	return s.replace(/~/g, "~0").replace(/\//g, "~1");
}

export function runOpenAPIRule(
	rule: { check(ctx: RuleContext): OpenAPIVisitors | undefined },
	ctx: RuleContext,
	doc: SerializedDoc,
	_project: SerializedProjectIndex,
): void {
	const visitors = rule.check(ctx);
	if (!visitors) return;

	const ast = doc.ast;

	if (visitors.Root) {
		visitors.Root(buildRootRef(doc, ast));
	}

	if (visitors.Info && ast.info) {
		visitors.Info(buildInfoRef(doc, ast.info as Record<string, unknown>, "/info"));
	}

	if (visitors.Tag && Array.isArray(ast.tags)) {
		for (let i = 0; i < ast.tags.length; i++) {
			visitors.Tag(buildTagRef(doc, ast.tags[i] as Record<string, unknown>, `/tags/${i}`));
		}
	}

	const paths = ast.paths as Record<string, unknown> | undefined;
	if (paths && (visitors.PathItem || visitors.Operation || visitors.Parameter || visitors.Response || visitors.RequestBody)) {
		for (const [path, pathItemRaw] of Object.entries(paths)) {
			const pathPointer = `/paths/${escapePointer(path)}`;
			const pathItem = pathItemRaw as Record<string, unknown>;

			if (visitors.PathItem) {
				visitors.PathItem(buildPathItemRef(doc, pathItem, pathPointer, path));
			}

			for (const method of HTTP_METHODS) {
				const op = pathItem[method] as Record<string, unknown> | undefined;
				if (!op) continue;
				const opPointer = `${pathPointer}/${method}`;

				if (visitors.Operation) {
					visitors.Operation(buildOperationRef(doc, op, opPointer, method, path));
				}

				if (visitors.Parameter && Array.isArray(op.parameters)) {
					for (let i = 0; i < op.parameters.length; i++) {
						visitors.Parameter(
							buildParameterRef(doc, op.parameters[i] as Record<string, unknown>, `${opPointer}/parameters/${i}`),
						);
					}
				}

				if (visitors.Response && op.responses) {
					for (const [code, resp] of Object.entries(op.responses as Record<string, unknown>)) {
						visitors.Response(
							buildResponseRef(doc, resp as Record<string, unknown>, `${opPointer}/responses/${code}`, code),
						);
					}
				}

				if (visitors.RequestBody && op.requestBody) {
					visitors.RequestBody(
						buildRequestBodyRef(doc, op.requestBody as Record<string, unknown>, `${opPointer}/requestBody`),
					);
				}
			}

			if (visitors.Parameter && Array.isArray(pathItem.parameters)) {
				for (let i = 0; i < pathItem.parameters.length; i++) {
					visitors.Parameter(
						buildParameterRef(doc, pathItem.parameters[i] as Record<string, unknown>, `${pathPointer}/parameters/${i}`),
					);
				}
			}
		}
	}

	const components = ast.components as Record<string, unknown> | undefined;
	if (components) {
		if (visitors.Schema) {
			const schemas = components.schemas as Record<string, unknown> | undefined;
			if (schemas) {
				for (const [name, schema] of Object.entries(schemas)) {
					visitors.Schema(
						buildSchemaRef(doc, schema as Record<string, unknown>, `/components/schemas/${escapePointer(name)}`, name),
					);
				}
			}
		}

		if (visitors.Component) {
			for (const [compType, compMap] of Object.entries(components)) {
				if (typeof compMap !== "object" || compMap === null) continue;
				for (const [name, comp] of Object.entries(compMap as Record<string, unknown>)) {
					visitors.Component(
						buildComponentRef(
							doc,
							comp as Record<string, unknown>,
							`/components/${escapePointer(compType)}/${escapePointer(name)}`,
							compType,
							name,
						),
					);
				}
			}
		}

		if (visitors.Example) {
			const examples = components.examples as Record<string, unknown> | undefined;
			if (examples) {
				for (const [name, example] of Object.entries(examples)) {
					visitors.Example(
						buildExampleRef(doc, example as Record<string, unknown>, `/components/examples/${escapePointer(name)}`, name),
					);
				}
			}
		}

		if (visitors.Header) {
			const headers = components.headers as Record<string, unknown> | undefined;
			if (headers) {
				for (const [name, header] of Object.entries(headers)) {
					visitors.Header(
						buildHeaderRef(doc, header as Record<string, unknown>, `/components/headers/${escapePointer(name)}`, name),
					);
				}
			}
		}

		if (visitors.SecurityScheme) {
			const schemes = components.securitySchemes as Record<string, unknown> | undefined;
			if (schemes) {
				for (const [name, scheme] of Object.entries(schemes)) {
					visitors.SecurityScheme(
						buildSecuritySchemeRef(doc, scheme as Record<string, unknown>, `/components/securitySchemes/${escapePointer(name)}`, name),
					);
				}
			}
		}

		if (visitors.Parameter) {
			const params = components.parameters as Record<string, unknown> | undefined;
			if (params) {
				for (const [name, param] of Object.entries(params)) {
					visitors.Parameter(
						buildParameterRef(doc, param as Record<string, unknown>, `/components/parameters/${escapePointer(name)}`),
					);
				}
			}
		}

		if (visitors.Response) {
			const responses = components.responses as Record<string, unknown> | undefined;
			if (responses) {
				for (const [code, resp] of Object.entries(responses)) {
					visitors.Response(
						buildResponseRef(doc, resp as Record<string, unknown>, `/components/responses/${escapePointer(code)}`, code),
					);
				}
			}
		}

		if (visitors.RequestBody) {
			const bodies = components.requestBodies as Record<string, unknown> | undefined;
			if (bodies) {
				for (const [name, body] of Object.entries(bodies)) {
					visitors.RequestBody(
						buildRequestBodyRef(doc, body as Record<string, unknown>, `/components/requestBodies/${escapePointer(name)}`),
					);
				}
			}
		}
	}
}

export function runGenericRule(
	rule: { create(ctx: GenericRuleContext): GenericVisitors | undefined },
	ctx: GenericRuleContext,
	doc: SerializedDoc,
): void {
	const visitors = rule.create(ctx);
	if (!visitors) return;

	if (visitors.Document) {
		visitors.Document(buildDocumentRef(doc, doc.ast, ""));
	}
}

