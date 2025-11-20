/**
 * IR module exports
 */

export {
	findNodeByPointer,
	getValueAtPointer,
	irLocToRange,
	irPointerToRange,
} from "./context.js";
export { buildIRFromJson } from "./builder-json.js";
export { buildIRFromYaml } from "./builder-yaml.js";
export type { IRDocument, IRNode, IRNodeKind, Loc } from "./types.js";
