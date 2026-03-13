import * as vscode from "vscode";
import { formatSetupLog } from "./utils";

type TracePayload = Record<string, unknown>;

function traceLevel(scope?: vscode.Uri): "off" | "messages" | "verbose" {
	return vscode.workspace
		.getConfiguration("telescope", scope)
		.get<"off" | "messages" | "verbose">("trace", "off");
}

export function isTraceEventLoggingEnabled(scope?: vscode.Uri): boolean {
	return traceLevel(scope) !== "off";
}

export function summarizeForTrace(value: unknown): unknown {
	if (value === null || value === undefined) return value;
	if (typeof value === "string") {
		return value.length <= 200 ? value : `${value.slice(0, 197)}...`;
	}
	if (typeof value === "number" || typeof value === "boolean") return value;
	if (value instanceof vscode.Uri) return value.toString();
	if (Array.isArray(value)) {
		const head = value.slice(0, 5).map((v) => summarizeForTrace(v));
		return { type: "array", length: value.length, head };
	}
	if (typeof value === "object") {
		const out: Record<string, unknown> = {};
		const entries = Object.entries(value as Record<string, unknown>).slice(0, 10);
		for (const [k, v] of entries) {
			// Never log full text payloads from editor events.
			if (k.toLowerCase().includes("text") || k.toLowerCase().includes("content")) {
				out[k] = "[redacted]";
				continue;
			}
			out[k] = summarizeForTrace(v);
		}
		return out;
	}
	return String(value);
}

export function appendTraceEvent(
	outputChannel: vscode.OutputChannel,
	event: string,
	payload: TracePayload = {},
	scope?: vscode.Uri,
): void {
	if (!isTraceEventLoggingEnabled(scope)) return;
	const line = {
		ts: new Date().toISOString(),
		event,
		...payload,
	};
	outputChannel.appendLine(formatSetupLog(`[trace] ${JSON.stringify(line)}`));
}
