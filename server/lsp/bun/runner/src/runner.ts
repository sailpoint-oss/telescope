import { connect } from "net";
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

const socketPath = process.env.TELESCOPE_SOCKET;
if (!socketPath) {
	console.error("TELESCOPE_SOCKET not set");
	process.exit(1);
}

const loadedRules = new Map<string, LoadedRule>();
let workDir = process.cwd();

const socket = connect(socketPath);
let buffer = "";

function send(envelope: Envelope): void {
	socket.write(JSON.stringify(envelope) + "\n");
}

socket.on("connect", () => {
	send({ id: "init", type: "ready" });
});

socket.on("data", (data) => {
	buffer += data.toString();
	const lines = buffer.split("\n");
	buffer = lines.pop() ?? "";

	for (const line of lines) {
		if (!line.trim()) continue;
		try {
			const envelope = JSON.parse(line) as Envelope;
			handleMessage(envelope).catch((err) => {
				console.error("Error handling message:", err);
			});
		} catch {
			console.error("Failed to parse message:", line);
		}
	}
});

socket.on("error", (err) => {
	console.error("Socket error:", err);
	process.exit(1);
});

socket.on("close", () => {
	process.exit(0);
});

async function handleMessage(envelope: Envelope): Promise<void> {
	switch (envelope.type) {
		case "loadRules":
			await handleLoadRules(envelope);
			break;
		case "runRules":
			await handleRunRules(envelope);
			break;
		case "runSpectral":
			await handleRunSpectral(envelope);
			break;
		case "validateSchema":
			await handleValidateSchema(envelope);
			break;
		case "ping":
			send({ id: envelope.id, type: "pong" });
			break;
		case "shutdown":
			socket.end();
			process.exit(0);
			break;
	}
}

async function handleLoadRules(envelope: Envelope): Promise<void> {
	const req = envelope.payload as LoadRulesRequest;
	workDir = req.workDir || workDir;
	const errors: RuleRunError[] = [];

	for (const ruleConfig of req.rules) {
		try {
			const resolvedPath = ruleConfig.path.startsWith("/")
				? ruleConfig.path
				: `${workDir}/${ruleConfig.path}`;

			const mod = await import(resolvedPath);
			const rule = mod.default;

			loadedRules.set(ruleConfig.id, {
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

	send({
		id: envelope.id,
		type: "loadResponse",
		payload: { ruleCount: loadedRules.size, errors },
	});
}

async function handleRunRules(envelope: Envelope): Promise<void> {
	const req = envelope.payload as RunRulesRequest;
	const allDiagnostics: SerializedDiagnostic[] = [];
	const timings: Record<string, number> = {};
	const errors: RuleRunError[] = [];

	for (const ruleID of req.ruleIDs) {
		const loaded = loadedRules.get(ruleID);
		if (!loaded) continue;

		const start = performance.now();
		try {
			switch (loaded.kind) {
				case "openapi": {
					const ctx = buildRuleContext(req);
					ctx._defaultCode =
						(loaded.rule as { meta?: { id?: string } })?.meta?.id ?? ruleID;
					runOpenAPIRule(
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
					runGenericRule(
						loaded.rule as { create: (ctx: any) => any },
						ctx,
						req.document,
					);
					allDiagnostics.push(...ctx._diagnostics);
					break;
				}
			}
			timings[ruleID] = performance.now() - start;
		} catch (err) {
			errors.push({ ruleID, error: String(err), phase: "run" });
			timings[ruleID] = performance.now() - start;
		}
	}

	send({
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

async function handleRunSpectral(envelope: Envelope): Promise<void> {
	const req = envelope.payload as RunSpectralRequest;
	const result = await runSpectralRulesets(
		req.documentURI,
		req.document.rawText,
		req.document.format,
		req.rulesetPaths,
	);

	send({
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

async function handleValidateSchema(envelope: Envelope): Promise<void> {
	const req = envelope.payload as ValidateSchemaRequest;
	let result: {
		diagnostics: SerializedDiagnostic[];
		errors: RuleRunError[];
	};

	switch (req.schemaType) {
		case "json-schema":
			result = await validateWithJsonSchema(req);
			break;
		case "zod":
			result = await validateWithZod(req);
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

	send({
		id: envelope.id,
		type: "validateResult",
		payload: {
			documentURI: req.documentURI,
			diagnostics: result.diagnostics,
			errors: result.errors,
		},
	});
}

