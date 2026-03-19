package openapi

import navigator "github.com/sailpoint-oss/navigator"

// All model types are aliases to navigator's canonical definitions.
type (
	Loc                      = navigator.Loc
	DescriptionValue         = navigator.DescriptionValue
	Document                 = navigator.Document
	Info                     = navigator.Info
	Contact                  = navigator.Contact
	License                  = navigator.License
	Server                   = navigator.Server
	ServerVariable           = navigator.ServerVariable
	PathItem                 = navigator.PathItem
	MethodOperation          = navigator.MethodOperation
	TagUsage                 = navigator.TagUsage
	Operation                = navigator.Operation
	Parameter                = navigator.Parameter
	RequestBody              = navigator.RequestBody
	MediaType                = navigator.MediaType
	Response                 = navigator.Response
	Header                   = navigator.Header
	Link                     = navigator.Link
	Schema                   = navigator.Schema
	Discriminator            = navigator.Discriminator
	Components               = navigator.Components
	Example                  = navigator.Example
	SecurityScheme           = navigator.SecurityScheme
	OAuthFlows               = navigator.OAuthFlows
	OAuthFlow                = navigator.OAuthFlow
	Callback                 = navigator.Callback
	SecurityRequirementEntry = navigator.SecurityRequirementEntry
	SecurityRequirement      = navigator.SecurityRequirement
	Tag                      = navigator.Tag
	ExternalDocs             = navigator.ExternalDocs
	Node                     = navigator.Node
)

// LocFromNode delegates to navigator.LocFromNode.
var LocFromNode = navigator.LocFromNode

// LocOrFallback delegates to navigator.LocOrFallback.
var LocOrFallback = navigator.LocOrFallback
