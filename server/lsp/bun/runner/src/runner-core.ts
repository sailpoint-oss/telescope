import type {
	Envelope,
	LoadRulesRequest,
	RunRulesRequest,
	RunSpectralRequest,
	ValidateSchemaRequest,
	SerializedDiagnostic,
	RuleRunError,
	LoadedRule,
} from "./types";
import { buildRuleContext, buildGenericContext } from "./context";
import { runOpenAPIRule, runGenericRule } from "./engine";
import { runSpectralRulesets } from "./spectral";
import {
	validateWithJsonSchema,
	validateWithZod,
} from "./schema-validator";

export interface RunnerState {
	loadedRules: Map<string, LoadedRule>;
	workDir: string;
}

export interface RunnerDeps {
	send: (envelope: Envelope) => void;
	end?: () => void;
	requestExit?: (code: number) => void;
	importModule?: (path: string) => Promise<Record<string, unknown>>;
	runOpenAPIRule?: typeof runOpenAPIRule;
	runGenericRule?: typeof runGenericRule;
	runSpectralRulesets?: typeof runSpectralRulesets;
	validateWithJsonSchema?: typeof validateWithJsonSchema;
	validateWithZod?: typeof validateWithZod;
	now?: () => number;
}

const defaultImportModule = (path: string) => import(path);

function resolveDeps(deps: RunnerDeps) {
	return {
		...deps,
		importModule: deps.importModule ?? defaultImportModule,
		runOpenAPIRule: deps.runOpenAPIRule ?? runOpenAPIRule,
		runGenericRule: deps.runGenericRule ?? runGenericRule,
		runSpectralRulesets: deps.runSpectralRulesets ?? runSpectralRulesets,
		validateWithJsonSchema: deps.validateWithJsonSchema ?? validateWithJsonSchema,
		validateWithZod: deps.validateWithZod ?? validateWithZod,
		now: deps.now ?? (() => performance.now()),
	};
}

export function createRunnerState(initialWorkDir = process.cwd()): RunnerState {
	return {
		loadedRules: new Map<string, LoadedRule>(),
		workDir: initialWorkDir,
	};
}

export async function handleMessage(
	envelope: Envelope,
	state: RunnerState,
	deps: RunnerDeps,
): Promise<void> {
	const resolved = resolveDeps(deps);

	switch (envelope.type) {
		case "loadRules":
			await handleLoadRules(envelope, state, resolved);
			break;
		case "runRules":
			await handleRunRules(envelope, state, resolved);
			break;
		case "runSpectral":
			await handleRunSpectral(envelope, resolved);
			break;
		case "validateSchema":
			await handleValidateSchema(envelope, resolved);
			break;
		case "ping":
			resolved.send({ id: envelope.id, type: "pong" });
			break;
		case "shutdown":
			resolved.end?.();
			resolved.requestExit?.(0);
			break;
	}
}

async function handleLoadRules(
	envelope: Envelope,
	state: RunnerState,
	deps: ReturnType<typeof resolveDeps>,
): Promise<void> {
	const req = envelope.payload as LoadRulesRequest;
	state.workDir = req.workDir || state.workDir;
	const errors: RuleRunError[] = [];

	for (const ruleConfig of req.rules) {
		try {
			const resolvedPath = ruleConfig.path.startsWith("/")
				? ruleConfig.path
				: `${state.workDir}/${ruleConfig.path}`;

			const mod = await deps.importModule(resolvedPath);
			const rule = mod.default;

			state.loadedRules.set(ruleConfig.id, {
				config: ruleConfig,
				rule,
				kind: ruleConfig.kind,
			});
		} catch (err) {
			errors.push({
				ruleID: ruleConfig.id,
				error: String(err),
				phase: "load",
			});
		}
	}

	deps.send({
		id: envelope.id,
		type: "loadResponse",
		payload: { ruleCount: state.loadedRules.size, errors },
	});
}

async function handleRunRules(
	envelope: Envelope,
	state: RunnerState,
	deps: ReturnType<typeof resolveDeps>,
): Promise<void> {
	const req = envelope.payload as RunRulesRequest;
	const allDiagnostics: SerializedDiagnostic[] = [];
	const timings: Record<string, number> = {};
	const errors: RuleRunError[] = [];

	for (const ruleID of req.ruleIDs) {
		const loaded = state.loadedRules.get(ruleID);
		if (!loaded) continue;

		const start = deps.now();
		try {
			switch (loaded.kind) {
				case "openapi": {
					const ctx = buildRuleContext(req);
					ctx._defaultCode =
						(loaded.rule as { meta?: { id?: string } })?.meta?.id ?? ruleID;
					deps.runOpenAPIRule(
						loaded.rule as { check: (ctx: any) => any },
						ctx,
						req.document,
						req.project,
					);
					allDiagnostics.push(...ctx._diagnostics);
					break;
				}
				case "generic": {
					const ctx = buildGenericContext(req);
					ctx._defaultCode =
						(loaded.rule as { meta?: { id?: string } })?.meta?.id ?? ruleID;
					deps.runGenericRule(
						loaded.rule as { create: (ctx: any) => any },
						ctx,
						req.document,
					);
					allDiagnostics.push(...ctx._diagnostics);
					break;
				}
			}
			timings[ruleID] = deps.now() - start;
		} catch (err) {
			errors.push({ ruleID, error: String(err), phase: "run" });
			timings[ruleID] = deps.now() - start;
		}
	}

	deps.send({
		id: envelope.id,
		type: "ruleResult",
		payload: {
			documentURI: req.documentURI,
			diagnostics: allDiagnostics,
			ruleTimings: timings,
			errors,
		},
	});
}

async function handleRunSpectral(
	envelope: Envelope,
	deps: ReturnType<typeof resolveDeps>,
): Promise<void> {
	const req = envelope.payload as RunSpectralRequest;
	const result = await deps.runSpectralRulesets(
		req.documentURI,
		req.document.rawText,
		req.document.format,
		req.rulesetPaths,
	);

	deps.send({
		id: envelope.id,
		type: "spectralResult",
		payload: {
			documentURI: req.documentURI,
			diagnostics: result.diagnostics,
			rulesetTimings: result.rulesetTimings,
			errors: result.errors,
		},
	});
}

async function handleValidateSchema(
	envelope: Envelope,
	deps: ReturnType<typeof resolveDeps>,
): Promise<void> {
	const req = envelope.payload as ValidateSchemaRequest;
	let result: {
		diagnostics: SerializedDiagnostic[];
		errors: RuleRunError[];
	};

	switch (req.schemaType) {
		case "json-schema":
			result = await deps.validateWithJsonSchema(req);
			break;
		case "zod":
			result = await deps.validateWithZod(req);
			break;
		default:
			result = {
				diagnostics: [],
				errors: [
					{
						ruleID: `schema:${req.groupName}`,
						error: `Unknown schema type: ${req.schemaType}`,
						phase: "run",
					},
				],
			};
	}

	deps.send({
		id: envelope.id,
		type: "validateResult",
		payload: {
			documentURI: req.documentURI,
			diagnostics: result.diagnostics,
			errors: result.errors,
		},
	});
}
