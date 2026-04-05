package lsp

import (
	"fmt"
	"strings"

	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/barometer/pkg/barometer"
	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

const contractDiagSource = "telescope-contract"

func contractDiagnosticsForOpenAPI(idx *openapi.Index, result *barometer.Result, ct *config.ContractTestsConfig) []protocol.Diagnostic {
	if idx == nil || result == nil || result.OpenAPI == nil {
		return nil
	}
	var out []protocol.Diagnostic
	for _, r := range result.OpenAPI.Results {
		if r.Pass {
			continue
		}
		msg := strings.TrimSpace(r.Error)
		if msg == "" {
			msg = "contract test failed"
		}
		msg = augmentContractAuthMessage(msg, ct)
		rng := contractRangeForOperation(idx, r.OperationID, r.Path, r.Method)
		out = append(out, protocol.Diagnostic{
			Range:    rng,
			Severity: protocol.SeverityError,
			Source:   contractDiagSource,
			Code:     "contract.openapi",
			Message:  fmt.Sprintf("%s %s: %s", strings.ToUpper(r.Method), r.Path, msg),
		})
	}
	return out
}

func augmentContractAuthMessage(msg string, ct *config.ContractTestsConfig) string {
	if ct == nil {
		return msg
	}
	lm := strings.ToLower(msg)
	if !strings.Contains(lm, "credential") && !strings.Contains(lm, "security requirement") {
		return msg
	}
	h := contractCredentialHints(ct)
	if h == "" {
		return msg
	}
	return msg + ". " + h
}

func contractCredentialHints(ct *config.ContractTestsConfig) string {
	if ct == nil || len(ct.Credentials) == 0 {
		return ""
	}
	var parts []string
	for name, src := range ct.Credentials {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		if hint := src.CredentialEnvHintString(); hint != "" {
			parts = append(parts, fmt.Sprintf("%s (%s)", name, hint))
		}
	}
	if len(parts) == 0 {
		return ""
	}
	return "Configured credential env keys: " + strings.Join(parts, "; ")
}

func contractRangeForOperation(idx *openapi.Index, operationID, path, method string) protocol.Range {
	if ref := idx.Operations[operationID]; ref != nil && ref.Operation != nil {
		r := openapi.LocOrFallback(ref.Operation.OperationIDLoc, ref.Operation.Loc)
		return protocol.Range{
			Start: adapt.PositionToProtocol(r.Range.Start),
			End:   adapt.PositionToProtocol(r.Range.End),
		}
	}
	if path != "" && method != "" {
		for _, ref := range idx.OperationsByPath[path] {
			if strings.EqualFold(ref.Method, method) && ref.Operation != nil {
				r := openapi.LocOrFallback(ref.Operation.OperationIDLoc, ref.Operation.Loc)
				return protocol.Range{
					Start: adapt.PositionToProtocol(r.Range.Start),
					End:   adapt.PositionToProtocol(r.Range.End),
				}
			}
		}
	}
	return protocol.Range{
		Start: protocol.Position{Line: 0, Character: 0},
		End:   protocol.Position{Line: 0, Character: 1},
	}
}

func contractDiagnosticsForArazzo(uri protocol.DocumentURI, result *barometer.Result) []protocol.Diagnostic {
	if result == nil || result.Arazzo == nil {
		return nil
	}
	var out []protocol.Diagnostic
	for _, w := range result.Arazzo.Workflows {
		if w.Pass {
			continue
		}
		msg := strings.TrimSpace(w.Error)
		if msg == "" {
			msg = "workflow step failed"
		}
		out = append(out, protocol.Diagnostic{
			Range: protocol.Range{
				Start: protocol.Position{Line: 0, Character: 0},
				End:   protocol.Position{Line: 0, Character: 1},
			},
			Severity: protocol.SeverityError,
			Source:   contractDiagSource,
			Code:     "contract.arazzo",
			Message:  fmt.Sprintf("workflow %s: %s", w.WorkflowID, msg),
		})
	}
	_ = uri
	return out
}
