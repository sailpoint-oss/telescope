/**
 * E2E Tests: Resync recovery
 *
 * The custom client-server sync protocol has been removed. The Go language
 * server operates per-document via standard LSP and does not require a
 * project-wide file list from the client. This test suite is intentionally
 * empty and kept as a placeholder.
 */

suite("Resync Recovery (legacy - removed)", () => {
	test("placeholder: custom sync protocol removed", () => {
		// No-op: the custom sync protocol (telescope/setOpenAPIFiles,
		// telescope/didChangeOpenApiFiles, telescope/requestOpenApiFilesResync)
		// has been removed. The Go server handles documents individually.
	});
});
