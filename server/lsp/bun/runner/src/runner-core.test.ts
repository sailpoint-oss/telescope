import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createRunnerState, handleMessage } from "./runner-core";
import type {
	Envelope,
	RunRulesRequest,
	SerializedDiagnostic,
} from "./types";

const mockDoc = {
	uri: "file:///test.yaml",
	ast: {
		openapi: "3.1.0",
		info: { title: "Test", version: "1.0.0" },
		paths: {},
	},
	rawText: "openapi: 3.1.0\ninfo:\n  title: Test\n  version: 1.0.0\npaths: {}\n",
	format: "yaml",
	version: "3.1.0",
	pointers: {
		"": [0, 0, 0, 0],
	},
};

const mockRunRequest: RunRulesRequest = {
	documentURI: mockDoc.uri,
	ruleIDs: [],
	document: mockDoc,
	project: {
		operationIds: {},
		componentRefs: {},
		tags: {},
	},
};

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function makeRuleDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "telescope-runner-"));
	tempDirs.push(dir);
	return dir;
}

function makeRecorder() {
	const sent: Envelope[] = [];
	let exitCode: number | undefined;
	let endCalled = false;

	return {
		sent,
		get exitCode() {
			return exitCode;
		},
		get endCalled() {
			return endCalled;
		},
		deps: {
			send: (envelope: Envelope) => sent.push(envelope),
			end: () => {
				endCalled = true;
			},
			requestExit: (code: number) => {
				exitCode = code;
			},
		},
	};
}

describe("runner-core handleMessage", () => {
	test("loads rules, runs them, and reports load/run errors", async () => {
		const dir = makeRuleDir();
		writeFileSync(
			join(dir, "generic-rule.ts"),
			`export default {
				meta: { id: "generic-meta" },
				create(ctx) {
					return {
						Document() {
							ctx.report({
								message: "generic issue",
								range: {
									start: { line: 0, character: 0 },
									end: { line: 0, character: 1 },
								},
							});
						},
					};
				},
			};`,
		);
		writeFileSync(
			join(dir, "openapi-rule.ts"),
			`export default {
				meta: { id: "openapi-meta" },
				check(ctx) {
					return {
						Root() {
							ctx.report({
								message: "openapi issue",
								range: {
									start: { line: 0, character: 0 },
									end: { line: 0, character: 1 },
								},
							});
						},
					};
				},
			};`,
		);
		writeFileSync(
			join(dir, "failing-rule.ts"),
			`export default {
				create() {
					throw new Error("boom");
				},
			};`,
		);

		const state = createRunnerState();
		const recorder = makeRecorder();
		let tick = 0;

		await handleMessage(
			{
				id: "load-1",
				type: "loadRules",
				payload: {
					workDir: dir,
					rules: [
						{ id: "generic-rule", path: "generic-rule.ts", kind: "generic" },
						{ id: "openapi-rule", path: "openapi-rule.ts", kind: "openapi" },
						{ id: "failing-rule", path: "failing-rule.ts", kind: "generic" },
						{ id: "missing-rule", path: "missing-rule.ts", kind: "generic" },
					],
				},
			},
			state,
			{
				...recorder.deps,
				now: () => {
					tick += 5;
					return tick;
				},
			},
		);

		const loadResponse = recorder.sent[0];
		expect(loadResponse.type).toBe("loadResponse");
		expect((loadResponse.payload as any).ruleCount).toBe(3);
		expect((loadResponse.payload as any).errors).toHaveLength(1);
		expect((loadResponse.payload as any).errors[0].ruleID).toBe("missing-rule");

		await handleMessage(
			{
				id: "run-1",
				type: "runRules",
				payload: {
					...mockRunRequest,
					ruleIDs: ["generic-rule", "openapi-rule", "failing-rule", "not-loaded"],
				},
			},
			state,
			{
				...recorder.deps,
				now: () => {
					tick += 5;
					return tick;
				},
			},
		);

		const result = recorder.sent[1];
		expect(result.type).toBe("ruleResult");
		const payload = result.payload as {
			documentURI: string;
			diagnostics: SerializedDiagnostic[];
			ruleTimings: Record<string, number>;
			errors: Array<{ ruleID: string }>;
		};
		expect(payload.documentURI).toBe(mockDoc.uri);
		expect(payload.diagnostics.map((diag) => diag.code)).toEqual([
			"generic-meta",
			"openapi-meta",
		]);
		expect(payload.errors).toHaveLength(1);
		expect(payload.errors[0].ruleID).toBe("failing-rule");
		expect(Object.keys(payload.ruleTimings).sort()).toEqual([
			"failing-rule",
			"generic-rule",
			"openapi-rule",
		]);
	});

	test("routes spectral, schema, ping, and shutdown messages", async () => {
		const state = createRunnerState();
		const recorder = makeRecorder();

		await handleMessage(
			{
				id: "spectral-1",
				type: "runSpectral",
				payload: {
					documentURI: mockDoc.uri,
					document: mockDoc,
					rulesetPaths: ["spectral:oas"],
				},
			},
			state,
			{
				...recorder.deps,
				runSpectralRulesets: async () => ({
					diagnostics: [
						{
							startLine: 0,
							startChar: 0,
							endLine: 0,
							endChar: 1,
							severity: 2,
							code: "spectral-rule",
							message: "spectral issue",
							source: "spectral",
						},
					],
					rulesetTimings: { "spectral:oas": 1.5 },
					errors: [],
				}),
			},
		);

		await handleMessage(
			{
				id: "validate-1",
				type: "validateSchema",
				payload: {
					documentURI: mockDoc.uri,
					document: mockDoc,
					schemaPath: "/tmp/schema.json",
					schemaType: "json-schema",
					groupName: "group-a",
				},
			},
			state,
			{
				...recorder.deps,
				validateWithJsonSchema: async () => ({
					diagnostics: [],
					errors: [],
				}),
			},
		);

		await handleMessage(
			{
				id: "validate-2",
				type: "validateSchema",
				payload: {
					documentURI: mockDoc.uri,
					document: mockDoc,
					schemaPath: "/tmp/schema.ts",
					schemaType: "unknown" as "json-schema",
					groupName: "group-b",
				},
			},
			state,
			recorder.deps,
		);

		await handleMessage({ id: "ping-1", type: "ping" }, state, recorder.deps);
		await handleMessage({ id: "shutdown-1", type: "shutdown" }, state, recorder.deps);

		expect(recorder.sent.map((envelope) => envelope.type)).toEqual([
			"spectralResult",
			"validateResult",
			"validateResult",
			"pong",
		]);
		expect((recorder.sent[2].payload as any).errors[0].ruleID).toBe("schema:group-b");
		expect(recorder.endCalled).toBe(true);
		expect(recorder.exitCode).toBe(0);
	});
});
