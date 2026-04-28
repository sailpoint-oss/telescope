package projection

import (
	"net/url"
	"path/filepath"
	"strings"

	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/barrelman"
	"github.com/sailpoint-oss/cartographer/sourceloc"
)

// ProjectedFromKey marks a diagnostic as having been projected from a
// generated spec rather than authored directly on the source file.
const ProjectedFromKey = "telescope.projectedFrom"

// ProjectionData is the metadata embedded in protocol.Diagnostic.Data on
// every projected diagnostic.
type ProjectionData struct {
	ProjectedFrom string `json:"projectedFrom"`
	SpecURI       string `json:"specUri"`
	Pointer       string `json:"pointer"`
}

// Publisher converts a set of barrelman diagnostics on a generated spec into
// a `{specURI: [...], sourceURI: [...]}` map the mux can publish directly.
//
// The spec URI is always present; each additional source URI contains a
// projected copy of each spec diagnostic whose JSON pointer resolves to a
// source location, with ProjectionData in its Data field.
type Publisher struct {
	Resolver *Resolver
	// WorkspaceRoot is the absolute filesystem root used to convert relative
	// source file paths (from x-source-file) into full URIs.
	WorkspaceRoot string
}

// Project returns per-URI diagnostic lists for a set of spec diagnostics.
// The spec URI is always present, even when no source projection applies.
//
// pointerFor extracts the spec JSON pointer from a barrelman diagnostic. The
// caller supplies it because barrelman encodes the pointer in
// Diagnostic.Data (whose shape is rule-specific) rather than a dedicated
// field. Passing nil disables source projection.
func (p *Publisher) Project(specURI protocol.DocumentURI, specDiags []protocol.Diagnostic, barrel []barrelman.Diagnostic, pointerFor func(barrelman.Diagnostic) string) map[protocol.DocumentURI][]protocol.Diagnostic {
	out := map[protocol.DocumentURI][]protocol.Diagnostic{
		specURI: specDiags,
	}
	if p == nil || p.Resolver == nil || pointerFor == nil || len(barrel) != len(specDiags) {
		return out
	}
	for i, diag := range specDiags {
		pointer := pointerFor(barrel[i])
		if pointer == "" {
			continue
		}
		loc, ok := p.Resolver.Project(pointer)
		if !ok || loc.IsZero() {
			continue
		}
		srcURI := p.sourceURI(loc.File)
		if srcURI == "" {
			continue
		}
		proj := protocol.Diagnostic{
			Range:    sourceLocToRange(loc),
			Severity: diag.Severity,
			Source:   diag.Source,
			Code:     diag.Code,
			Message:  diag.Message,
			Data: ProjectionData{
				ProjectedFrom: "telescope/generated",
				SpecURI:       string(specURI),
				Pointer:       pointer,
			},
		}
		out[srcURI] = append(out[srcURI], proj)
	}
	return out
}

func (p *Publisher) sourceURI(file string) protocol.DocumentURI {
	if file == "" {
		return ""
	}
	abs := file
	if !filepath.IsAbs(abs) && p.WorkspaceRoot != "" {
		abs = filepath.Join(p.WorkspaceRoot, file)
	}
	u := url.URL{Scheme: "file", Path: filepath.ToSlash(abs)}
	if !strings.HasPrefix(u.Path, "/") {
		u.Path = "/" + u.Path
	}
	return protocol.DocumentURI(u.String())
}

// sourceLocToRange converts a 1-based sourceloc.Location into a 0-based LSP
// Range. We highlight a single character at the start position because the
// extraction pipeline only records start positions, not spans.
func sourceLocToRange(loc sourceloc.Location) protocol.Range {
	line := uint32(0)
	if loc.Line > 0 {
		line = uint32(loc.Line - 1)
	}
	col := uint32(0)
	if loc.Column > 0 {
		col = uint32(loc.Column - 1)
	}
	return protocol.Range{
		Start: protocol.Position{Line: line, Character: col},
		End:   protocol.Position{Line: line, Character: col + 1},
	}
}
