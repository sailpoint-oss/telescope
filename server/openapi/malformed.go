package openapi

import navigator "github.com/sailpoint-oss/navigator"

// IsMalformed reports whether Navigator found syntax-level issues that should
// be left to the YAML/JSON language servers instead of Telescope. This
// triggers the lazy navigator parse since the malformed-check is fundamentally
// a navigator concern.
func (idx *Index) IsMalformed() bool {
	if idx == nil {
		return false
	}
	return NavigatorIndexIsMalformed(idx.navIndex())
}

// NavigatorIndexIsMalformed reports whether Navigator found syntax-level
// issues, or the document root is not a mapping/object.
func NavigatorIndexIsMalformed(idx *navigator.Index) bool {
	if idx == nil {
		return false
	}
	for _, issue := range idx.Issues {
		if issue.Category == navigator.CategorySyntax {
			return true
		}
		if issue.Code == "structural.root-not-mapping" {
			return true
		}
	}
	if idx.SemanticRoot() == nil {
		return true
	}
	if idx.PrimaryValue() == nil {
		return true
	}
	return false
}
