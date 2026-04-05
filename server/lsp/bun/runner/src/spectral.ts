import { Spectral, Document } from "@stoplight/spectral-core";
import * as Parsers from "@stoplight/spectral-parsers";
import { oas, asyncapi } from "@stoplight/spectral-rulesets";
import type { SerializedDiagnostic, RuleRunError } from "./types";
import { readFile } from "fs/promises";
import { resolve } from "path";

const spectralCache = new Map<string, Spectral>();

async function getSpectralInstance(rulesetPath: string): Promise<Spectral> {
	const cached = spectralCache.get(rulesetPath);
	if (cached) return cached;

	const spectral = new Spectral();

	if (rulesetPath === "spectral:oas") {
		spectral.setRuleset(oas);
	} else if (rulesetPath === "spectral:asyncapi") {
		spectral.setRuleset(asyncapi);
	} else {
		const resolved = resolve(rulesetPath);
		const content = await readFile(resolved, "utf-8");
		const ruleset = JSON.parse(content);
		spectral.setRuleset(ruleset);
	}

	spectralCache.set(rulesetPath, spectral);
	return spectral;
}

export interface SpectralRunResult {
	diagnostics: SerializedDiagnostic[];
	rulesetTimings: Record<string, number>;
	errors: RuleRunError[];
}

export async function runSpectralRulesets(
	documentURI: string,
	rawText: string,
	format: string,
	rulesetPaths: string[],
): Promise<SpectralRunResult> {
	const diagnostics: SerializedDiagnostic[] = [];
	const rulesetTimings: Record<string, number> = {};
	const errors: RuleRunError[] = [];

	const parser = format === "json" ? Parsers.Json : Parsers.Yaml;
	const doc = new Document(rawText, parser, documentURI);

	for (const rulesetPath of rulesetPaths) {
		const start = performance.now();
		try {
			const spectral = await getSpectralInstance(rulesetPath);
			const results = await spectral.run(doc);

			for (const result of results) {
				const range = result.range;
				diagnostics.push({
					startLine: range.start.line,
					startChar: range.start.character,
					endLine: range.end.line,
					endChar: range.end.character,
					severity: mapSpectralSeverity(result.severity),
					code: result.code?.toString() ?? "spectral",
					message: result.message,
					source: "spectral",
				});
			}
			rulesetTimings[rulesetPath] = performance.now() - start;
		} catch (err) {
			errors.push({
				ruleID: rulesetPath,
				error: String(err),
				phase: "run",
			});
			rulesetTimings[rulesetPath] = performance.now() - start;
		}
	}

	return { diagnostics, rulesetTimings, errors };
}

function mapSpectralSeverity(severity: number): number {
	// Spectral: 0=error, 1=warn, 2=info, 3=hint
	// LSP:      1=error, 2=warn, 3=info, 4=hint
	switch (severity) {
		case 0: return 1;
		case 1: return 2;
		case 2: return 3;
		case 3: return 4;
		default: return 2;
	}
}

export function clearSpectralCache(): void {
	spectralCache.clear();
}
