package rulesets

// SpectralOAS is the name of the Spectral OpenAPI built-in ruleset.
const SpectralOAS = "spectral:oas"

// spectralToTelescope maps Spectral OAS rule IDs to their Telescope
// equivalents. Rules listed here are implemented natively in Telescope and
// will be enabled/overridden via the DiagnosticTransformer rather than run
// through the custom Spectral engine.
var spectralToTelescope = map[string]string{
	"info-contact":                 "info-contact",
	"info-description":             "info-description",
	"info-license":                 "info-license",
	"operation-description":        "operation-description",
	"operation-operationId":        "operation-operationId",
	"operation-operationId-unique": "operation-operationId-unique",
	"operation-tags":               "operation-tags",
	"path-keys-no-trailing-slash":  "path-keys-no-trailing-slash",
	"path-declarations-must-exist": "path-declarations-must-exist",
	"path-params":                  "path-params",
	"no-eval-in-markdown":          "description-markdown",
	"no-script-tags-in-markdown":   "description-html",
	"oas3-api-servers":             "oas3-api-servers",
	"oas3-schema":                  "oas3-schema",
	"tag-description":              "tag-description",
	"parameter-description":        "parameter-description",
	"oas3-unused-component":        "unused-component",
	// TODO: native implementations needed
	// "contact-properties":           "contact-properties",
	// "license-url":                  "license-url",
	// "oas3-valid-media-example":     "oas3-valid-media-example",
	// "oas3-valid-schema-example":    "oas3-valid-schema-example",
}

// telescopeToSpectral is the reverse mapping.
var telescopeToSpectral = func() map[string]string {
	m := make(map[string]string, len(spectralToTelescope))
	for spectral, telescope := range spectralToTelescope {
		m[telescope] = spectral
	}
	return m
}()

// SpectralToTelescopeID returns the native Telescope rule ID for a Spectral
// OAS rule, or the original ID if no mapping exists.
func SpectralToTelescopeID(spectralID string) string {
	if tid, ok := spectralToTelescope[spectralID]; ok {
		return tid
	}
	return spectralID
}

// TelescopeToSpectralID returns the Spectral OAS rule ID for a native
// Telescope rule, or the original ID if no mapping exists.
func TelescopeToSpectralID(telescopeID string) string {
	if sid, ok := telescopeToSpectral[telescopeID]; ok {
		return sid
	}
	return telescopeID
}

// IsNativeRule reports whether the given Spectral rule ID has a native
// Telescope implementation.
func IsNativeRule(spectralID string) bool {
	_, ok := spectralToTelescope[spectralID]
	return ok
}

// spectralOASDefaults defines the default severity for each rule in the
// spectral:oas ruleset. These match Spectral's defaults.
var spectralOASDefaults = map[string]string{
	"info-contact":                 "warn",
	"info-description":             "warn",
	"info-license":                 "warn",
	"operation-description":        "warn",
	"operation-operationId":        "warn",
	"operation-operationId-unique": "error",
	"operation-tags":               "warn",
	"path-keys-no-trailing-slash":  "warn",
	"path-declarations-must-exist": "error",
	"path-params":                  "error",
	"no-eval-in-markdown":          "warn",
	"no-script-tags-in-markdown":   "warn",
	"oas3-api-servers":             "warn",
	"oas3-schema":                  "error",
	"tag-description":              "warn",
	"parameter-description":        "warn",
	"contact-properties":           "warn",
	"duplicated-entry-in-enum":     "warn",
	"license-url":                  "warn",
	"oas3-operation-security-defined": "warn",
	"oas3-valid-media-example":     "warn",
	"oas3-valid-schema-example":    "warn",
	"oas3-unused-component":        "warn",
	"typed-enum":                   "warn",
}

// GetSpectralBuiltin returns a RuleSet for the given Spectral built-in name.
// Currently only "spectral:oas" is supported.
func GetSpectralBuiltin(name string) *RuleSet {
	if name != SpectralOAS {
		return nil
	}

	rs := &RuleSet{
		Name:        "Spectral OAS",
		Description: "Spectral OpenAPI ruleset mapped to Telescope rules.",
		Rules:       make(map[string]RuleDefinition, len(spectralOASDefaults)),
	}

	for ruleID, sev := range spectralOASDefaults {
		rs.Rules[ruleID] = RuleDefinition{Severity: sev}
	}

	return rs
}
