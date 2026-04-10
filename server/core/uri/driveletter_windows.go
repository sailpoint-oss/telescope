//go:build windows

package uri

import "strings"

func normalizeDriveLetter(path string) string {
	if len(path) >= 2 && path[1] == ':' {
		return strings.ToUpper(path[:1]) + path[1:]
	}
	return path
}
