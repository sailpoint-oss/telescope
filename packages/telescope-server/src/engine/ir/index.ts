/**
 * IR module exports
 */

export { buildIRFromJson } from "./builder-json.js";
export { buildIRFromYaml } from "./builder-yaml.js";
export {
	findNodeByPointer,
	getValueAtPointer,
	irLocToRange,
	irPointerToRange,
} from "./context.js";
export type { IRDocument, IRNode, IRNodeKind, Loc } from "./types.js";
