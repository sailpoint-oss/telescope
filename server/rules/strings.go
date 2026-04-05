package rules

import "github.com/sailpoint-oss/barrelman"

var (
	IsCapitalized       = barrelman.IsCapitalized
	IsKebabCase         = barrelman.IsKebabCase
	ContainsHTTPVerb    = barrelman.ContainsHTTPVerb
	HasTrailingSlash    = barrelman.HasTrailingSlash
	IsHTTPS             = barrelman.IsHTTPS
	ContainsCredentials = barrelman.ContainsCredentials
	ExtractPathParams   = barrelman.ExtractPathParams
	NonParamSegments    = barrelman.NonParamSegments
	PathParamRegex      = barrelman.PathParamRegex
)
