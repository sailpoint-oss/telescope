export function encodePointerSegment(segment: string): string {
	return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

export function decodePointerSegment(segment: string): string {
	return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

export function splitPointer(pointer: string): string[] {
	if (!pointer || pointer === "#") return [];
	const trimmed = pointer.startsWith("#/")
		? pointer.slice(2)
		: pointer.startsWith("#")
			? pointer.slice(1)
			: pointer;
	if (!trimmed) return [];
	return trimmed.split("/").map(decodePointerSegment);
}

export function joinPointer(segments: string[]): string {
	if (!segments.length) return "#";
	return `#/${segments.map(encodePointerSegment).join("/")}`;
}

export function getValueAtPointer(root: unknown, pointer: string): unknown {
	const segments = splitPointer(pointer);
	let current: any = root;
	for (const segment of segments) {
		if (current == null) return undefined;
		if (Array.isArray(current)) {
			const index = Number(segment);
			if (!Number.isInteger(index) || index < 0 || index >= current.length) {
				return undefined;
			}
			current = current[index];
		} else if (typeof current === "object") {
			current = (current as Record<string, unknown>)[segment];
		} else {
			return undefined;
		}
	}
	return current;
}
