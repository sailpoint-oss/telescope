/**
 * SemanticIndexes - workspace-wide semantic maps (e.g., operationId -> occurrences).
 */

import type { OperationAtom } from "../atoms.js";

/**
 * Maps operationId to all occurrences across the workspace.
 */
export class OperationIdIndex {
	private readonly map = new Map<string, OperationAtom[]>();

	/**
	 * Clear all data from the index.
	 */
	clear(): void {
		this.map.clear();
	}

	/**
	 * Update index by removing old entries for a URI and adding new ones.
	 */
	updateForUri(uri: string, operations: OperationAtom[]): Set<string> {
		const changed = new Set<string>();

		// Remove old entries for this URI
		for (const [opId, atoms] of this.map.entries()) {
			const filtered = atoms.filter((atom) => atom.uri !== uri);
			if (filtered.length !== atoms.length) {
				changed.add(opId);
				if (filtered.length === 0) {
					this.map.delete(opId);
				} else {
					this.map.set(opId, filtered);
				}
			}
		}

		// Add new entries
		for (const op of operations) {
			if (op.operationId) {
				const existing = this.map.get(op.operationId) ?? [];
				if (!existing.some((e) => e.uri === op.uri && e.ptr === op.ptr)) {
					this.map.set(op.operationId, [...existing, op]);
					changed.add(op.operationId);
				}
			}
		}

		return changed;
	}

	/**
	 * Get all occurrences of an operationId.
	 */
	getOccurrences(operationId: string): OperationAtom[] {
		return this.map.get(operationId) ?? [];
	}

	/**
	 * Check if an operationId is unique.
	 */
	isUnique(operationId: string): boolean {
		return this.getOccurrences(operationId).length <= 1;
	}

	/**
	 * Get all duplicate operationIds.
	 */
	getDuplicates(): string[] {
		const duplicates: string[] = [];
		for (const [opId, occurrences] of this.map.entries()) {
			if (occurrences.length > 1) {
				duplicates.push(opId);
			}
		}
		return duplicates;
	}
}
