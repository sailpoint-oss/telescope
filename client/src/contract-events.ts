export interface ContractTestProgressPayload {
	runId?: string;
	phase?: string;
	message?: string;
	percent?: number;
}

export interface ContractOpenAPIResult {
	method?: string;
	path?: string;
	status?: number;
	error?: string;
	pass?: boolean;
	operationId?: string;
}

export interface ContractArazzoWorkflowResult {
	workflowId?: string;
	error?: string;
	pass?: boolean;
}

export interface ContractOpenAPISection {
	passed?: number;
	total?: number;
	results?: ContractOpenAPIResult[];
}

export interface ContractArazzoSection {
	passed?: number;
	total?: number;
	workflows?: ContractArazzoWorkflowResult[];
}

export interface ContractResultPayload {
	pass?: boolean;
	openapi?: ContractOpenAPISection;
	arazzo?: ContractArazzoSection;
}

export interface WiretapFinding {
	method?: string;
	path?: string;
	statusCode?: number;
	direction?: string;
	message?: string;
	ruleId?: string;
	severity?: string;
	specName?: string;
	validationType?: string;
	validationSubType?: string;
	fieldPath?: string;
	howToFix?: string;
	specLine?: number;
	specColumn?: number;
}

export interface ContractTestFinishedPayload {
	runId?: string;
	error?: string;
	baseUrl?: string;
	result?: ContractResultPayload;
	wiretapFindings?: WiretapFinding[];
	wiretapMonitorUrl?: string;
	stderr?: string;
}

export interface ContractRunSummary {
	runId?: string;
	baseUrl?: string;
	pass: boolean;
	passed: number;
	total: number;
	operationCount: number;
	workflowCount: number;
	hasWiretapFindings: boolean;
}

export function summarizeContractPayload(
	payload: ContractTestFinishedPayload,
): ContractRunSummary {
	const openapi = payload.result?.openapi;
	const arazzo = payload.result?.arazzo;
	const passed = (openapi?.passed ?? 0) + (arazzo?.passed ?? 0);
	const total = (openapi?.total ?? 0) + (arazzo?.total ?? 0);
	return {
		runId: payload.runId,
		baseUrl: payload.baseUrl,
		pass: payload.result?.pass ?? !payload.error,
		passed,
		total,
		operationCount: openapi?.results?.length ?? 0,
		workflowCount: arazzo?.workflows?.length ?? 0,
		hasWiretapFindings: (payload.wiretapFindings?.length ?? 0) > 0,
	};
}
