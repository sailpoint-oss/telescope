package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// DefaultEnvFiles are loaded in order from the workspace root when contractTests.envFiles is unset.
// Later files override earlier ones (e.g. .env.local overrides .env).
var DefaultEnvFiles = []string{".env", ".env.local"}

// LoadWorkspaceDotenv reads dotenv files from root and merges them. Missing files are skipped.
// If files is nil or empty, DefaultEnvFiles is used.
func LoadWorkspaceDotenv(root string, files []string) (map[string]string, error) {
	if root == "" {
		return nil, nil
	}
	if len(files) == 0 {
		files = DefaultEnvFiles
	}
	merged := make(map[string]string)
	for _, name := range files {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		path := filepath.Join(root, name)
		data, err := os.ReadFile(path)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, fmt.Errorf("read %s: %w", path, err)
		}
		for k, v := range ParseDotEnv(data) {
			merged[k] = v
		}
	}
	return merged, nil
}

// ParseDotEnv parses KEY=VALUE lines (export KEY= allowed). Empty lines and # comments are skipped.
// Values may be double- or single-quoted; basic escape sequences in double quotes are handled.
func ParseDotEnv(data []byte) map[string]string {
	out := make(map[string]string)
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		line = strings.TrimRight(line, "\r")
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "export ") {
			line = strings.TrimSpace(strings.TrimPrefix(line, "export "))
		}
		eq := strings.IndexByte(line, '=')
		if eq <= 0 {
			continue
		}
		key := strings.TrimSpace(line[:eq])
		if key == "" {
			continue
		}
		val := parseDotEnvValue(strings.TrimSpace(line[eq+1:]))
		out[key] = val
	}
	return out
}

func parseDotEnvValue(raw string) string {
	if len(raw) >= 2 {
		if raw[0] == '"' && raw[len(raw)-1] == '"' {
			s := raw[1 : len(raw)-1]
			return unescapeDoubleQuoted(s)
		}
		if raw[0] == '\'' && raw[len(raw)-1] == '\'' {
			return raw[1 : len(raw)-1]
		}
	}
	return raw
}

func unescapeDoubleQuoted(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for i := 0; i < len(s); i++ {
		if s[i] == '\\' && i+1 < len(s) {
			switch s[i+1] {
			case 'n':
				b.WriteByte('\n')
				i++
				continue
			case 'r':
				b.WriteByte('\r')
				i++
				continue
			case 't':
				b.WriteByte('\t')
				i++
				continue
			case '\\', '"':
				b.WriteByte(s[i+1])
				i++
				continue
			}
		}
		b.WriteByte(s[i])
	}
	return b.String()
}

// LookupEnv returns dotenv[key] if non-empty, else os.Getenv(key).
func LookupEnv(dotenv map[string]string, key string) string {
	key = strings.TrimSpace(key)
	if key == "" {
		return ""
	}
	if dotenv != nil {
		if v, ok := dotenv[key]; ok {
			v = strings.TrimSpace(v)
			if v != "" {
				return v
			}
		}
	}
	return strings.TrimSpace(os.Getenv(key))
}
