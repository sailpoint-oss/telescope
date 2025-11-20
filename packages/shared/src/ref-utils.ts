import { URI } from "vscode-uri";

/**
 * Resolve a relative $ref path to an absolute URI.
 * Handles HTTP/HTTPS refs, same-document refs (#), and relative file paths.
 *
 * @param fromUri - The base URI to resolve from
 * @param ref - The reference string (can be relative path, absolute path, or URL)
 * @returns The resolved URI
 */
export function resolveRef(fromUri: URI, ref: string): URI {
	// Handle external refs (http/https)
	if (/^https?:/i.test(ref)) {
		const [uri, fragment] = ref.split("#", 2);
		return URI.parse(uri ?? ref);
	}

	// Handle same-document reference (#pointer)
	if (ref.startsWith("#")) {
		return fromUri.with({ fragment: ref.substring(1) });
	}

	// Handle absolute paths
	if (ref.startsWith("/")) {
		return fromUri.with({ path: ref });
	}

	// Get the directory of the base URI
	const basePath = fromUri.path;
	const baseDir = basePath.substring(0, basePath.lastIndexOf("/") + 1);

	// Resolve relative path, handling . and .. segments
	const segments = ref.split("/");
	const resolvedSegments: string[] = baseDir.split("/").filter(Boolean);

	for (const segment of segments) {
		if (segment === "." || segment === "") {
			// Skip current directory
		} else if (segment === "..") {
			// Go up one directory
			if (resolvedSegments.length > 0) {
				resolvedSegments.pop();
			}
		} else {
			// Add segment
			resolvedSegments.push(segment);
		}
	}

	// Reconstruct the path and normalize
	const resolvedPath = `/${resolvedSegments.join("/")}`;
	return fromUri.with({ path: resolvedPath });
}


