import type {
	LanguageServicePlugin,
	LanguageServicePluginInstance,
} from "@volar/language-service";
import { URI } from "vscode-uri";
import z from "zod";
import { ConfigVirtualCode } from "../../languages/config/config-virtual-code.js";
import type { ApertureVolarContext } from "../../workspace/context.js";
import {
	createSingleSchemaYamlService,
	type ProvideYaml,
} from "../shared/yaml-language-service.js";
import { zodErrorsToDiagnostics } from "../shared/zod-to-diag.js";
import { TelescopeConfigSchema } from "./config-schema.js";

const ConfigSchema = z.toJSONSchema(TelescopeConfigSchema) as Record<
	string,
	unknown
>;

/**
 * Create the config service plugin for Telescope configuration files.
 * Uses a single schema for all config files since pattern matching happens upstream.
 */
export function createConfigServicePlugin(
	shared: ApertureVolarContext,
): LanguageServicePlugin<ProvideYaml> {
	const logger = shared.getLogger("Config Service");
	logger.log(`Creating config service plugin`);

	// Create the base YAML service with our schema
	const yamlService = createSingleSchemaYamlService({
		name: "config",
		schema: ConfigSchema,
		documentSelector: [
			{ language: "yaml", pattern: "**/.telescope/config.yaml" },
		],
	});

	return {
		...yamlService,
		name: "config",
		// Override create to inject our custom Zod validation
		create(context): LanguageServicePluginInstance<ProvideYaml> {
			const baseInstance = yamlService.create(context);

			return {
				...baseInstance,
				async provideDiagnostics(document, token) {
					// 1. Run standard YAML validation (JSON Schema)
					let baseDiagnostics =
						(await baseInstance.provideDiagnostics?.(document, token)) ?? [];

					// Filter out "DisallowedExtraPropWarning" since Zod covers strict property validation
					// We also filter code 513 which is sometimes used for this error
					baseDiagnostics = baseDiagnostics.filter(
						(d) => d.code !== "DisallowedExtraPropWarning" && d.code !== 513,
					);

					if (token?.isCancellationRequested) {
						return baseDiagnostics;
					}

					// 2. Run custom Zod validation
					const decoded = context.decodeEmbeddedDocumentUri(
						URI.parse(document.uri),
					);

					if (!decoded) {
						return baseDiagnostics;
					}

					const [sourceUri, embeddedCodeId] = decoded;

					// Get source script
					const sourceScript = context.language.scripts.get(sourceUri);
					if (!sourceScript) {
						return baseDiagnostics;
					}

					// Get VirtualCode
					const virtualCode =
						sourceScript.generated?.embeddedCodes.get(embeddedCodeId);

					// Ensure we are working with our ConfigVirtualCode to access the AST
					if (!(virtualCode instanceof ConfigVirtualCode)) {
						return baseDiagnostics;
					}

					// Access the cached AST and LineCounter directly from the virtual code
					const ast = virtualCode.ast;
					const lineCounter = virtualCode.lineCounter;

					if (!ast || !lineCounter) {
						return baseDiagnostics;
					}

					// Convert AST to JS object for Zod validation
					const jsObject = ast.toJS();

					const result = TelescopeConfigSchema.safeParse(jsObject);

					if (!result.success) {
						// Convert Zod errors to diagnostics using the cached AST and LineCounter
						// This allows us to map the errors back to the exact source location
						const zodDiagnostics = zodErrorsToDiagnostics(
							result.error,
							ast,
							lineCounter,
							"telescope-config",
							TelescopeConfigSchema,
						);

						return [...baseDiagnostics, ...zodDiagnostics];
					}

					return baseDiagnostics;
				},
			};
		},
	};
}

export function isConfigFile(uri: string): boolean {
	const normalized = uri.replace(/\\/g, "/").toLowerCase();
	return (
		normalized.endsWith("/.telescope/config.yaml") ||
		normalized.includes("/.telescope/config.yaml")
	);
}
