// Package rules provides the rule registry, metadata types, and registration
// functions for all Telescope diagnostic rules.
package rules

import "github.com/sailpoint-oss/barrelman"

type Category = barrelman.Category
type RuleMeta = barrelman.RuleMeta
type Rule = barrelman.Rule
type Registry = barrelman.Registry

const (
	CategoryNaming        = barrelman.CategoryNaming
	CategoryDocumentation = barrelman.CategoryDocumentation
	CategoryStructure     = barrelman.CategoryStructure
	CategoryTypes         = barrelman.CategoryTypes
	CategorySecurity      = barrelman.CategorySecurity
	CategoryServers       = barrelman.CategoryServers
	CategoryPaths         = barrelman.CategoryPaths
	CategoryReferences    = barrelman.CategoryReferences
	CategorySyntax        = barrelman.CategorySyntax
	CategoryOWASP         = barrelman.CategoryOWASP
)

var NewRegistry = barrelman.NewRegistry
var DefaultRegistry = barrelman.DefaultRegistry

const Source = barrelman.Source
const DocBaseURL = barrelman.DocBaseURL
