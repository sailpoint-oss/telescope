export function isConfigFile(uri: string): boolean {
	const normalized = uri.replace(/\\/g, "/").toLowerCase();
	return normalized.endsWith("/.telescope/config.yaml");
}
