// Package parser provides a protocol-independent intermediate representation (IR)
// for parsed YAML/JSON documents. It defines SemanticNode (a tree of typed nodes
// with source ranges), PointerIndex (O(1) JSON pointer to range lookup), and
// VirtualDocument (embedded content such as YAML literal blocks with position
// mapping back to the parent document). This package does not import any LSP
// or gossip types; it depends only on core/types for Range and Position.
package parser
