package parser

import navigator "github.com/sailpoint-oss/navigator"

// NodeKind is an alias for navigator.NodeKind.
type NodeKind = navigator.NodeKind

// NodeKind constants.
const (
	NodeMapping  = navigator.NodeMapping
	NodeSequence = navigator.NodeSequence
	NodeScalar   = navigator.NodeScalar
	NodeNull     = navigator.NodeNull
)

// SemanticNode is an alias for navigator.SemanticNode.
type SemanticNode = navigator.SemanticNode
