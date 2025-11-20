/**
 * Simple logger interface for structured logging.
 * Provides a consistent logging API across packages.
 */

export interface Logger {
	log(message: string, ...args: unknown[]): void;
	warn(message: string, ...args: unknown[]): void;
	error(message: string, ...args: unknown[]): void;
	debug?(message: string, ...args: unknown[]): void;
}

/**
 * No-op logger that discards all log messages.
 * Useful as a default when no logger is provided.
 */
export const noopLogger: Logger = {
	log: () => {},
	warn: () => {},
	error: () => {},
	debug: () => {},
};

/**
 * Console logger that outputs to console.
 * Can be used as a fallback or for development.
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
 * Create a logger from a DiagnosticsLogger interface (used by ApertureVolarContext).
 */
export function createLoggerFromDiagnosticsLogger(
	diagnosticsLogger: { log: (msg: string) => void; error: (msg: string) => void; warn?: (msg: string) => void },
): Logger {
	return {
		log: (message, ...args) => diagnosticsLogger.log(formatMessage(message, ...args)),
		warn: (message, ...args) => diagnosticsLogger.warn?.(formatMessage(message, ...args)) ?? diagnosticsLogger.log(formatMessage(message, ...args)),
		error: (message, ...args) => diagnosticsLogger.error(formatMessage(message, ...args)),
		debug: (message, ...args) => {
			if (process.env.DEBUG) {
				diagnosticsLogger.log(formatMessage(message, ...args));
			}
		},
	};
}

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

