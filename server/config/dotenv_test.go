package config_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/sailpoint-oss/telescope/server/config"
)

func TestParseDotEnv(t *testing.T) {
	data := []byte(`
# c
export FOO=bar
API_KEY="hello world"
EMPTY=
`)
	m := config.ParseDotEnv(data)
	if m["FOO"] != "bar" {
		t.Fatalf("FOO = %q", m["FOO"])
	}
	if m["API_KEY"] != "hello world" {
		t.Fatalf("API_KEY = %q", m["API_KEY"])
	}
	if m["EMPTY"] != "" {
		t.Fatalf("EMPTY = %q", m["EMPTY"])
	}
}

func TestLoadWorkspaceDotenv_MergeOrder(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, ".env"), []byte("A=1\nB=1\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, ".env.local"), []byte("B=2\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	m, err := config.LoadWorkspaceDotenv(dir, []string{".env", ".env.local"})
	if err != nil {
		t.Fatal(err)
	}
	if m["A"] != "1" || m["B"] != "2" {
		t.Fatalf("got %#v", m)
	}
}

func TestLookupEnv_Precedence(t *testing.T) {
	t.Setenv("X_FROM_OS", "os")
	m := map[string]string{"X_FROM_OS": "dot"}
	if config.LookupEnv(m, "X_FROM_OS") != "dot" {
		t.Fatal("expected dotenv to win")
	}
}
