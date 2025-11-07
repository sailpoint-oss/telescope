export {
	type DocumentType,
	identifyDocumentType,
	isPartialDocument,
	isRootDocument,
} from "./document-detection";
export { detectDocumentVersion, loadDocument } from "./loader";
export {
	decodePointerSegment,
	encodePointerSegment,
	getValueAtPointer,
	joinPointer,
	splitPointer,
} from "./pointer";
export type { ParsedDocument, Position, Range, SourceMap } from "./types";
