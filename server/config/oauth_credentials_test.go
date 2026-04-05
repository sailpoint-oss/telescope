package config

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	navigator "github.com/sailpoint-oss/navigator"
)

func TestOAuth2TokenEndpointFromSpec(t *testing.T) {
	idx := &navigator.Index{
		SecuritySchemes: map[string]*navigator.SecurityScheme{
			"oauth": {
				Type: "oauth2",
				Flows: &navigator.OAuthFlows{
					ClientCredentials: &navigator.OAuthFlow{
						TokenURL: "https://idp.example.com/token",
					},
				},
			},
		},
	}
	if u := OAuth2TokenEndpointFromSpec(idx, "oauth", ""); u != "https://idp.example.com/token" {
		t.Fatalf("got %q", u)
	}
	if u := OAuth2TokenEndpointFromSpec(idx, "oauth", "https://override.example.com/t"); u != "https://override.example.com/t" {
		t.Fatalf("override: %q", u)
	}
}

func TestResolveAndFetchCredentials_ClientCredentials(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			t.Fatalf("parse: %v", err)
		}
		if r.Form.Get("grant_type") != "client_credentials" {
			t.Fatalf("grant_type")
		}
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"access_token":"tok","expires_in":3600}`)
	}))
	defer ts.Close()

	globalOAuthCache = oauthCache{} // reset for test isolation

	ct := &ContractTestsConfig{
		Credentials: map[string]CredentialSource{
			"oauth": {
				Strategy:       "oauth2ClientCredentials",
				OAuth2TokenURL: ts.URL,
				ClientIDEnv:    "CID",
				ClientSecretEnv: "CSEC",
			},
		},
	}
	dotenv := map[string]string{
		"CID":  "id1",
		"CSEC": "sec1",
	}
	creds, err := ct.ResolveAndFetchCredentials(context.Background(), nil, nil, dotenv, ts.Client())
	if err != nil {
		t.Fatal(err)
	}
	if creds["oauth"] != "tok" {
		t.Fatalf("creds: %#v", creds)
	}
}

func TestCredentialEnvHintString(t *testing.T) {
	s := CredentialSource{AccessTokenEnv: "MY_TOKEN", ClientIDEnv: "CID"}
	h := s.CredentialEnvHintString()
	if !strings.Contains(h, "MY_TOKEN") || !strings.Contains(h, "CID") {
		t.Fatalf("hint: %s", h)
	}
}
