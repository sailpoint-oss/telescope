/**
 * Logger Utilities
 *
 * This module provides a simple logging interface for structured logging
 * across the codebase. It includes:
 *
 * - A Logger interface for consistent API
 * - A no-op logger for silent operation
 * - A console logger for development
 * - Adapters for converting other logging interfaces
 *
 * @module utils/logger
 *
 * @example
 * ```typescript
 * import { Logger, consoleLogger, noopLogger } from "telescope-server";
 *
 * // Use console logger
 * const logger: Logger = consoleLogger;
 * logger.log("Processing %s", "api.yaml");
 * logger.warn("Deprecated feature used");
 * logger.error("Failed to parse document");
 *
 * // Use no-op logger for silent operation
 * const silentLogger: Logger = noopLogger;
 * silentLogger.log("This won't be printed");
 * ```
 */

/**
 * Logger interface for structured logging.
 *
 * Provides a consistent logging API with support for formatted messages.
 * The debug method is optional to support loggers without debug capability.
 *
 * @example
 * ```typescript
 * const logger: Logger = {
 *   log: (msg, ...args) => console.log(msg, ...args),
 *   warn: (msg, ...args) => console.warn(msg, ...args),
 *   error: (msg, ...args) => console.error(msg, ...args),
 *   debug: (msg, ...args) => console.debug(msg, ...args)
 * };
 * ```
 */
export interface Logger {
	/**
	 * Log an informational message.
	 *
	 * @param message - Message format string (supports %s, %d, %j)
	 * @param args - Values to interpolate into the message
	 */
	log(message: string, ...args: unknown[]): void;

	/**
	 * Log a warning message.
	 *
	 * @param message - Message format string (supports %s, %d, %j)
	 * @param args - Values to interpolate into the message
	 */
	warn(message: string, ...args: unknown[]): void;

	/**
	 * Log an error message.
	 *
	 * @param message - Message format string (supports %s, %d, %j)
	 * @param args - Values to interpolate into the message
	 */
	error(message: string, ...args: unknown[]): void;

	/**
	 * Log a debug message (optional).
	 *
	 * Debug messages are typically only shown when DEBUG environment
	 * variable is set.
	 *
	 * @param message - Message format string (supports %s, %d, %j)
	 * @param args - Values to interpolate into the message
	 */
	debug?(message: string, ...args: unknown[]): void;
}

/**
 * No-op logger that discards all log messages.
 *
 * Useful as a default when no logger is provided, or for suppressing
 * output in tests.
 *
 * @example
 * ```typescript
 * import { noopLogger } from "telescope-server";
 *
 * // All messages are silently discarded
 * noopLogger.log("This won't appear");
 * noopLogger.warn("Neither will this");
 * noopLogger.error("Or this");
 * ```
 */
export const noopLogger: Logger = {
	log: () => {},
	warn: () => {},
	error: () => {},
	debug: () => {},
};

/**
 * Console logger that outputs to the console.
 *
 * Uses console.log, console.warn, and console.error for output.
 * Debug messages are only shown when the DEBUG environment variable is set.
 *
 * @example
 * ```typescript
 * import { consoleLogger } from "telescope-server";
 *
 * consoleLogger.log("Processing file: %s", uri);
 * consoleLogger.warn("Deprecated: %s", feature);
 * consoleLogger.error("Failed: %s", error.message);
 *
 * // Debug only shown if DEBUG env var is set
 * process.env.DEBUG = "true";
 * consoleLogger.debug("Detailed info: %j", data);
 * ```
 */
export const consoleLogger: Logger = {
	log: (...args) => console.log(...args),
	warn: (...args) => console.warn(...args),
	error: (...args) => console.error(...args),
	debug: (...args) => {
		// Only log debug messages if DEBUG env var is set
		if (process.env.DEBUG) {
			console.debug(...args);
		}
	},
};

/**
 * Create a Logger from a DiagnosticsLogger interface.
 *
 * This adapter converts the DiagnosticsLogger interface (used by telescopeVolarContext)
 * to the standard Logger interface used throughout the codebase.
 *
 * @param diagnosticsLogger - A DiagnosticsLogger with log and error methods
 * @returns A Logger adapter
 *
 * @example
 * ```typescript
 * import { createLoggerFromDiagnosticsLogger } from "telescope-server";
 *
 * // Wrap a VSCode output channel
 * const logger = createLoggerFromDiagnosticsLogger({
 *   log: (msg) => outputChannel.appendLine(msg),
 *   error: (msg) => outputChannel.appendLine(`[ERROR] ${msg}`),
 *   warn: (msg) => outputChannel.appendLine(`[WARN] ${msg}`)
 * });
 *
 * logger.log("Message: %s", value);
 * ```
 */
export function createLoggerFromDiagnosticsLogger(diagnosticsLogger: {
	log: (msg: string) => void;
	error: (msg: string) => void;
	warn?: (msg: string) => void;
}): Logger {
	return {
		log: (message, ...args) =>
			diagnosticsLogger.log(formatMessage(message, ...args)),
		warn: (message, ...args) =>
			diagnosticsLogger.warn?.(formatMessage(message, ...args)) ??
			diagnosticsLogger.log(formatMessage(message, ...args)),
		error: (message, ...args) =>
			diagnosticsLogger.error(formatMessage(message, ...args)),
		debug: (message, ...args) => {
			if (process.env.DEBUG) {
				diagnosticsLogger.log(formatMessage(message, ...args));
			}
		},
	};
}

/**
 * Format a message with printf-style placeholders.
 *
 * Supports:
 * - %s - String
 * - %d - Number
 * - %j - JSON
 *
 * Extra arguments are appended to the message.
 *
 * @param message - Format string
 * @param args - Values to interpolate
 * @returns Formatted message string
 *
 * @internal
 */
function formatMessage(message: string, ...args: unknown[]): string {
	if (args.length === 0) {
		return message;
	}
	// Simple formatting - replace %s, %d, %j with args
	let formatted = message;
	for (const arg of args) {
		const placeholder = formatted.match(/%[sdj]/);
		if (placeholder) {
			const value = placeholder[0] === "%j" ? JSON.stringify(arg) : String(arg);
			formatted = formatted.replace(/%[sdj]/, value);
		} else {
			formatted += " " + String(arg);
		}
	}
	return formatted;
}
