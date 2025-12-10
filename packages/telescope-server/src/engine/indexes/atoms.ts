/**
 * AtomIndex - extracts rule-relevant "atoms" (operations, components, etc.) from IR.
 */

import type { IRDocument, IRNode, Loc } from "../ir/types.js";

export interface OperationAtom {
	uri: string;
	ptr: string;
	method: string;
	path: string;
	operationId?: string;
	tags?: string[];
	loc: Loc;
}

export interface ComponentAtom {
	uri: string;
	ptr: string;
	type:
		| "schemas"
		| "responses"
		| "parameters"
		| "examples"
		| "requestBodies"
		| "headers"
		| "securitySchemes"
		| "links"
		| "callbacks";
	name: string;
	loc: Loc;
}

export interface SchemaAtom {
	uri: string;
	ptr: string;
	name?: string;
	loc: Loc;
}

export interface SecuritySchemeAtom {
	uri: string;
	ptr: string;
	name: string;
	type: string;
	loc: Loc;
}

/**
 * Per-document atom index.
 */
export interface AtomIndex {
	operations: OperationAtom[];
	components: ComponentAtom[];
	schemas: SchemaAtom[];
	securitySchemes: SecuritySchemeAtom[];
}

/**
 * Extract atoms from an IR document.
 */
export function extractAtoms(doc: IRDocument): AtomIndex {
	const operations: OperationAtom[] = [];
	const components: ComponentAtom[] = [];
	const schemas: SchemaAtom[] = [];
	const securitySchemes: SecuritySchemeAtom[] = [];

	// Extract operations from paths
	const pathsNode = findChildByKey(doc.root, "paths");
	if (pathsNode && pathsNode.kind === "object" && pathsNode.children) {
		for (const pathItem of pathsNode.children) {
			if (pathItem.kind !== "object" || !pathItem.key) continue;
			const path = pathItem.key;

			// Extract operations from this path item
			const methods = [
				"get",
				"post",
				"put",
				"delete",
				"patch",
				"head",
				"options",
				"trace",
			];
			for (const method of methods) {
				const opNode = findChildByKey(pathItem, method);
				if (opNode && opNode.kind === "object") {
					const operationId = findChildByKey(opNode, "operationId");
					const tags = findChildByKey(opNode, "tags");
					const tagsArray =
						tags?.kind === "array" && tags.children
							? tags.children.map((t) => String(t.value ?? ""))
							: undefined;

					operations.push({
						uri: doc.uri,
						ptr: opNode.ptr,
						method: method.toUpperCase(),
						path,
						operationId:
							operationId?.kind === "string"
								? String(operationId.value)
								: undefined,
						tags: tagsArray,
						loc: opNode.loc,
					});
				}
			}
		}
	}

	// Extract components
	const componentsNode = findChildByKey(doc.root, "components");
	if (
		componentsNode &&
		componentsNode.kind === "object" &&
		componentsNode.children
	) {
		const componentTypes: Array<ComponentAtom["type"]> = [
			"schemas",
			"responses",
			"parameters",
			"examples",
			"requestBodies",
			"headers",
			"securitySchemes",
			"links",
			"callbacks",
		];

		for (const type of componentTypes) {
			const typeNode = findChildByKey(componentsNode, type);
			if (typeNode && typeNode.kind === "object" && typeNode.children) {
				for (const component of typeNode.children) {
					if (component.kind === "object" && component.key) {
						components.push({
							uri: doc.uri,
							ptr: component.ptr,
							type,
							name: component.key,
							loc: component.loc,
						});

						// Also track schemas separately
						if (type === "schemas") {
							schemas.push({
								uri: doc.uri,
								ptr: component.ptr,
								name: component.key,
								loc: component.loc,
							});
						}

						// Track security schemes separately
						if (type === "securitySchemes") {
							const schemeType = findChildByKey(component, "type");
							securitySchemes.push({
								uri: doc.uri,
								ptr: component.ptr,
								name: component.key,
								type:
									schemeType?.kind === "string"
										? String(schemeType.value)
										: "unknown",
								loc: component.loc,
							});
						}
					}
				}
			}
		}
	}

	return {
		operations,
		components,
		schemas,
		securitySchemes,
	};
}

function findChildByKey(node: IRNode, key: string): IRNode | undefined {
	if (node.kind !== "object" || !node.children) return undefined;
	return node.children.find((child) => child.key === key);
}
