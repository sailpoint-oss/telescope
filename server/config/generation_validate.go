package config

import "fmt"

// validateGeneration ensures that the `generation.openapi.*` fields are not
// combined in ways that silently do nothing.
//
// The primary target is user confusion: a `writeMode: onSave` or
// `writeSourceMap: true` line in a config file that forgot to set `output`
// would otherwise be ignored without any feedback. Surfacing these as
// validation errors shortens the feedback loop.
func (c *Config) validateGeneration() error {
	g := c.Generation.OpenAPI
	if !g.Enabled {
		return nil
	}
	if g.WriteSourceMap && g.Output == "" {
		return fmt.Errorf("generation.openapi.writeSourceMap requires generation.openapi.output to be set")
	}
	switch g.WriteMode {
	case "", "never", "onDemand", "onSave", "always":
	default:
		return fmt.Errorf("generation.openapi.writeMode %q is invalid (expected never|onDemand|onSave|always)", g.WriteMode)
	}
	if (g.WriteMode == "onSave" || g.WriteMode == "always" || g.WriteMode == "onDemand") && g.Output == "" {
		return fmt.Errorf("generation.openapi.writeMode=%q requires generation.openapi.output to be set", g.WriteMode)
	}
	if g.TriggerMode != "" && g.TriggerMode != "always" && g.TriggerMode != "save" {
		return fmt.Errorf("generation.openapi.triggerMode %q is invalid (expected always|save)", g.TriggerMode)
	}
	if g.DebounceMs < 0 {
		return fmt.Errorf("generation.openapi.debounceMs must be >= 0 (got %d)", g.DebounceMs)
	}
	return nil
}
