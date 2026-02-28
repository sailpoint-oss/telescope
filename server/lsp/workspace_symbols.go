package lsp

import (
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// NewWorkspaceSymbolHandler queries operations, schemas, parameters, and
// responses across all cached indexes.
func NewWorkspaceSymbolHandler(cache *openapi.IndexCache) gossip.WorkspaceSymbolHandler {
	return func(ctx *gossip.Context, params *protocol.WorkspaceSymbolParams) ([]protocol.SymbolInformation, error) {
		query := strings.ToLower(params.Query)
		var symbols []protocol.SymbolInformation

		for uri, idx := range cache.All() {
			if idx == nil || !idx.IsOpenAPI() {
				continue
			}

			// Operations (by operationId or path)
			for path, pathItem := range idx.Document.Paths {
				for _, mo := range pathItem.Operations() {
					opID := mo.Operation.OperationID
					if matchesQuery(query, opID, path, mo.Method) {
						name := strings.ToUpper(mo.Method) + " " + path
						if opID != "" {
							name = opID + " (" + strings.ToUpper(mo.Method) + " " + path + ")"
						}
						symbols = append(symbols, protocol.SymbolInformation{
							Name: name,
							Kind: protocol.SymbolMethod,
							Location: protocol.Location{
								URI:   uri,
								Range: mo.Operation.Loc.Range,
							},
						})
					}
				}
			}

			if idx.Document.Components == nil {
				continue
			}

			// Schemas
			for name, schema := range idx.Document.Components.Schemas {
				if matchesQuery(query, name) {
					symbols = append(symbols, protocol.SymbolInformation{
						Name: name,
						Kind: protocol.SymbolClass,
						Location: protocol.Location{
							URI:   uri,
							Range: schema.Loc.Range,
						},
					})
				}
			}

			// Parameters
			for name, param := range idx.Document.Components.Parameters {
				if matchesQuery(query, name) {
					symbols = append(symbols, protocol.SymbolInformation{
						Name: name,
						Kind: protocol.SymbolVariable,
						Location: protocol.Location{
							URI:   uri,
							Range: param.Loc.Range,
						},
					})
				}
			}

			// Responses
			for name, resp := range idx.Document.Components.Responses {
				if matchesQuery(query, name) {
					symbols = append(symbols, protocol.SymbolInformation{
						Name: name,
						Kind: protocol.SymbolField,
						Location: protocol.Location{
							URI:   uri,
							Range: resp.Loc.Range,
						},
					})
				}
			}

			// Security Schemes
			for name, ss := range idx.Document.Components.SecuritySchemes {
				if matchesQuery(query, name) {
					symbols = append(symbols, protocol.SymbolInformation{
						Name: name,
						Kind: protocol.SymbolProperty,
						Location: protocol.Location{
							URI:   uri,
							Range: ss.Loc.Range,
						},
					})
				}
			}
		}

		return symbols, nil
	}
}

func matchesQuery(query string, candidates ...string) bool {
	if query == "" {
		return true
	}
	for _, c := range candidates {
		if strings.Contains(strings.ToLower(c), query) {
			return true
		}
	}
	return false
}
