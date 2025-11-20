/**
 * IR-based rule runner.
 * Executes rules directly against IR documents using atoms for efficient traversal.
 */

import type { CancellationToken } from "@volar/language-service";
import type { Range } from "vscode-languageserver-protocol";
import type {
	CallbackRef,
	ComponentRef,
	ExampleRef,
	HeaderRef,
	LinkRef,
	MediaTypeRef,
	OperationRef,
	ParameterRef,
	PathItemRef,
	ReferenceRef,
	RequestBodyRef,
	ResponseRef,
	SchemaRef,
	SecurityRequirementRef,
} from "../indexes/types.js";
import type {
	AtomIndex,
	ComponentAtom,
	OperationAtom,
	SchemaAtom,
	SecuritySchemeAtom,
} from "../indexes/atoms.js";
import type { GraphIndex } from "../indexes/graph.js";
import type { IRDocument, Loc } from "../ir/types.js";
import { findNodeByPointer, getValueAtPointer } from "../ir/context.js";
import { createRuleContext } from "./runner.js";
import type {
	Diagnostic,
	EngineRunOptions,
	EngineRunResult,
	FilePatch,
	Rule,
	RuleContext,
	Visitors,
} from "../rules/types.js";

/**
 * IR-based project context.
 * This is a simplified context that works directly with IR documents.
 */
export interface IRProjectContext {
	/** Map of URI to IR document */
	docs: Map<string, IRDocument>;
	/** Map of URI to atom index */
	atoms: Map<string, AtomIndex>;
	/** Graph index for $ref tracking */
	graph: GraphIndex;
	/** Core instance for range conversion */
	core: {
		locToRange(uri: string, loc: Loc): Range | null;
		getLinkedUris(uri: string): string[];
	};
}

/**
 * Run rules against IR documents using atoms for efficient traversal.
 */
export function runEngineIR(
	project: IRProjectContext,
	files: string[],
	options: EngineRunOptions,
	token?: CancellationToken,
): EngineRunResult {
	if (token?.isCancellationRequested) {
		return { diagnostics: [], fixes: [] };
	}

	// Guard against invalid inputs
	if (!files || files.length === 0) {
		return { diagnostics: [], fixes: [] };
	}

	if (!options.rules || options.rules.length === 0) {
		return { diagnostics: [], fixes: [] };
	}

	const diagnostics: Diagnostic[] = [];
	const fixes: FilePatch[] = [];
	const visitorSets = new Map<string, Visitors[]>();

	// Create rule contexts and visitors for each file
	for (const fileUri of files) {
		if (token?.isCancellationRequested) {
			break;
		}

		if (!fileUri) {
			continue;
		}

		const ir = project.docs.get(fileUri);
		if (!ir) {
			continue;
		}

		// Create a minimal ProjectContext adapter for backward compatibility
		// Rules will use IR-based helpers through the context
		const adapterProject = createIRProjectAdapter(project, fileUri);
		const visitors = options.rules
			.filter((rule) => rule != null)
			.map((rule) => {
				try {
					const ctx = createIRRuleContext(
						adapterProject,
						project,
						fileUri,
						diagnostics,
						fixes,
						rule,
					);
					return rule.create(ctx);
			} catch (error) {
				// Error logged silently - in LSP context, use DiagnosticsLogger
				// For standalone usage, errors are silently swallowed
				return {} as Visitors; // Return empty visitor object
			}
			})
			.filter((visitor) => visitor != null);
		visitorSets.set(fileUri, visitors);
	}

	// Dispatch visitors based on atoms
	for (const fileUri of files) {
		if (token?.isCancellationRequested) {
			break;
		}

		const visitors = visitorSets.get(fileUri);
		if (!visitors) {
			continue;
		}

		const ir = project.docs.get(fileUri);
		const atoms = project.atoms.get(fileUri);
		if (!ir || !atoms) {
			continue;
		}

		// Ensure atoms arrays are initialized
		const operations = atoms.operations ?? [];
		const components = atoms.components ?? [];
		const schemas = atoms.schemas ?? [];
		const securitySchemes = atoms.securitySchemes ?? [];

		// Dispatch Document visitor
		dispatch(visitors, "Document", {
			uri: fileUri,
			pointer: "#",
			node: ir.root,
		});

		// Dispatch PathItem visitors (group operations by path)
		const pathsByPath = new Map<string, OperationAtom[]>();
		for (const op of operations) {
			if (!op || !op.path || !op.ptr) {
				continue; // Skip invalid operations
			}
			const pathOps = pathsByPath.get(op.path) ?? [];
			pathOps.push(op);
			pathsByPath.set(op.path, pathOps);
		}

		for (const [path, pathOps] of pathsByPath.entries()) {
			if (token?.isCancellationRequested) {
				break;
			}
			if (!path || pathOps.length === 0) {
				continue;
			}
			// Find path item node
			const pathsNode = findNodeByPointer(ir, "#/paths");
			if (
				pathsNode &&
				pathsNode.kind === "object" &&
				pathsNode.children &&
				Array.isArray(pathsNode.children)
			) {
				const pathItemNode = pathsNode.children.find(
					(child) => child && child.key === path,
				);
				if (pathItemNode && pathItemNode.ptr) {
					// Match PathItemRef structure: { uri, pointer, node }
					dispatch(visitors, "PathItem", {
						uri: fileUri,
						pointer: pathItemNode.ptr,
						node: pathItemNode,
					});
				}
			}

			// Dispatch Operation visitors for this path
			for (const op of pathOps) {
				if (token?.isCancellationRequested) {
					break;
				}
				if (!op || !op.ptr) {
					continue;
				}
				const node = findNodeByPointer(ir, op.ptr);
				if (node && op.uri && op.method) {
					// Match OperationRef structure: { uri, pointer, method, node }
					dispatch(visitors, "Operation", {
						uri: op.uri,
						pointer: op.ptr,
						method: op.method,
						node,
					});
				}
			}
		}

		// Dispatch Component visitors
		for (const component of components) {
			if (token?.isCancellationRequested) {
				break;
			}
			if (!component || !component.ptr || !component.uri) {
				continue;
			}
			const node = findNodeByPointer(ir, component.ptr);
			if (node) {
				// Match ComponentRef structure: { uri, pointer, node }
				dispatch(visitors, "Component", {
					uri: component.uri,
					pointer: component.ptr,
					node,
				});
			}
		}

		// Dispatch Schema visitors
		for (const schema of schemas) {
			if (token?.isCancellationRequested) {
				break;
			}
			if (!schema || !schema.ptr || !schema.uri) {
				continue;
			}
			const node = findNodeByPointer(ir, schema.ptr);
			if (node) {
				// Match SchemaRef structure: { uri, pointer, node }
				dispatch(visitors, "Schema", {
					uri: schema.uri,
					pointer: schema.ptr,
					node,
				});
			}
		}

		// Dispatch SecurityScheme visitors (as SecurityRequirement)
		for (const scheme of securitySchemes) {
			if (token?.isCancellationRequested) {
				break;
			}
			if (!scheme || !scheme.ptr || !scheme.uri) {
				continue;
			}
			const node = findNodeByPointer(ir, scheme.ptr);
			if (node) {
				// Match SecurityRequirementRef structure: { uri, pointer, node, level }
				dispatch(visitors, "SecurityRequirement", {
					uri: scheme.uri,
					pointer: scheme.ptr,
					node,
					level: "root" as const, // Default to root, could be enhanced
				});
			}
		}

		// Note: Parameter, Response, RequestBody, Header, MediaType, Example, Link, Callback visitors
		// are not yet extracted as atoms. Rules that need these can traverse IR directly or
		// we can enhance atom extraction in the future.

		// Dispatch Reference visitors for $ref nodes
		// Use graph index to find all references from this file
		try {
			const refEdges = project.graph.getRefEdgesFrom(fileUri) ?? [];
			for (const edge of refEdges) {
				if (token?.isCancellationRequested) {
					break;
				}
				if (!edge || !edge.fromPtr || !edge.fromUri || !edge.ref) {
					continue;
				}
				const node = findNodeByPointer(ir, edge.fromPtr);
				if (node) {
					// Match ReferenceRef structure: { uri, pointer, refPointer, ref, node }
					dispatch(visitors, "Reference", {
						uri: edge.fromUri,
						pointer: edge.fromPtr,
						refPointer: edge.fromPtr, // The pointer to the node containing $ref
						ref: edge.ref,
						node,
					});
				}
			}
		} catch (error) {
			// Graph index might not be fully initialized, skip reference visitors
			// Note: In LSP context, warnings should be logged via DiagnosticsLogger
		}
	}

	return { diagnostics, fixes };
}

/**
 * Build a ProjectIndex from IR atoms for backward compatibility with rules.
 */
function buildIndexFromIR(
	project: IRProjectContext,
): import("../rules/types.js").ProjectContext["index"] {
	const operationsByOwner = new Map<string, OperationRef[]>();
	const pathsByString = new Map<string, PathItemRef[]>();
	const pathItemsToPaths = new Map<string, string[]>();
	const components: Record<string, Map<string, ComponentRef>> = {
		schemas: new Map(),
		responses: new Map(),
		parameters: new Map(),
		examples: new Map(),
		requestBodies: new Map(),
		headers: new Map(),
		securitySchemes: new Map(),
		links: new Map(),
		callbacks: new Map(),
	};
	const schemas = new Map<string, SchemaRef>();
	const parameters = new Map<string, ParameterRef>();
	const responses = new Map<string, ResponseRef>();
	const requestBodies = new Map<string, RequestBodyRef>();
	const headers = new Map<string, HeaderRef>();
	const mediaTypes = new Map<string, MediaTypeRef>();
	const securityRequirements = new Map<string, SecurityRequirementRef>();
	const examples = new Map<string, ExampleRef>();
	const links = new Map<string, LinkRef>();
	const callbacks = new Map<string, CallbackRef>();
	const references = new Map<string, ReferenceRef>();
	const documents = new Map<string, Record<string, unknown>>();

	// Build index from all IR documents and atoms
	for (const [uri, ir] of project.docs.entries()) {
		const atoms = project.atoms.get(uri);
		if (!atoms) {
			continue;
		}

		// Convert IR root to plain object for documents map
		try {
			const rootValue = getValueAtPointer(ir, "#");
			if (rootValue && typeof rootValue === "object") {
				documents.set(uri, rootValue as Record<string, unknown>);
			}
		} catch {
			// Skip if conversion fails
		}

		// Group operations by path item (owner)
		const operationsByPath = new Map<string, OperationAtom[]>();
		for (const op of atoms.operations ?? []) {
			if (!op || !op.path) {
				continue;
			}
			const pathOps = operationsByPath.get(op.path) ?? [];
			pathOps.push(op);
			operationsByPath.set(op.path, pathOps);
		}

		// Build pathsByString and operationsByOwner
		for (const [path, pathOps] of operationsByPath.entries()) {
			// Find path item node
			const pathsNode = findNodeByPointer(ir, "#/paths");
			if (pathsNode && pathsNode.kind === "object" && pathsNode.children) {
				const pathItemNode = pathsNode.children.find(
					(child) => child?.key === path,
				);
				if (pathItemNode) {
					const pathItemPointer = pathItemNode.ptr;

					// Check if PathItem is a $ref
					let definitionUri = uri;
					let definitionPointer = pathItemPointer;
					const hasRef =
						pathItemNode.kind === "object" &&
						pathItemNode.children?.some((child) => child.key === "$ref");

					if (hasRef) {
						// Find the $ref edge in the graph
						const refEdges = project.graph.getRefEdgesFrom(
							uri,
							pathItemPointer,
						);
						const refEdge = refEdges[0];
						if (refEdge) {
							definitionUri = refEdge.toUri;
							definitionPointer = refEdge.toPtr;
						}
					}

					const pathItemRef: PathItemRef = {
						uri, // Reference URI (or definition if not referenced)
						pointer: pathItemPointer, // Reference pointer (or definition if not referenced)
						definitionUri,
						definitionPointer,
						referenceUri: hasRef ? uri : undefined,
						referencePointer: hasRef ? pathItemPointer : undefined,
						node: pathItemNode as any,
					};
					pushMap(pathsByString, path, pathItemRef);
					pathItemsToPaths.set(`${uri}#${pathItemPointer}`, [path]);

					// Build operationsByOwner
					const ownerKey = `${uri}#${pathItemPointer}`;
					const operationRefs: OperationRef[] = [];
					for (const op of pathOps) {
						if (!op || !op.ptr) {
							continue;
						}
						const opNode = findNodeByPointer(ir, op.ptr);
						if (opNode && op.uri && op.method) {
							// Operations inherit definition location from PathItem
							const opDefinitionUri = definitionUri;
							// Build operation definition pointer based on PathItem definition pointer
							const opDefinitionPointer =
								definitionPointer === pathItemPointer
									? op.ptr // Same file, use operation pointer as-is
									: `${definitionPointer}/${op.method}`; // Different file, append method

							operationRefs.push({
								uri: op.uri, // Reference URI (where PathItem $ref is)
								pointer: op.ptr, // Reference pointer
								definitionUri: opDefinitionUri,
								definitionPointer: opDefinitionPointer,
								referenceUri: hasRef ? op.uri : undefined,
								referencePointer: hasRef ? op.ptr : undefined,
								method: op.method,
								node: opNode as any,
							});
						}
					}
					if (operationRefs.length > 0) {
						operationsByOwner.set(ownerKey, operationRefs);
					}
				}
			}
		}

		// Build component maps
		for (const component of atoms.components ?? []) {
			if (!component || !component.ptr || !component.uri || !component.name) {
				continue;
			}
			const node = findNodeByPointer(ir, component.ptr);
			if (!node) {
				continue;
			}
			const componentRef: ComponentRef = {
				uri: component.uri,
				pointer: component.ptr,
				node: node as any,
			};
			const componentMap = components[component.type];
			if (componentMap) {
				componentMap.set(component.name, componentRef);
			}
		}

		// Build schema map
		for (const schema of atoms.schemas ?? []) {
			if (!schema || !schema.ptr || !schema.uri) {
				continue;
			}
			const node = findNodeByPointer(ir, schema.ptr);
			if (node) {
				const key = `${schema.uri}#${schema.ptr}`;
				schemas.set(key, {
					uri: schema.uri,
					pointer: schema.ptr,
					node: node as any,
				});
			}
		}

		// Build security requirements map
		for (const scheme of atoms.securitySchemes ?? []) {
			if (!scheme || !scheme.ptr || !scheme.uri) {
				continue;
			}
			const node = findNodeByPointer(ir, scheme.ptr);
			if (node) {
				const key = `${scheme.uri}#${scheme.ptr}`;
				securityRequirements.set(key, {
					uri: scheme.uri,
					pointer: scheme.ptr,
					node: node as any,
					level: "root" as const,
				});
			}
		}

		// Build references map from graph
		try {
			const refEdges = project.graph.getRefEdgesFrom(uri) ?? [];
			for (const edge of refEdges) {
				if (!edge || !edge.fromPtr || !edge.fromUri || !edge.ref) {
					continue;
				}
				const node = findNodeByPointer(ir, edge.fromPtr);
				if (node) {
					const key = `${edge.fromUri}#${edge.fromPtr}`;
					references.set(key, {
						uri: edge.fromUri,
						pointer: edge.fromPtr,
						refPointer: edge.fromPtr,
						ref: edge.ref,
						node: node as any,
					});
				}
			}
		} catch {
			// Skip if graph access fails
		}
	}

	// Determine version from documents
	let version = "unknown";
	for (const doc of documents.values()) {
		if (doc && typeof doc === "object" && "openapi" in doc) {
			const openapi = doc.openapi;
			if (typeof openapi === "string") {
				if (openapi.startsWith("3.2")) {
					version = "3.2";
					break;
				}
				if (openapi.startsWith("3.1")) {
					version = "3.1";
					break;
				}
				if (openapi.startsWith("3.0")) {
					version = "3.0";
					break;
				}
			}
		}
	}

	// Ensure all required index properties are initialized (even if empty)
	const index: import("../rules/types.js").ProjectContext["index"] = {
		version,
		pathsByString: pathsByString ?? new Map(),
		pathItemsToPaths: pathItemsToPaths ?? new Map(),
		operationsByOwner: operationsByOwner ?? new Map(),
		components: components ?? {
			schemas: new Map(),
			responses: new Map(),
			parameters: new Map(),
			examples: new Map(),
			requestBodies: new Map(),
			headers: new Map(),
			securitySchemes: new Map(),
			links: new Map(),
			callbacks: new Map(),
		},
		schemas: schemas ?? new Map(),
		parameters: parameters ?? new Map(),
		responses: responses ?? new Map(),
		requestBodies: requestBodies ?? new Map(),
		headers: headers ?? new Map(),
		mediaTypes: mediaTypes ?? new Map(),
		securityRequirements: securityRequirements ?? new Map(),
		examples: examples ?? new Map(),
		links: links ?? new Map(),
		callbacks: callbacks ?? new Map(),
		references: references ?? new Map(),
		documents: documents ?? new Map(),
	} as any;

	return index;
}

/**
 * Helper to push to a map's array value.
 */
function pushMap<K, V>(map: Map<K, V[]>, key: K, value: V): void {
	const arr = map.get(key) ?? [];
	arr.push(value);
	map.set(key, arr);
}

/**
 * Create a minimal ProjectContext adapter for backward compatibility.
 * This allows rules to work with IR without major changes.
 */
function createIRProjectAdapter(
	project: IRProjectContext,
	fileUri: string,
): import("../rules/types.js").ProjectContext {
	// Build a proper index from IR atoms
	const index = buildIndexFromIR(project);

	// Convert IR documents to ParsedDocument-like objects with ast property
	const docsAdapter = new Map<string, any>();
	for (const [uri, ir] of project.docs.entries()) {
		try {
			// Convert IR root to plain object for ast
			const ast = getValueAtPointer(ir, "#");
			if (ast && typeof ast === "object") {
				// Create a ParsedDocument-like object
				docsAdapter.set(uri, {
					ast,
					rawText: ir.rawText ?? "",
					uri: ir.uri,
					// Add a stub sourceMap for compatibility
					sourceMap: {
						pointerToRange: (pointer: string) => {
							const node = findNodeByPointer(ir, pointer);
							if (!node) {
								return null;
							}
							// Use Core's locToRange if available
							const range = project.core.locToRange(uri, node.loc);
							return range;
						},
					},
				});
			}
		} catch (error) {
			// Skip if conversion fails
			// Note: In LSP context, warnings should be logged via DiagnosticsLogger
		}
	}

	// GraphIndex now implements RefGraph directly, so use it as-is
	return {
		docs: docsAdapter,
		index,
		resolver: {
			resolve: (fromUri: string, ref: string) => {
				// Simple resolver - could be enhanced
				if (ref.startsWith("#")) {
					return `${fromUri}${ref}`;
				}
				return ref;
			},
		} as any,
		graph: project.graph,
		rootResolver: {
			findRootsForNode: (uri: string) => [uri],
			getPrimaryRoot: (uri: string) => uri,
		} as any,
		version: project.docs.get(fileUri)?.version ?? "unknown",
	};
}

/**
 * Create a rule context that works with IR.
 */
function createIRRuleContext(
	adapterProject: import("../rules/types.js").ProjectContext,
	irProject: IRProjectContext,
	fileUri: string,
	diagnostics: Diagnostic[],
	fixes: FilePatch[],
	rule?: Rule,
): RuleContext {
	const ir = irProject.docs.get(fileUri);
	if (!ir) {
		throw new Error(`IR document not found for ${fileUri}`);
	}

	// Get the adapter document (which has ast property)
	const adapterDoc = adapterProject.docs.get(fileUri);
	if (!adapterDoc) {
		throw new Error(`Adapter document not found for ${fileUri}`);
	}

	// Use the base createRuleContext but override methods to use IR
	const baseContext = createRuleContext(
		adapterProject,
		fileUri,
		diagnostics,
		fixes,
		rule,
	);

	// Override methods to use IR-based implementations
	return {
		...baseContext,
		project: adapterProject,
		file: {
			uri: fileUri,
			document: adapterDoc, // Use adapter document which has ast property
		},
		locate(uri: string, pointer: string): Range | null {
			const doc = irProject.docs.get(uri);
			if (!doc) {
				return null;
			}
			const node = findNodeByPointer(doc, pointer);
			if (!node) {
				return null;
			}
			return irProject.core.locToRange(uri, node.loc);
		},
		offsetToRange(
			uri: string,
			startOffset: number,
			endOffset?: number,
		): Range | null {
			const doc = irProject.docs.get(uri);
			if (!doc) {
				return null;
			}
			const loc: Loc = {
				start: startOffset,
				end: endOffset ?? startOffset + 1,
			};
			return irProject.core.locToRange(uri, loc);
		},
		findKeyRange(
			uri: string,
			parentPointer: string,
			keyName: string,
		): Range | null {
			const doc = irProject.docs.get(uri);
			if (!doc) {
				return null;
			}
			const parentNode = findNodeByPointer(doc, parentPointer);
			if (!parentNode || parentNode.kind !== "object" || !parentNode.children) {
				return null;
			}
			const keyNode = parentNode.children.find(
				(child) => child.key === keyName,
			);
			if (
				!keyNode ||
				keyNode.loc.keyStart === undefined ||
				keyNode.loc.keyEnd === undefined
			) {
				return null;
			}
			return irProject.core.locToRange(uri, {
				start: keyNode.loc.keyStart,
				end: keyNode.loc.keyEnd,
			});
		},
		getRootDocuments(targetUri?: string, pointer?: string): string[] {
			// For IR-based execution, we can use graph to find roots
			const uri = targetUri ?? fileUri;
			if (!uri) {
				return [];
			}
			try {
				const linked = irProject.core.getLinkedUris(uri) ?? [];
				return [uri, ...linked].filter((u) => u != null);
			} catch (error) {
				// Note: In LSP context, warnings should be logged via DiagnosticsLogger
				return [uri];
			}
		},
		getPrimaryRoot(targetUri?: string, pointer?: string): string | null {
			return targetUri ?? fileUri;
		},
	};
}

function dispatch(visitors: Visitors[], kind: keyof Visitors, payload: any) {
	if (!visitors || !Array.isArray(visitors)) {
		return;
	}
	if (!payload) {
		return;
	}
	for (const visitor of visitors) {
		if (!visitor || typeof visitor !== "object") {
			continue;
		}
		try {
			const fn = visitor[kind];
			if (typeof fn === "function") {
				fn(payload as any);
			}
		} catch (error) {
			// Error logged silently - in LSP context, use DiagnosticsLogger
			// Don't let one rule's error break others
		}
	}
}
