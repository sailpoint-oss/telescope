package analyzers

import (
	"fmt"
	"net/url"
	"strings"

	"github.com/sailpoint-oss/barrelman"
	navigator "github.com/sailpoint-oss/navigator"
)

// Native implementations of Spectral OAS rules that the telescope rulesets
// table (server/rulesets/spectral_oas.go) previously listed as TODO. These
// live alongside example-matches-format because they share the same shape
// (walk navigator.Index, emit barrelman.Diagnostic) and are registered via
// telescopeGenericRules() / telescopePolicyRules() in register.go.
//
// Scope (current): contact-properties, license-url.
// Deferred: oas3-valid-media-example and oas3-valid-schema-example, which
// require full JSON Schema evaluation of example payloads. Those are better
// built as an extension of example-matches-format or against
// libopenapi-validator; they remain in the spectral_oas TODO list until then.

func contactPropertiesRule() barrelman.Rule {
	return barrelman.Rule{
		ID: "contact-properties",
		Meta: barrelman.RuleMeta{
			ID:          "contact-properties",
			Description: "Contact object should declare name, url, and email.",
			Severity:    barrelman.SeverityWarning,
			Category:    barrelman.CategoryDocumentation,
			Recommended: true,
			Formats:     []navigator.Format{navigator.FormatOAS3},
		},
		Run: runContactProperties,
	}
}

func runContactProperties(ctx *barrelman.AnalysisContext) []barrelman.Diagnostic {
	if ctx == nil || ctx.Index == nil || ctx.Index.Document == nil {
		return nil
	}
	doc := ctx.Index.Document
	if doc.Info == nil {
		return nil
	}
	contact := doc.Info.Contact
	if contact == nil {
		return nil
	}
	var missing []string
	if strings.TrimSpace(contact.Name) == "" {
		missing = append(missing, "name")
	}
	if strings.TrimSpace(contact.URL) == "" {
		missing = append(missing, "url")
	}
	if strings.TrimSpace(contact.Email) == "" {
		missing = append(missing, "email")
	}
	if len(missing) == 0 {
		return nil
	}
	return []barrelman.Diagnostic{{
		URI:      ctx.URI,
		Range:    rangeFromLoc(contact.Loc),
		Severity: barrelman.SeverityWarning,
		Code:     "contact-properties",
		Source:   "telescope",
		Message:  fmt.Sprintf("Contact object should declare %s", strings.Join(missing, ", ")),
	}}
}

func licenseURLRule() barrelman.Rule {
	return barrelman.Rule{
		ID: "license-url",
		Meta: barrelman.RuleMeta{
			ID:          "license-url",
			Description: "License object should include a url when no identifier is provided.",
			Severity:    barrelman.SeverityWarning,
			Category:    barrelman.CategoryDocumentation,
			Recommended: true,
			Formats:     []navigator.Format{navigator.FormatOAS3},
		},
		Run: runLicenseURL,
	}
}

func runLicenseURL(ctx *barrelman.AnalysisContext) []barrelman.Diagnostic {
	if ctx == nil || ctx.Index == nil || ctx.Index.Document == nil {
		return nil
	}
	doc := ctx.Index.Document
	if doc.Info == nil || doc.Info.License == nil {
		return nil
	}
	lic := doc.Info.License
	// OpenAPI 3.1 allows identifier (SPDX) as a URL-free alternative.
	if strings.TrimSpace(lic.Identifier) != "" {
		return nil
	}
	rawURL := strings.TrimSpace(lic.URL)
	if rawURL == "" {
		return []barrelman.Diagnostic{{
			URI:      ctx.URI,
			Range:    rangeFromLoc(lic.Loc),
			Severity: barrelman.SeverityWarning,
			Code:     "license-url",
			Source:   "telescope",
			Message:  "License object should include a url or an SPDX identifier",
		}}
	}
	if _, err := url.Parse(rawURL); err != nil {
		return []barrelman.Diagnostic{{
			URI:      ctx.URI,
			Range:    rangeFromLoc(lic.Loc),
			Severity: barrelman.SeverityWarning,
			Code:     "license-url",
			Source:   "telescope",
			Message:  fmt.Sprintf("License url %q is not a valid URL", rawURL),
		}}
	}
	return nil
}
