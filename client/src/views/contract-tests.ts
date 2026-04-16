import * as path from "node:path";
import * as vscode from "vscode";
import type {
	ContractOpenAPIResult,
	ContractTestFinishedPayload,
	ContractTestProgressPayload,
	ContractArazzoWorkflowResult,
	WiretapFinding,
} from "../contract-events";
import { summarizeContractPayload } from "../contract-events";

type ContractTreeNode =
	| ContractFileNode
	| ContractOperationNode
	| ContractWorkflowNode
	| ContractMessageNode;

type ContractRunState = "running" | "finished" | "error";

interface ContractRunRecord {
	uri: vscode.Uri;
	runId?: string;
	baseUrl?: string;
	status: ContractRunState;
	progress?: string;
	error?: string;
	pass: boolean;
	passed: number;
	total: number;
	result?: ContractTestFinishedPayload["result"];
	wiretapFindings: WiretapFinding[];
	wiretapMonitorUrl?: string;
	updatedAt: number;
}

export class ContractFileNode extends vscode.TreeItem {
	constructor(public readonly record: ContractRunRecord) {
		super(
			path.basename(record.uri.fsPath),
			vscode.TreeItemCollapsibleState.Expanded,
		);
		this.contextValue = record.wiretapMonitorUrl
			? "telescope.contractFile.monitor"
			: "telescope.contractFile";
		this.description = buildFileDescription(record);
		this.tooltip = record.uri.fsPath;
		this.command = {
			command: "vscode.open",
			title: "Open contract spec",
			arguments: [record.uri],
		};
		this.iconPath = new vscode.ThemeIcon(
			record.status === "running"
				? "loading~spin"
				: record.pass
					? "pass"
					: "warning",
		);
	}
}

export class ContractOperationNode extends vscode.TreeItem {
	constructor(
		public readonly uri: vscode.Uri,
		public readonly baseUrl: string | undefined,
		public readonly result: ContractOpenAPIResult,
	) {
		super(
			[result.method ?? "OP", result.path ?? result.operationId ?? "(unknown)"].join(
				" ",
			),
			vscode.TreeItemCollapsibleState.None,
		);
		this.contextValue = result.operationId
			? "telescope.contractOperation"
			: "telescope.contractResult";
		this.description = result.pass
			? result.status
				? `pass ${result.status}`
				: "pass"
			: result.status
				? `fail ${result.status}`
				: "fail";
		this.tooltip = [result.operationId, result.error].filter(Boolean).join("\n");
		this.iconPath = new vscode.ThemeIcon(result.pass ? "pass" : "error");
	}
}

class ContractWorkflowNode extends vscode.TreeItem {
	constructor(public readonly workflow: ContractArazzoWorkflowResult) {
		super(
			workflow.workflowId || "workflow",
			vscode.TreeItemCollapsibleState.None,
		);
		this.contextValue = "telescope.contractWorkflow";
		this.description = workflow.pass ? "pass" : "fail";
		this.tooltip = workflow.error || workflow.workflowId || "";
		this.iconPath = new vscode.ThemeIcon(workflow.pass ? "pass" : "error");
	}
}

class ContractMessageNode extends vscode.TreeItem {
	constructor(
		label: string,
		detail?: string,
		icon: string = "info",
	) {
		super(label, vscode.TreeItemCollapsibleState.None);
		this.description = detail;
		this.tooltip = [label, detail].filter(Boolean).join("\n");
		this.iconPath = new vscode.ThemeIcon(icon);
		this.contextValue = "telescope.contractMessage";
	}
}

export class ContractTestsProvider
	implements vscode.TreeDataProvider<ContractTreeNode>
{
	private readonly onDidChangeTreeDataEmitter =
		new vscode.EventEmitter<ContractTreeNode | undefined | null | void>();

	readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

	private readonly runsByURI = new Map<string, ContractRunRecord>();
	private readonly runIDToURI = new Map<string, string>();
	private latestWiretapMonitorUrl = "";

	refresh(): void {
		this.onDidChangeTreeDataEmitter.fire();
	}

	startRun(uri: vscode.Uri, runId: string, baseUrl?: string): void {
		const key = uri.toString();
		this.runIDToURI.set(runId, key);
		const existing = this.runsByURI.get(key);
		this.runsByURI.set(key, {
			uri,
			runId,
			baseUrl,
			status: "running",
			progress: "Queued",
			pass: false,
			passed: existing?.passed ?? 0,
			total: existing?.total ?? 0,
			result: existing?.result,
			wiretapFindings: existing?.wiretapFindings ?? [],
			wiretapMonitorUrl: existing?.wiretapMonitorUrl,
			updatedAt: Date.now(),
		});
		this.refresh();
	}

	updateProgress(payload: ContractTestProgressPayload): void {
		const record = this.lookupRecord(payload.runId);
		if (!record) {
			return
		}
		record.status = "running";
		record.progress = [payload.phase, payload.message, payload.percent != null ? `${payload.percent}%` : ""]
			.filter((part) => part && part.trim() !== "")
			.join(" ");
		record.updatedAt = Date.now();
		this.refresh();
	}

	finishRun(payload: ContractTestFinishedPayload): void {
		const record = this.lookupRecord(payload.runId);
		if (!record) {
			return
		}
		const summary = summarizeContractPayload(payload);
		record.runId = payload.runId;
		record.baseUrl = payload.baseUrl ?? record.baseUrl;
		record.progress = undefined;
		record.error = payload.error?.trim() || undefined;
		record.status = record.error ? "error" : "finished";
		record.pass = summary.pass;
		record.passed = summary.passed;
		record.total = summary.total;
		record.result = payload.result;
		record.wiretapFindings = payload.wiretapFindings ?? [];
		record.wiretapMonitorUrl =
			payload.wiretapMonitorUrl?.trim() || record.wiretapMonitorUrl;
		record.updatedAt = Date.now();
		if (record.wiretapMonitorUrl) {
			this.latestWiretapMonitorUrl = record.wiretapMonitorUrl;
		}
		if (payload.runId) {
			this.runIDToURI.delete(payload.runId);
		}
		this.refresh();
	}

	getLatestWiretapMonitorURL(): string {
		return this.latestWiretapMonitorUrl;
	}

	getSummary(): { passed: number; total: number; running: number; failed: number } {
		let passed = 0;
		let total = 0;
		let running = 0;
		let failed = 0;
		for (const record of this.runsByURI.values()) {
			if (record.status === "running") {
				running++;
			}
			passed += record.passed;
			total += record.total;
			if (record.status === "error" || (record.status === "finished" && !record.pass)) {
				failed++;
			}
		}
		return { passed, total, running, failed };
	}

	getTreeItem(element: ContractTreeNode): vscode.TreeItem {
		return element;
	}

	getChildren(element?: ContractTreeNode): ContractTreeNode[] {
		if (element instanceof ContractFileNode) {
			return buildChildrenForRecord(element.record);
		}
		return Array.from(this.runsByURI.values())
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.map((record) => new ContractFileNode(record));
	}

	private lookupRecord(runId?: string): ContractRunRecord | undefined {
		if (runId) {
			const key = this.runIDToURI.get(runId);
			if (key) {
				return this.runsByURI.get(key);
			}
		}
		const running = Array.from(this.runsByURI.values()).filter(
			(record) => record.status === "running",
		);
		if (running.length === 1) {
			return running[0];
		}
		return undefined;
	}
}

function buildChildrenForRecord(record: ContractRunRecord): ContractTreeNode[] {
	const children: ContractTreeNode[] = [];
	if (record.status === "running") {
		children.push(
			new ContractMessageNode(
				record.progress || "Running contract tests",
				record.baseUrl,
				"loading~spin",
			),
		);
	}
	if (record.error) {
		children.push(new ContractMessageNode(record.error, record.baseUrl, "error"));
	}
	for (const item of record.result?.openapi?.results ?? []) {
		children.push(new ContractOperationNode(record.uri, record.baseUrl, item));
		if (item.error) {
			children.push(
				new ContractMessageNode(item.error, item.operationId, "warning"),
			);
		}
	}
	for (const workflow of record.result?.arazzo?.workflows ?? []) {
		children.push(new ContractWorkflowNode(workflow));
		if (workflow.error) {
			children.push(
				new ContractMessageNode(workflow.error, workflow.workflowId, "warning"),
			);
		}
	}
	for (const finding of record.wiretapFindings) {
		const label = [finding.method, finding.path, finding.message]
			.filter(Boolean)
			.join(" ");
		const detail = [finding.direction, finding.ruleId, finding.fieldPath]
			.filter(Boolean)
			.join(" · ");
		children.push(
			new ContractMessageNode(
				label || "wiretap finding",
				detail,
				finding.severity === "error" ? "error" : "warning",
			),
		);
	}
	if (record.wiretapMonitorUrl) {
		children.push(
			new ContractMessageNode(
				"Open Wiretap monitor",
				record.wiretapMonitorUrl,
				"globe",
			),
		);
	}
	if (children.length === 0) {
		children.push(new ContractMessageNode("No contract test results yet"));
	}
	return children;
}

function buildFileDescription(record: ContractRunRecord): string {
	if (record.status === "running") {
		return record.progress || "running";
	}
	if (record.error) {
		return "error";
	}
	if (record.total > 0) {
		return `${record.passed}/${record.total} passed`;
	}
	return record.pass ? "passed" : "failed";
}
