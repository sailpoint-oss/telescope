package bridge

import (
	"fmt"
	"sort"
	"strings"

	"github.com/sailpoint-oss/barrelman"
	navigator "github.com/sailpoint-oss/navigator"
)

const (
	duplicateOperationIDCodeLegacy       = "operation-operationId-unique"
	duplicateOperationIDCodeGuideline    = "sailpoint-operation-id-unique"
	duplicateOperationIDPrefixLegacy     = "operationId '"
	duplicateOperationIDPrefixGuideline  = "operationId '"
	duplicateOperationIDMessage          = "' is already used at "
	duplicateOperationIDRelatedLegacy    = "First defined here at %s"
	duplicateOperationIDRelatedGuideline = "First defined here at %s"
)

type duplicateOperationIDFirst struct {
	loc  navigator.Loc
	desc string
}

func stabilizeDiagnostics(idx *navigator.Index, diags []barrelman.Diagnostic) []barrelman.Diagnostic {
	if idx == nil || idx.Document == nil || len(diags) == 0 {
		return diags
	}

	firsts := canonicalDuplicateOperationIDFirsts(idx.Document)
	if len(firsts) == 0 {
		return diags
	}

	stable := make([]barrelman.Diagnostic, len(diags))
	copy(stable, diags)

	for i := range stable {
		if !isDuplicateOperationIDCode(stable[i].Code) {
			continue
		}
		opID, prefix, ok := duplicateOperationIDFromMessage(stable[i].Message)
		if !ok {
			continue
		}
		first, ok := firsts[opID]
		if !ok {
			continue
		}

		stable[i].Message = fmt.Sprintf("%s%s%s%s", prefix, opID, duplicateOperationIDMessage, first.desc)
		if len(stable[i].Related) == 0 {
			stable[i].Related = append(stable[i].Related, barrelman.RelatedInformation{})
		}
		for j := range stable[i].Related {
			stable[i].Related[j].Range = first.loc.Range
			stable[i].Related[j].Message = fmt.Sprintf(duplicateOperationIDRelatedMessage(prefix), first.desc)
		}
	}

	return stable
}

func isDuplicateOperationIDCode(code string) bool {
	return code == duplicateOperationIDCodeLegacy || code == duplicateOperationIDCodeGuideline
}

func canonicalDuplicateOperationIDFirsts(doc *navigator.Document) map[string]duplicateOperationIDFirst {
	if doc == nil {
		return nil
	}

	seen := make(map[string]duplicateOperationIDFirst)
	firsts := make(map[string]duplicateOperationIDFirst)

	for _, path := range sortedDuplicateOperationIDPaths(doc.Paths) {
		item := doc.Paths[path]
		for _, mo := range item.Operations() {
			opID := mo.Operation.OperationID
			if opID == "" {
				continue
			}

			desc := strings.ToUpper(mo.Method) + " " + path
			if first, ok := seen[opID]; ok {
				firsts[opID] = first
				continue
			}
			seen[opID] = duplicateOperationIDFirst{
				loc:  mo.Operation.OperationIDLoc,
				desc: desc,
			}
		}
	}

	return firsts
}

func duplicateOperationIDFromMessage(message string) (string, string, bool) {
	for _, prefix := range []string{duplicateOperationIDPrefixLegacy, duplicateOperationIDPrefixGuideline} {
		rest, ok := strings.CutPrefix(message, prefix)
		if !ok {
			continue
		}
		opID, _, ok := strings.Cut(rest, duplicateOperationIDMessage)
		if !ok || opID == "" {
			return "", "", false
		}
		return opID, prefix, true
	}
	return "", "", false
}

func duplicateOperationIDRelatedMessage(prefix string) string {
	if prefix == duplicateOperationIDPrefixGuideline {
		return duplicateOperationIDRelatedGuideline
	}
	return duplicateOperationIDRelatedLegacy
}

func sortedDuplicateOperationIDPaths(paths map[string]*navigator.PathItem) []string {
	keys := make([]string, 0, len(paths))
	for path := range paths {
		keys = append(keys, path)
	}
	sort.Strings(keys)
	return keys
}
