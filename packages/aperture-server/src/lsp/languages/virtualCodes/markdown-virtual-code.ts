import type {
	CodeInformation,
	CodeMapping,
	IScriptSnapshot,
	VirtualCode,
} from "@volar/language-core";
import { buildJsonStringMapping, type JsonStringMapping } from "./json-string-mapping.js";

// Shared features configuration
const markdownFeatures: CodeInformation = {
	verification: true,
	completion: true,
	semantic: true,
	navigation: true,
	structure: true,
	format: true,
};

/**
 * Represents a segment of markdown content extracted from a source document.
 * For JSON documents, sourceLength accounts for escape sequences.
 * For YAML documents, sourceLength equals content.length.
 */
export interface MarkdownSegment {
	/** Byte offset in source where this segment starts */
	start: number;
	/** Length in source bytes (includes escape sequences for JSON) */
	sourceLength: number;
	/** The decoded content of this segment */
	content: string;
	/** Optional JSON string mapping for position translation (JSON only) */
	jsonMapping?: JsonStringMapping;
}

/** Separator used between multiple description segments */
const SEGMENT_SEPARATOR = "\n\n---\n\n";

/**
 * @deprecated Use sourceLength instead. Kept for backward compatibility.
 */
export interface LegacyMarkdownSegment {
	start: number;
	length: number;
	content: string;
}

/**
 * Virtual code for embedded markdown content in OpenAPI description fields.
 *
 * For YAML documents, markdown content is extracted from block scalars and
 * mapped directly (1:1 source to virtual).
 *
 * For JSON documents, markdown content is extracted from escaped strings.
 * The mappings use sourceLength (which accounts for escape sequences) to
 * ensure accurate position translation. JsonStringMappings are stored for
 * bidirectional position conversion in LSP features.
 */
export class MarkdownVirtualCode implements VirtualCode {
	languageId = "markdown";
	mappings: CodeMapping[] = [];
	embeddedCodes: VirtualCode[] = [];
	snapshot: IScriptSnapshot;

	/**
	 * JSON string mappings for each segment (only populated for JSON sources).
	 * Keyed by segment index. Used for position translation in hover, completion, etc.
	 */
	readonly jsonMappings: Map<number, JsonStringMapping> = new Map();

	/**
	 * The segments used to construct this virtual code.
	 * Mutable to support incremental updates.
	 */
	segments: MarkdownSegment[];

	constructor(
		public id: string,
		segments: MarkdownSegment[],
	) {
		this.segments = segments;
		this.buildFromSegments();
	}

	/**
	 * Build mappings and snapshot from the current segments.
	 */
	private buildFromSegments(): void {
		const parts: string[] = [];
		let currentVirtualOffset = 0;

		// Clear existing mappings
		this.mappings = [];
		this.jsonMappings.clear();

		for (let i = 0; i < this.segments.length; i++) {
			const segment = this.segments[i];
			if (!segment) continue;
			const { start, sourceLength, content, jsonMapping } = segment;

			// 1. Add separator between segments
			if (i > 0) {
				parts.push(SEGMENT_SEPARATOR);
				currentVirtualOffset += SEGMENT_SEPARATOR.length;
			}

			// 2. Map the content using sourceLength (accounts for JSON escapes)
			// For YAML: sourceLength === content.length (1:1 mapping)
			// For JSON: sourceLength >= content.length (escape sequences)
			this.mappings.push({
				sourceOffsets: [start],
				generatedOffsets: [currentVirtualOffset],
				lengths: [sourceLength],
				data: markdownFeatures,
			});

			// 3. Store JSON mapping if present (for position translation)
			if (jsonMapping) {
				this.jsonMappings.set(i, jsonMapping);
			}

			parts.push(content);
			currentVirtualOffset += content.length;
		}

		const text = parts.join("");
		this.snapshot = {
			getText: (start, end) => text.slice(start, end),
			getLength: () => text.length,
			getChangeRange: () => undefined,
		};
	}

	// =========================================================================
	// Incremental Update Support
	// =========================================================================

	/**
	 * Update this markdown code based on a change in the source document.
	 *
	 * Each segment falls into one of three categories:
	 * 1. Before change: No modification needed
	 * 2. Contains change: Update content in place
	 * 3. After change: Shift start offset by delta
	 *
	 * @param changeStart - Byte offset where the change started in source
	 * @param changeEnd - Byte offset where the change ended in source (before change)
	 * @param delta - Difference in length (newLength - oldLength)
	 * @param newSourceText - The new full source text
	 * @returns true if update succeeded, false if this code should be recreated
	 */
	update(
		changeStart: number,
		changeEnd: number,
		delta: number,
		newSourceText: string,
	): boolean {
		let needsRebuild = false;

		for (let i = 0; i < this.segments.length; i++) {
			const segment = this.segments[i];
			if (!segment) continue;

			const segStart = segment.start;
			const segEnd = segment.start + segment.sourceLength;

			// Case 1: Segment is entirely before the change - no modification
			if (segEnd <= changeStart) {
				continue;
			}

			// Case 2: Segment is entirely after the change - shift it
			if (segStart >= changeEnd) {
				segment.start += delta;
				const mapping = this.mappings[i];
				if (mapping) {
					mapping.sourceOffsets[0] = segment.start;
				}
				continue;
			}

			// Case 3: Change is entirely within this segment - update in place
			if (changeStart >= segStart && changeEnd <= segEnd) {
				const success = this.updateSegmentContent(
					i,
					changeStart,
					changeEnd,
					delta,
					newSourceText,
				);
				if (!success) {
					return false;
				}
				needsRebuild = true;
				continue;
			}

			// Case 4: Change spans segment boundaries - need full recreate
			// This includes: change starts before segment but ends inside,
			// or change starts inside but ends after segment
			if (
				(changeStart < segStart && changeEnd > segStart) ||
				(changeStart < segEnd && changeEnd > segEnd)
			) {
				return false;
			}
		}

		// Rebuild snapshot if any segment content changed
		if (needsRebuild) {
			this.rebuildSnapshot();
		}

		return true;
	}

	/**
	 * Update the content of a single segment.
	 */
	private updateSegmentContent(
		segmentIndex: number,
		changeStart: number,
		changeEnd: number,
		delta: number,
		newSourceText: string,
	): boolean {
		const segment = this.segments[segmentIndex];
		if (!segment) return false;

		const mapping = this.mappings[segmentIndex];
		if (!mapping) return false;

		// Calculate new segment bounds
		const newSourceLength = segment.sourceLength + delta;
		const newSegEnd = segment.start + newSourceLength;

		// For JSON with escape sequences: rebuild the mapping
		if (segment.jsonMapping) {
			try {
				const newJsonMapping = buildJsonStringMapping(
					newSourceText,
					segment.start,
					newSourceLength,
				);
				segment.jsonMapping = newJsonMapping;
				segment.content = newJsonMapping.decodedContent;
				segment.sourceLength = newSourceLength;
				mapping.lengths[0] = newSourceLength;
				this.jsonMappings.set(segmentIndex, newJsonMapping);
			} catch {
				// JSON parsing failed - need full recreate
				return false;
			}
		} else {
			// For YAML: direct 1:1 mapping, extract new content from source
			const newContent = newSourceText.slice(segment.start, newSegEnd);
			segment.content = newContent;
			segment.sourceLength = newSourceLength;
			mapping.lengths[0] = newSourceLength;
		}

		return true;
	}

	/**
	 * Rebuild the snapshot from current segments (after content changes).
	 */
	private rebuildSnapshot(): void {
		const parts: string[] = [];
		let currentVirtualOffset = 0;

		for (let i = 0; i < this.segments.length; i++) {
			const segment = this.segments[i];
			if (!segment) continue;

			// Add separator between segments
			if (i > 0) {
				parts.push(SEGMENT_SEPARATOR);
				currentVirtualOffset += SEGMENT_SEPARATOR.length;
			}

			// Update generated offset in mapping
			const mapping = this.mappings[i];
			if (mapping) {
				mapping.generatedOffsets[0] = currentVirtualOffset;
			}

			parts.push(segment.content);
			currentVirtualOffset += segment.content.length;
		}

		const text = parts.join("");
		this.snapshot = {
			getText: (start, end) => text.slice(start, end),
			getLength: () => text.length,
			getChangeRange: () => undefined,
		};
	}

	/**
	 * Get the source range (start, end) that this markdown code covers.
	 * Returns undefined if there are no segments.
	 */
	getSourceRange(): { start: number; end: number } | undefined {
		if (this.segments.length === 0) return undefined;

		const firstSeg = this.segments[0];
		const lastSeg = this.segments[this.segments.length - 1];
		if (!firstSeg || !lastSeg) return undefined;

		return {
			start: firstSeg.start,
			end: lastSeg.start + lastSeg.sourceLength,
		};
	}

	/**
	 * Check if this virtual code has JSON mappings (i.e., from a JSON source).
	 */
	hasJsonMappings(): boolean {
		return this.jsonMappings.size > 0;
	}

	/**
	 * Get the decoded content of all segments combined.
	 */
	getDecodedContent(): string {
		return this.snapshot.getText(0, this.snapshot.getLength());
	}
}
