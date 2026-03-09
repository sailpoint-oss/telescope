package lsp

import "github.com/LukasParke/gossip/protocol"

var LocationFromTarget = locationFromTarget

func UriToFSPath(uri string) string { return uriToFSPath(uri) }

func ExtractRefFromLine(line string) string { return extractRefFromLine(line) }

func IsZeroRange(r protocol.Range) bool { return isZeroRange(r) }

func GraphResolveRefTarget(baseURI, ref string) string { return graphResolveRefTarget(baseURI, ref) }

func GraphExtractFragment(ref string) string { return graphExtractFragment(ref) }
