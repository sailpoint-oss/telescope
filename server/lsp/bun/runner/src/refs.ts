import type {
	InfoRef,
	RootRef,
	OperationRef,
	PathItemRef,
	SchemaRef,
	ParameterRef,
	ResponseRef,
	RequestBodyRef,
	ComponentRef,
	TagRef,
	ExampleRef,
	HeaderRef,
	SecuritySchemeRef,
	DocumentRef,
} from "@sailpoint-oss/telescope";
import type { SerializedDoc } from "./types";

export function buildRootRef(doc: SerializedDoc, ast: Record<string, unknown>): RootRef {
	return { uri: doc.uri, pointer: "", node: ast };
}

export function buildInfoRef(
	doc: SerializedDoc,
	node: Record<string, unknown>,
	pointer: string,
): InfoRef {
	return {
		uri: doc.uri,
		pointer,
		node,
		title: () => (node.title as string) ?? "",
		version: () => (node.version as string) ?? "",
		description: () => node.description as string | undefined,
		contact: () => node.contact,
		license: () => node.license,
		hasContact: () => Boolean(node.contact),
		hasLicense: () => Boolean(node.license),
	};
}

export function buildOperationRef(
	doc: SerializedDoc,
	node: Record<string, unknown>,
	pointer: string,
	method: string,
	path: string,
): OperationRef {
	return {
		uri: doc.uri,
		pointer,
		node,
		method,
		path,
		operationId: () => node.operationId as string | undefined,
		summary: () => node.summary as string | undefined,
		description: () => node.description as string | undefined,
		tags: () => (node.tags as string[]) ?? [],
		deprecated: () => Boolean(node.deprecated),
		eachParameter: (fn) => {
			const params = node.parameters as Record<string, unknown>[] | undefined;
			if (!params) return;
			for (let i = 0; i < params.length; i++) {
				fn(buildParameterRef(doc, params[i] as Record<string, unknown>, `${pointer}/parameters/${i}`));
			}
		},
		eachResponse: (fn) => {
			const responses = node.responses as Record<string, unknown> | undefined;
			if (!responses) return;
			for (const [code, resp] of Object.entries(responses)) {
				fn(buildResponseRef(doc, resp as Record<string, unknown>, `${pointer}/responses/${code}`, code));
			}
		},
	};
}

export function buildPathItemRef(
	doc: SerializedDoc,
	node: Record<string, unknown>,
	pointer: string,
	path: string,
): PathItemRef {
	return { uri: doc.uri, pointer, node, path };
}

export function buildSchemaRef(
	doc: SerializedDoc,
	node: Record<string, unknown>,
	pointer: string,
	name: string,
): SchemaRef {
	return {
		uri: doc.uri,
		pointer,
		node,
		name,
		schemaType: () => node.type as string | string[] | undefined,
		format: () => node.format as string | undefined,
		properties: () => node.properties as Record<string, unknown> | undefined,
		required: () => node.required as string[] | undefined,
		items: () => node.items,
		allOf: () => node.allOf as unknown[] | undefined,
		oneOf: () => node.oneOf as unknown[] | undefined,
		anyOf: () => node.anyOf as unknown[] | undefined,
		enum: () => node.enum as unknown[] | undefined,
		isNullable: () => Boolean(node.nullable) || (Array.isArray(node.type) && (node.type as string[]).includes("null")),
	};
}

export function buildParameterRef(
	doc: SerializedDoc,
	node: Record<string, unknown>,
	pointer: string,
): ParameterRef {
	return {
		uri: doc.uri,
		pointer,
		node,
		paramName: () => (node.name as string) ?? "",
		paramIn: () => (node.in as string) ?? "",
		paramRequired: () => Boolean(node.required),
		schema: () => node.schema,
	};
}

export function buildResponseRef(
	doc: SerializedDoc,
	node: Record<string, unknown>,
	pointer: string,
	statusCode: string,
): ResponseRef {
	return {
		uri: doc.uri,
		pointer,
		node,
		statusCode,
		responseDescription: () => node.description as string | undefined,
	};
}

export function buildRequestBodyRef(
	doc: SerializedDoc,
	node: Record<string, unknown>,
	pointer: string,
): RequestBodyRef {
	return {
		uri: doc.uri,
		pointer,
		node,
		requestBodyRequired: () => Boolean(node.required),
		requestBodyDescription: () => node.description as string | undefined,
	};
}

export function buildComponentRef(
	doc: SerializedDoc,
	node: Record<string, unknown>,
	pointer: string,
	componentType: string,
	componentName: string,
): ComponentRef {
	return { uri: doc.uri, pointer, node, componentType, componentName };
}

export function buildTagRef(
	doc: SerializedDoc,
	node: Record<string, unknown>,
	pointer: string,
): TagRef {
	return {
		uri: doc.uri,
		pointer,
		node,
		tagName: () => (node.name as string) ?? "",
		tagDescription: () => node.description as string | undefined,
	};
}

export function buildExampleRef(
	doc: SerializedDoc,
	node: Record<string, unknown>,
	pointer: string,
	exampleName: string,
): ExampleRef {
	return { uri: doc.uri, pointer, node, exampleName };
}

export function buildHeaderRef(
	doc: SerializedDoc,
	node: Record<string, unknown>,
	pointer: string,
	headerName: string,
): HeaderRef {
	return { uri: doc.uri, pointer, node, headerName };
}

export function buildSecuritySchemeRef(
	doc: SerializedDoc,
	node: Record<string, unknown>,
	pointer: string,
	schemeName: string,
): SecuritySchemeRef {
	return {
		uri: doc.uri,
		pointer,
		node,
		schemeName,
		schemeType: () => (node.type as string) ?? "",
	};
}

export function buildDocumentRef(
	doc: SerializedDoc,
	node: Record<string, unknown>,
	pointer: string,
): DocumentRef {
	return { uri: doc.uri, pointer, node };
}
