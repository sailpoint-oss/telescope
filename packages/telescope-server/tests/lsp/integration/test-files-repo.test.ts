import { beforeEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Range } from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import YAML from "yaml";
import { runEngine } from "../../../src/engine/execution/runner.js";
import { runGenericRules } from "../../../src/engine/index.js";
import type {
	AtomIndex,
	OperationAtom,
} from "../../../src/engine/indexes/atoms.js";
import type { GraphIndex } from "../../../src/engine/indexes/graph.js";
import type {
	ComponentRef,
	OperationRef,
	PathItemRef,
	ProjectIndex,
	ReferenceRef,
	SchemaRef,
	SecurityRequirementRef,
} from "../../../src/engine/indexes/types.js";
import {
	findNodeByPointer,
	getValueAtPointer,
} from "../../../src/engine/ir/context.js";
import type { IRDocument, Loc } from "../../../src/engine/ir/types.js";
import type { ProjectContext } from "../../../src/engine/rules/types.js";
import type { ParsedDocument, SourceMap } from "../../../src/engine/types.js";
import { telescopeVolarContext } from "../../../src/lsp/workspace/context.js";

/** Helper to convert IR data to ProjectContext for tests */
function createTestProjectContext(
	irDocs: Map<string, IRDocument>,
	irAtoms: Map<string, AtomIndex>,
	graph: GraphIndex,
	core: {
		locToRange(uri: string, loc: Loc): Range | null;
		getLinkedUris(uri: string): string[];
	},
): ProjectContext {
	const docs = new Map<string, ParsedDocument>();
	for (const [uri, ir] of irDocs.entries()) {
		const ast = getValueAtPointer(ir, "#");
		const sourceMap: SourceMap = {
			pointerToRange: (pointer: string) => {
				const node = findNodeByPointer(ir, pointer);
				if (!node) return null;
				return core.locToRange(uri, node.loc);
			},
			rangeToPointer: () => null,
		};
		docs.set(uri, {
			uri,
			format: ir.format ?? "yaml",
			version: ir.version ?? "3.0",
			ast: ast as Record<string, unknown>,
			ir,
			sourceMap,
			rawText: ir.rawText ?? "",
			hash: "",
			mtimeMs: 0,
		});
	}
	const index = buildTestIndex(irDocs, irAtoms, graph);
	return {
		docs,
		index,
		resolver: {
			resolve: (fromUri: string, ref: string) =>
				ref.startsWith("#") ? `${fromUri}${ref}` : ref,
			deref: () => null,
		} as any,
		graph,
		rootResolver: {
			findRootsForNode: (uri: string) => [uri],
			getPrimaryRoot: (uri: string) => uri,
		} as any,
		version: "3.0",
	};
}

/** Build a minimal ProjectIndex from atoms for testing */
function buildTestIndex(
	irDocs: Map<string, IRDocument>,
	irAtoms: Map<string, AtomIndex>,
	graph: GraphIndex,
): ProjectIndex {
	const operationsByOwner = new Map<string, OperationRef[]>();
	const pathsByString = new Map<string, PathItemRef[]>();
	const schemas = new Map<string, SchemaRef>();
	const references = new Map<string, ReferenceRef>();
	const documents = new Map<string, Record<string, unknown>>();

	for (const [uri, ir] of irDocs.entries()) {
		const atoms = irAtoms.get(uri);
		if (!atoms) continue;
		const rootValue = getValueAtPointer(ir, "#");
		if (rootValue && typeof rootValue === "object")
			documents.set(uri, rootValue as Record<string, unknown>);

		// Group operations by path
		const operationsByPath = new Map<string, OperationAtom[]>();
		for (const op of atoms.operations ?? []) {
			if (!op?.path) continue;
			const pathOps = operationsByPath.get(op.path) ?? [];
			pathOps.push(op);
			operationsByPath.set(op.path, pathOps);
		}

		for (const [path, pathOps] of operationsByPath.entries()) {
			const pathsNode = findNodeByPointer(ir, "#/paths");
			if (pathsNode?.kind === "object" && pathsNode.children) {
				const pathItemNode = pathsNode.children.find(
					(child) => child?.key === path,
				);
				if (pathItemNode?.ptr) {
					const pathItemRef: PathItemRef = {
						uri,
						pointer: pathItemNode.ptr,
						definitionUri: uri,
						definitionPointer: pathItemNode.ptr,
						node: pathItemNode as any,
					};
					const arr = pathsByString.get(path) ?? [];
					arr.push(pathItemRef);
					pathsByString.set(path, arr);

					const ownerKey = `${uri}#${pathItemNode.ptr}`;
					const operationRefs: OperationRef[] = [];
					for (const op of pathOps) {
						if (!op?.ptr) continue;
						const opNode = findNodeByPointer(ir, op.ptr);
						if (opNode && op.uri && op.method) {
							operationRefs.push({
								uri: op.uri,
								pointer: op.ptr,
								definitionUri: uri,
								definitionPointer: op.ptr,
								method: op.method,
								node: opNode as any,
							});
						}
					}
					if (operationRefs.length > 0)
						operationsByOwner.set(ownerKey, operationRefs);
				}
			}
		}

		for (const schema of atoms.schemas ?? []) {
			if (!schema?.ptr || !schema.uri) continue;
			const node = findNodeByPointer(ir, schema.ptr);
			if (node)
				schemas.set(`${schema.uri}#${schema.ptr}`, {
					uri: schema.uri,
					pointer: schema.ptr,
					node: node as any,
				});
		}
	}

	return {
		version: "3.0",
		pathsByString,
		pathItemsToPaths: new Map(),
		operationsByOwner,
		components: {
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
		schemas,
		parameters: new Map(),
		responses: new Map(),
		requestBodies: new Map(),
		headers: new Map(),
		mediaTypes: new Map(),
		securityRequirements: new Map(),
		examples: new Map(),
		links: new Map(),
		callbacks: new Map(),
		references,
		documents,
	} as ProjectIndex;
}

describe("Test Files Integration", () => {
	// import.meta.dir is the directory containing this test file (tests/lsp/integration/)
	// From there we need to go up to reach packages/test-files
	const testFilesRoot = join(
		import.meta.dir,
		"../../../../../packages/test-files",
	);
	let context: telescopeVolarContext;

	beforeEach(async () => {
		context = new telescopeVolarContext();
		const workspaceRoot = URI.file(testFilesRoot);
		context.setWorkspaceFolders([workspaceRoot]);
		// Wait for rules to load
		await context.rulesLoadPromise;
	});

	it("should load configuration correctly", () => {
		const config = context.getConfig();
		expect(config.openapi).toBeDefined();
		// Config specifies patterns for openapi/ subdirectory
		expect(config.openapi?.patterns).toContain("openapi/**/*.yaml");
		expect(config.additionalValidation).toBeDefined();
		if (!config.additionalValidation)
			throw new Error("Additional validation is not defined");
		// Check that at least one validation group is defined
		expect(Object.keys(config.additionalValidation).length).toBeGreaterThan(0);
	});

	it("should load custom OpenAPI rules", () => {
		const rules = context.getResolvedRules();

		console.log(rules);

		const hasCustomRules = rules.some((r) => r.id.includes("custom"));

		expect(rules.length).toBeGreaterThan(0);
		expect(hasCustomRules).toBeTrue();
	});

	it("should load validation rules (Schemas)", () => {
		const validationRules = context.getValidationRules();
		console.log(validationRules);
		// Check that validation rules are loaded (may be empty if no schemas are configured)
		expect(Array.isArray(validationRules)).toBe(true);

		// If we have validation rules, check they have the required properties
		if (validationRules.length > 0) {
			const typeBoxRule = validationRules.find((r) => r.typeBoxSchema);
			const jsonRule = validationRules.find((r) => r.jsonSchema);
			// At least one type of schema should be defined
			expect(typeBoxRule || jsonRule).toBeDefined();
		}
	});

	it("should load generic rules", () => {
		const genericRules = context.getGenericRules();
		expect(genericRules.length).toBeGreaterThan(0);
		const customGeneric = genericRules.find(
			(r) => r.meta.id === "custom-version-required",
		);
		expect(customGeneric).toBeDefined();
	});

	// Functional Test: OpenAPI Custom Rule
	it("should validate OpenAPI files with custom rule", async () => {
		const validFile = join(testFilesRoot, "openapi/custom-openapi-valid.yaml");
		const invalidFile = join(
			testFilesRoot,
			"openapi/custom-openapi-invalid.yaml",
		);
		const validUri = URI.file(validFile).toString();
		const invalidUri = URI.file(invalidFile).toString();

		// Load content
		const validContent = readFileSync(validFile, "utf-8");
		const invalidContent = readFileSync(invalidFile, "utf-8");

		// Get all resolved rules including custom ones
		const rules = context.getRuleImplementations();

		// Verify custom rule is loaded
		const customRule = rules.find(
			(r) => r.meta.id === "custom-operation-summary",
		);
		expect(customRule).toBeDefined();

		// Create project contexts using the engine's test utilities approach
		// For the valid file - use loadDocument and build refs/index
		const { loadDocument, buildRefGraph, buildIndex } = await import(
			"../../../src/engine/index.js"
		);
		const { MemoryFileSystem } = await import(
			"../../../src/engine/utils/file-system-utils.js"
		);

		// Test valid file - should have no custom rule diagnostics
		const validFs = new MemoryFileSystem();
		validFs.addFile(validUri, validContent);
		const validDoc = await loadDocument({ fileSystem: validFs, uri: validUri });
		const validDocs = new Map([[validUri, validDoc]]);
		const validRefs = buildRefGraph({ docs: validDocs });
		const validIndex = buildIndex({
			docs: validDocs,
			graph: validRefs.graph,
			resolver: validRefs.resolver,
		});
		const validProject: ProjectContext = {
			docs: validDocs,
			index: validIndex,
			resolver: validRefs.resolver,
			graph: validRefs.graph,
			rootResolver: validRefs.rootResolver,
			version: validIndex.version,
		};

		const validResult = runEngine(validProject, [validUri], { rules });
		// Rule code includes the number prefix: rule-999-custom-operation-summary
		const validCustomDiags = validResult.diagnostics.filter(
			(d) =>
				d.code === "custom-operation-summary" ||
				d.code?.includes("custom-operation-summary"),
		);
		// Valid file has summaries on all operations, should have no errors
		expect(validCustomDiags.length).toBe(0);

		// Test invalid file - should have custom rule diagnostics
		const invalidFs = new MemoryFileSystem();
		invalidFs.addFile(invalidUri, invalidContent);
		const invalidDoc = await loadDocument({
			fileSystem: invalidFs,
			uri: invalidUri,
		});
		const invalidDocs = new Map([[invalidUri, invalidDoc]]);
		const invalidRefs = buildRefGraph({ docs: invalidDocs });
		const invalidIndex = buildIndex({
			docs: invalidDocs,
			graph: invalidRefs.graph,
			resolver: invalidRefs.resolver,
		});
		const invalidProject: ProjectContext = {
			docs: invalidDocs,
			index: invalidIndex,
			resolver: invalidRefs.resolver,
			graph: invalidRefs.graph,
			rootResolver: invalidRefs.rootResolver,
			version: invalidIndex.version,
		};

		const invalidResult = runEngine(invalidProject, [invalidUri], { rules });
		// Rule code includes the number prefix: rule-999-custom-operation-summary
		const invalidCustomDiags = invalidResult.diagnostics.filter(
			(d) =>
				d.code === "custom-operation-summary" ||
				d.code?.includes("custom-operation-summary"),
		);
		// Invalid file is missing summary on GET /pets, should have at least one error
		expect(invalidCustomDiags.length).toBeGreaterThan(0);
	});

	// Functional Test: Generic Rule
	it("should validate files with generic rule", async () => {
		const validFile = join(testFilesRoot, "custom/custom-generic-valid.yaml");
		const invalidFile = join(
			testFilesRoot,
			"custom/custom-generic-invalid.yaml",
		);
		const validUri = URI.file(validFile).toString();
		const invalidUri = URI.file(invalidFile).toString();

		const validContent = readFileSync(validFile, "utf-8");
		const invalidContent = readFileSync(invalidFile, "utf-8");

		const genericRules = context.getGenericRules();
		expect(genericRules.length).toBeGreaterThan(0);

		const validAst = YAML.parse(validContent);
		const invalidAst = YAML.parse(invalidContent);

		const validResult = await runGenericRules(
			validUri,
			validAst,
			validContent,
			{ rules: genericRules },
		);
		expect(validResult.diagnostics.length).toBe(0);

		const invalidResult = await runGenericRules(
			invalidUri,
			invalidAst,
			invalidContent,
			{ rules: genericRules },
		);
		expect(invalidResult.diagnostics.length).toBeGreaterThan(0);
		if (!invalidResult.diagnostics[0]) throw new Error("No diagnostics found");
		expect(invalidResult.diagnostics[0].code).toBe("custom-version-required");
	});
});
