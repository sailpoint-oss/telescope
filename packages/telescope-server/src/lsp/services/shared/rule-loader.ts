import { extname } from "node:path";
import type { GenericRule } from "../../../engine/index.js";

/**
 * Optional logger interface for rule loading operations.
 * If not provided, errors are logged to console.
 */
export interface RuleLoaderLogger {
	log: (message: string) => void;
	warn: (message: string) => void;
	error: (message: string) => void;
}

/** Default console logger for standalone usage */
const defaultLogger: RuleLoaderLogger = {
	log: (msg) => console.log(`[RuleLoader] ${msg}`),
	warn: (msg) => console.warn(`[RuleLoader] ${msg}`),
	error: (msg) => console.error(`[RuleLoader] ${msg}`),
};

async function getRule(
	filePath: string,
	logger: RuleLoaderLogger,
): Promise<unknown | undefined> {
	try {
		return await import(filePath);
	} catch (error) {
		logger.error(
			`Failed to import rule from ${filePath}: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		return undefined;
	}
}

/**
 * Load a rule from a file path.
 * Supports .ts and .js (generic rule export).
 *
 * @param filePath - Absolute path to the rule file
 * @param logger - Optional logger for loading operations (defaults to console)
 * @returns Promise resolving to the generic rule or undefined if the rule is not found or invalid
 */
export async function loadRule(
	filePath: string,
	logger: RuleLoaderLogger = defaultLogger,
): Promise<GenericRule | undefined> {
	const extension = extname(filePath);
	logger.log(`Loading rule from ${filePath} (extension: ${extension})`);

	const content = await getRule(filePath, logger);
	if (!content) {
		return undefined;
	}

	if (
		typeof content === "object" &&
		"default" in content &&
		content.default &&
		typeof content.default === "object" &&
		"meta" in content.default &&
		content.default.meta
	) {
		return content.default as GenericRule;
	}

	return undefined;
}
