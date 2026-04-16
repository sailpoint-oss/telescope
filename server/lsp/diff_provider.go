package lsp

import (
	"fmt"
	"log/slog"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"

	"github.com/pb33f/libopenapi/what-changed/model"

	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/diff"
)

const diffDiagSource = "telescope-diff"

// DiffProvider publishes breaking-change diagnostics after save when enabled in config.
type DiffProvider struct {
	cfg *config.Config
	mux *DiagnosticMux
	log *slog.Logger
}

// NewDiffProvider wires diff-on-save against a git base ref.
func NewDiffProvider(cfg *config.Config, mux *DiagnosticMux, log *slog.Logger) *DiffProvider {
	if log == nil {
		log = slog.Default()
	}
	return &DiffProvider{cfg: cfg, mux: mux, log: log}
}

// OnDidSave implements gossip.DidSaveHandler.
func (p *DiffProvider) OnDidSave(ctx *gossip.Context, params *protocol.DidSaveTextDocumentParams) error {
	if p == nil || p.mux == nil || p.cfg == nil || !p.cfg.LSP.DiffOnSave {
		return nil
	}
	uri := params.TextDocument.URI
	if !isOpenAPISpecURI(string(uri)) {
		return nil
	}
	doc := ctx.Documents.Get(uri)
	if doc == nil {
		return nil
	}
	updated := []byte(doc.Text())
	if len(strings.TrimSpace(string(updated))) == 0 {
		p.mux.ClearSource(uri, diffDiagSource)
		return nil
	}

	ws := workspaceRootForContext(ctx)
	repoRoot := resolveGitTopLevel(ws)
	if repoRoot == "" {
		p.mux.ClearSource(uri, diffDiagSource)
		return nil
	}

	abs := uriToFSPath(string(protocol.NormalizeURI(uri)))
	rel, err := filepath.Rel(repoRoot, abs)
	if err != nil || strings.HasPrefix(rel, "..") {
		p.mux.ClearSource(uri, diffDiagSource)
		return nil
	}
	rel = filepath.ToSlash(rel)

	baseRef := p.cfg.EffectiveDiffCompareBaseRef()
	original, err := diff.ReadAtRef(repoRoot, baseRef, rel)
	if err != nil {
		p.mux.ClearSource(uri, diffDiagSource)
		return nil
	}

	rulesPath := strings.TrimSpace(p.cfg.LSP.BreakingRulesPath)
	if rulesPath != "" && !filepath.IsAbs(rulesPath) {
		rulesPath = filepath.Join(ws, rulesPath)
	}

	res, err := diff.Compare(original, updated, diff.CompareOpts{BreakingRulesPath: rulesPath})
	if err != nil {
		p.log.Debug("telescope.diffOnSave", "uri", uri, "error", err)
		p.mux.ClearSource(uri, diffDiagSource)
		return nil
	}
	diags := breakingChangeDiagnostics(res)
	p.mux.Set(uri, diffDiagSource, diags)
	return nil
}

func isOpenAPISpecURI(uri string) bool {
	s := strings.ToLower(uri)
	switch {
	case strings.Contains(s, ".yaml"), strings.Contains(s, ".yml"):
		return true
	case strings.Contains(s, ".json"):
		return true
	default:
		return false
	}
}

func gitTopLevel(dir string) string {
	if dir == "" {
		return ""
	}
	out, err := exec.Command("git", "-C", dir, "rev-parse", "--show-toplevel").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// resolveGitTopLevel is indirected through a package variable so tests can
// inject a known repo path without standing up a full gossip server.
var resolveGitTopLevel = gitTopLevel

// workspaceRootForContext likewise lets tests override the workspace-root
// source that OnDidSave feeds into resolveGitTopLevel.
var workspaceRootForContext = func(ctx *gossip.Context) string {
	if ctx == nil {
		return ""
	}
	return uriToFSPath(string(protocol.NormalizeURI(ctx.WorkspaceRoot())))
}

func breakingChangeDiagnostics(res *diff.Result) []protocol.Diagnostic {
	if res == nil || res.Changes == nil {
		return nil
	}
	var diags []protocol.Diagnostic
	for _, c := range res.Changes.GetAllChanges() {
		if c == nil || !c.Breaking {
			continue
		}
		line, col := 0, 0
		if c.Context != nil && c.Context.NewLine != nil {
			line = *c.Context.NewLine
			if c.Context.NewColumn != nil {
				col = *c.Context.NewColumn
			}
		}
		// libopenapi uses 1-based line numbers in ChangeContext; LSP is 0-based.
		if line > 0 {
			line--
		}
		if col > 0 {
			col--
		}
		msg := describeModelChange(c)
		diags = append(diags, protocol.Diagnostic{
			Range: protocol.Range{
				Start: protocol.Position{Line: uint32(line), Character: uint32(col)},
				End:   protocol.Position{Line: uint32(line), Character: uint32(col) + 1},
			},
			Severity: protocol.SeverityWarning,
			Code:     "breaking-change",
			Source:   "telescope-diff",
			Message:  msg,
		})
	}
	return diags
}

func describeModelChange(c *model.Change) string {
	if c == nil {
		return ""
	}
	prop := c.Property
	if prop == "" {
		prop = "(property)"
	}
	return fmt.Sprintf("Breaking API change: %s (%s -> %s)", prop, c.Original, c.New)
}
