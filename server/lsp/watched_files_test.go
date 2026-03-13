package lsp

import "testing"

func TestIsOpenAPIFileURI(t *testing.T) {
	tests := []struct {
		uri  string
		want bool
	}{
		{"file:///api.yaml", true},
		{"file:///api.yml", true},
		{"file:///api.json", true},
		{"file:///API.YAML", true},
		{"file:///spec.YML", true},
		{"file:///openapi.JSON", true},
		{"file:///main.go", false},
		{"file:///readme.md", false},
		{"file:///notes.txt", false},
		{"file:///Makefile", false},
		{"file:///dir/nested/spec.yaml", true},
		{"file:///dir/nested/code.ts", false},
		{"", false},
	}

	for _, tt := range tests {
		t.Run(tt.uri, func(t *testing.T) {
			got := isOpenAPIFileURI(tt.uri)
			if got != tt.want {
				t.Errorf("isOpenAPIFileURI(%q) = %v, want %v", tt.uri, got, tt.want)
			}
		})
	}
}
