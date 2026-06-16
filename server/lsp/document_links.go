package lsp

import (
	"net/url"
	"path"
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/markdown"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// NewDocumentLinkHandler provides clickable $ref links, URLs extracted from
// description fields, and externalDocs.url links.
func NewDocumentLinkHandler(cache *openapi.IndexCache, graphBridge *GraphBridge) gossip.DocumentLinkHandler {
	return func(ctx *gossip.Context, params *protocol.DocumentLinkParams) ([]protocol.DocumentLink, error) {
		if !handlerTargetGate(ctx, graphBridge, cache, params.TextDocument.URI) {
			return nil, nil
		}
		idx := cache.Get(params.TextDocument.URI)
		if idx == nil {
			return nil, nil
		}

		docURI := params.TextDocument.URI

		var links []protocol.DocumentLink

		// $ref links
		for _, ref := range idx.AllRefs {
			target := resolveRefTarget(docURI, ref.Target)
			if target == nil {
				continue
			}
			links = append(links, protocol.DocumentLink{
				Range:   adapt.RangeToProtocol(ref.Loc.Range),
				Target:  target,
				Tooltip: ref.Target,
			})
		}

		// URLs from description fields
		links = append(links, descriptionLinks(idx, docURI)...)

		// externalDocs.url links
		links = append(links, externalDocsLinks(idx)...)

		return links, nil
	}
}

// resolveRefTarget converts a $ref value into a clickable DocumentURI.
func resolveRefTarget(docURI protocol.DocumentURI, refValue string) *protocol.DocumentURI {
	if refValue == "" {
		return nil
	}

	if strings.HasPrefix(refValue, "#") {
		// Local refs are handled by definition/typeDefinition providers.
		// Returning same-file fragment DocumentLinks causes VS Code to open
		// duplicate fragment tabs.
		return nil
	}

	parts := strings.SplitN(refValue, "#", 2)
	filePart := parts[0]
	fragment := ""
	if len(parts) == 2 {
		fragment = "#" + parts[1]
	}

	baseStr := string(docURI)
	if u, err := url.Parse(baseStr); err == nil && u.Scheme == "file" {
		baseDir := path.Dir(u.Path)
		resolved := path.Join(baseDir, filePart)
		target := &url.URL{Scheme: "file", Path: resolved}
		uri := protocol.DocumentURI(target.String() + fragment)
		return &uri
	}

	uri := protocol.DocumentURI(filePart + fragment)
	return &uri
}

// descriptionLinks extracts markdown links from description fields
// across the entire OpenAPI document.
func descriptionLinks(idx *openapi.Index, docURI protocol.DocumentURI) []protocol.DocumentLink {
	if idx == nil || idx.Document == nil {
		return nil
	}
	var links []protocol.DocumentLink
	doc := idx.Document

	extractLinks := func(desc openapi.DescriptionValue) {
		if desc.Text == "" {
			return
		}
		for _, ml := range markdown.Links(desc.Text) {
			target := resolveMarkdownLinkTarget(docURI, ml.Destination)
			if target == nil {
				continue
			}
			rng := markdown.TranslateRange(desc, ml.Line, ml.Column, ml.Length)
			tooltip := ml.Text
			if tooltip == "" {
				tooltip = ml.Destination
			}
			links = append(links, protocol.DocumentLink{
				Range:   rng,
				Target:  target,
				Tooltip: tooltip,
			})
		}
	}

	if doc.Info != nil {
		extractLinks(doc.Info.Description)
	}

	for i := range doc.Tags {
		extractLinks(doc.Tags[i].Description)
	}

	for _, item := range doc.Paths {
		extractLinks(item.Description)
		for _, mo := range item.Operations() {
			op := mo.Operation
			extractLinks(op.Description)
			for _, p := range op.Parameters {
				extractLinks(p.Description)
			}
			if op.RequestBody != nil {
				extractLinks(op.RequestBody.Description)
			}
			for _, resp := range op.Responses {
				extractLinks(resp.Description)
			}
		}
	}

	if doc.Components != nil {
		for _, schema := range doc.Components.Schemas {
			extractSchemaLinks(schema, extractLinks)
		}
		for _, ss := range doc.Components.SecuritySchemes {
			extractLinks(ss.Description)
		}
		for _, ex := range doc.Components.Examples {
			extractLinks(ex.Description)
		}
	}

	return links
}

func resolveMarkdownLinkTarget(docURI protocol.DocumentURI, destination string) *protocol.DocumentURI {
	if destination == "" || strings.HasPrefix(destination, "#") {
		return nil
	}

	if parsed, err := url.Parse(destination); err == nil && parsed.Scheme != "" {
		uri := protocol.DocumentURI(parsed.String())
		return &uri
	}

	base, err := url.Parse(string(docURI))
	if err != nil || base.Scheme != "file" {
		uri := protocol.DocumentURI(destination)
		return &uri
	}

	destURL, err := url.Parse(destination)
	if err != nil {
		return nil
	}
	targetPath := destURL.Path
	if targetPath == "" {
		return nil
	}

	if strings.HasPrefix(targetPath, "/") {
		targetPath = path.Clean(targetPath)
	} else {
		targetPath = path.Clean(path.Join(path.Dir(base.Path), targetPath))
	}

	target := &url.URL{
		Scheme:   "file",
		Path:     targetPath,
		Fragment: destURL.Fragment,
	}
	uri := protocol.DocumentURI(target.String())
	return &uri
}

func extractSchemaLinks(schema *openapi.Schema, fn func(openapi.DescriptionValue)) {
	if schema == nil {
		return
	}
	fn(schema.Description)
	for _, prop := range schema.Properties {
		extractSchemaLinks(prop, fn)
	}
	if schema.Items != nil {
		extractSchemaLinks(schema.Items, fn)
	}
}

// externalDocsLinks surfaces externalDocs.url values as clickable document links.
func externalDocsLinks(idx *openapi.Index) []protocol.DocumentLink {
	if idx == nil || idx.Document == nil {
		return nil
	}
	doc := idx.Document
	var links []protocol.DocumentLink

	addExtDocs := func(ed *openapi.ExternalDocs) {
		if ed == nil || ed.URL == "" {
			return
		}
		target := protocol.DocumentURI(ed.URL)
		tooltip := ed.Description.Text
		if tooltip == "" {
			tooltip = ed.URL
		}
		linkRange := adapt.RangeToProtocol(ed.URLLoc.Range)
		if isZeroRange(linkRange) {
			linkRange = adapt.RangeToProtocol(ed.Loc.Range)
		}
		links = append(links, protocol.DocumentLink{
			Range:   linkRange,
			Target:  &target,
			Tooltip: tooltip,
		})
	}

	addExtDocs(doc.ExternalDocs)
	for i := range doc.Tags {
		addExtDocs(doc.Tags[i].ExternalDocs)
	}
	for _, item := range doc.Paths {
		for _, mo := range item.Operations() {
			addExtDocs(mo.Operation.ExternalDocs)
		}
	}

	return links
}
