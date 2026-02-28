package script

import (
	"fmt"

	"github.com/evanw/esbuild/pkg/api"
)

// TranspileTS converts TypeScript source to JavaScript using esbuild.
// The output uses CommonJS format to match the exports.meta / exports.check
// contract that the goja runtime expects.
func TranspileTS(source string) (string, error) {
	result := api.Transform(source, api.TransformOptions{
		Loader: api.LoaderTS,
		Target: api.ES2020,
		Format: api.FormatCommonJS,
	})
	if len(result.Errors) > 0 {
		msg := result.Errors[0]
		if msg.Location != nil {
			return "", fmt.Errorf("esbuild: %s (line %d)", msg.Text, msg.Location.Line)
		}
		return "", fmt.Errorf("esbuild: %s", msg.Text)
	}
	return string(result.Code), nil
}
