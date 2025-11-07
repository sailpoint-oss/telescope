import type {
	IScriptSnapshot,
	LanguagePlugin,
	VirtualCode,
} from "@volar/language-core";
import type { URI } from "vscode-uri";
import type { OpenApiDocumentStore } from "./documents.js";

export interface OpenApiVirtualCode extends VirtualCode {
	readonly sourceUri: string;
}

export function createOpenApiLanguagePlugin(
	store: OpenApiDocumentStore,
): LanguagePlugin<URI, OpenApiVirtualCode> {
	return {
		getLanguageId(scriptId) {
			const langId = inferLanguageId(scriptId);
			console.log(`[Language Plugin] getLanguageId(${scriptId.toString()}) = ${langId ?? "undefined"}`);
			return langId;
		},
		createVirtualCode(scriptId, languageId, snapshot) {
			const uri = scriptId.toString();
			console.log(`[Language Plugin] createVirtualCode(${uri}, ${languageId})`);
			const record = store.updateFromSnapshot(uri, languageId, snapshot);
			return toVirtualCode(uri, record.languageId, record.snapshot);
		},
		updateVirtualCode(scriptId, virtualCode, snapshot) {
			const uri = scriptId.toString();
			const record = store.updateFromSnapshot(
				uri,
				virtualCode.languageId,
				snapshot,
			);
			return {
				...virtualCode,
				snapshot: record.snapshot,
				languageId: record.languageId,
			};
		},
		disposeVirtualCode(scriptId) {
			store.delete(scriptId.toString());
		},
	};
}

function inferLanguageId(scriptId: URI): string | undefined {
	const filePath = scriptId.fsPath || scriptId.path;
	const lower = filePath.toLowerCase();
	if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
	if (lower.endsWith(".json")) return "json";
	return undefined;
}

let warnedInvalidEmbeddedId = false;

function normalizeEmbeddedId(id: string): string {
    const cleaned = id.replace(/#.*/u, "").toLowerCase();
    if (!warnedInvalidEmbeddedId && (id.includes('#') || id !== cleaned)) {
        // Log once to aid debugging if future changes pass an invalid id
        // eslint-disable-next-line no-console
        console.warn(`Normalized embedded content id from "${id}" to "${cleaned}"`);
        warnedInvalidEmbeddedId = true;
    }
    return cleaned;
}

function toVirtualCode(
    uri: string,
    languageId: string,
    snapshot: IScriptSnapshot,
): OpenApiVirtualCode {
    const id = normalizeEmbeddedId('openapi');
    const length = snapshot.getLength();
    // Create a mapping that covers the entire document to enable diagnostics
    // Since we're not transforming the code, source and generated are the same
    const mappings = [
        {
            sourceOffsets: [0],
            generatedOffsets: [0],
            lengths: [length],
            data: {
                verification: true, // Enable diagnostics for this virtual code
            },
        },
    ];
    return {
        id,
        languageId,
        snapshot,
        mappings,
        sourceUri: uri,
    };
}
