// This is an example Telescope plugin binary that demonstrates the SDK
// rule authoring experience. Build it with `go build -o my-rules .` and
// place the binary in your project's .telescope/plugins/ directory.
//
// The telescope LSP or CLI will automatically discover and run this plugin.
package main

import (
	"strings"

	"github.com/sailpoint-oss/telescope/server/sdk"
)

func main() {
	p := sdk.NewPlugin("example-rules", "1.0.0")

	// --- Operations visitors ---

	sdk.Rule("require-security", sdk.Meta{
		Description: "All operations must define a security requirement",
		Severity:    sdk.Error,
		Category:    sdk.Security,
		Recommended: true,
		HowToFix:    "Add a 'security' array to the operation or at the document root.",
	}).Operations(func(path, method string, op *sdk.Operation, r *sdk.Reporter) {
		if len(op.Security) == 0 {
			r.At(op.Loc, "%s %s has no security requirement defined", method, path)
		}
	}).Register(p)

	sdk.Rule("operation-summary-required", sdk.Meta{
		Description: "Every operation should have a summary for API documentation",
		Severity:    sdk.Warn,
		Category:    sdk.Documentation,
		Recommended: true,
	}).Operations(func(path, method string, op *sdk.Operation, r *sdk.Reporter) {
		result := sdk.V.Required()("summary", op.Summary)
		if !result.Valid {
			r.At(op.Loc, "%s %s is missing a summary", method, path)
		}
	}).Register(p)

	// --- Schemas visitor with composable validators ---

	sdk.Rule("schema-pascal-case", sdk.Meta{
		Description: "Component schema names should use PascalCase",
		Severity:    sdk.Warn,
		Category:    sdk.Naming,
		Recommended: true,
		HowToFix:    "Rename the schema to use PascalCase (e.g., 'user_profile' -> 'UserProfile').",
	}).Schemas(func(name string, s *sdk.Schema, _ string, r *sdk.Reporter) {
		result := sdk.V.TitleCase()(name, "schema name")
		if !result.Valid {
			r.At(s.Loc, "Schema %q should use PascalCase", name)
		}
	}).Register(p)

	// --- RequestBodies visitor ---

	sdk.Rule("request-body-required", sdk.Meta{
		Description: "Request bodies should explicitly set required: true",
		Severity:    sdk.Hint,
		Category:    sdk.Structure,
	}).RequestBodies(func(path, method string, rb *sdk.RequestBody, r *sdk.Reporter) {
		if !rb.Required {
			r.At(rb.Loc, "%s %s request body should be marked as required", method, path)
		}
	}).Register(p)

	// --- Paths visitor ---

	sdk.Rule("no-trailing-slash", sdk.Meta{
		Description: "API paths should not end with a trailing slash",
		Severity:    sdk.Warn,
		Category:    sdk.Paths,
		Recommended: true,
		HowToFix:    "Remove the trailing '/' from the path.",
	}).Paths(func(path string, item *sdk.PathItem, r *sdk.Reporter) {
		if len(path) > 1 && strings.HasSuffix(path, "/") {
			r.At(item.PathLoc, "Path %q has a trailing slash", path)
		}
	}).Register(p)

	// --- Servers visitor ---

	sdk.Rule("server-url-https", sdk.Meta{
		Description: "Server URLs should use HTTPS in production",
		Severity:    sdk.Warn,
		Category:    sdk.Servers,
		HowToFix:    "Change the server URL scheme from http:// to https://.",
	}).Servers(func(server *sdk.Server, r *sdk.Reporter) {
		if strings.HasPrefix(server.URL, "http://") {
			r.At(server.URLLoc, "Server URL %q uses HTTP; consider HTTPS", server.URL)
		}
	}).Register(p)

	// --- Parameters visitor ---

	sdk.Rule("parameter-description-required", sdk.Meta{
		Description: "All parameters should have a description",
		Severity:    sdk.Warn,
		Category:    sdk.Documentation,
		HowToFix:    "Add a 'description' field to the parameter.",
	}).Parameters(func(param *sdk.Parameter, r *sdk.Reporter) {
		if param.Description.Text == "" && param.Ref == "" {
			r.At(param.Loc, "Parameter %q is missing a description", param.Name)
		}
	}).Register(p)

	// --- Responses visitor ---

	sdk.Rule("response-description-required", sdk.Meta{
		Description: "Every response must have a description",
		Severity:    sdk.Warn,
		Category:    sdk.Documentation,
		HowToFix:    "Add a 'description' field to the response.",
	}).Responses(func(code string, resp *sdk.Response, r *sdk.Reporter) {
		if resp.Description.Text == "" && resp.Ref == "" {
			r.At(resp.Loc, "Response %q is missing a description", code)
		}
	}).Register(p)

	// --- Tags visitor ---

	sdk.Rule("tag-description-required", sdk.Meta{
		Description: "Tags should include a description for API documentation",
		Severity:    sdk.Warn,
		Category:    sdk.Documentation,
		HowToFix:    "Add a 'description' field to the tag definition.",
	}).Tags(func(tag *sdk.Tag, r *sdk.Reporter) {
		if tag.Description.Text == "" {
			r.At(tag.Loc, "Tag %q is missing a description", tag.Name)
		}
	}).Register(p)

	// --- SecuritySchemes visitor ---

	sdk.Rule("security-scheme-description", sdk.Meta{
		Description: "Security schemes should include a description",
		Severity:    sdk.Hint,
		Category:    sdk.Security,
		HowToFix:    "Add a 'description' explaining how to authenticate.",
	}).SecuritySchemes(func(name string, ss *sdk.SecurityScheme, r *sdk.Reporter) {
		if ss.Description.Text == "" {
			r.At(ss.Loc, "Security scheme %q is missing a description", name)
		}
	}).Register(p)

	p.Serve()
}
