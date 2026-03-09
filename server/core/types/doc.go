// Package types defines protocol-independent core types shared by every
// Telescope consumer (LSP server, CLI, SDK importers). No type in this
// package may reference any LSP protocol or JSON-RPC type. This invariant
// is enforced by CI via a dependency check.
package types
