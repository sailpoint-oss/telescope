//go:build !windows

package uri

func normalizeDriveLetter(path string) string {
	return path
}
