package config

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	navigator "github.com/sailpoint-oss/navigator"
)

// oauthCache stores short-lived OAuth access tokens for contract test runs.
type oauthCache struct {
	mu      sync.Mutex
	entries map[string]oauthCacheEntry
}

type oauthCacheEntry struct {
	token     string
	expiresAt time.Time
}

var globalOAuthCache oauthCache

func (c *oauthCache) get(key string) (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.entries[key]
	if !ok || time.Now().After(e.expiresAt) {
		return "", false
	}
	return e.token, true
}

func (c *oauthCache) set(key, token string, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.entries == nil {
		c.entries = make(map[string]oauthCacheEntry)
	}
	if ttl < 30*time.Second {
		ttl = 30 * time.Second
	}
	c.entries[key] = oauthCacheEntry{token: token, expiresAt: time.Now().Add(ttl)}
}

func cacheKey(parts ...string) string {
	h := sha256.New()
	for _, p := range parts {
		h.Write([]byte(p))
		h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil))
}

func normalizeCredentialStrategy(s string) string {
	s = strings.TrimSpace(strings.ToLower(s))
	s = strings.ReplaceAll(s, "_", "")
	switch s {
	case "oauth2clientcredentials":
		return "oauth2ClientCredentials"
	case "oauth2refresh":
		return "oauth2Refresh"
	default:
		return s
	}
}

// OAuth2TokenEndpointFromSpec returns a token URL from the OpenAPI oauth2/openIdConnect security scheme, if present.
func OAuth2TokenEndpointFromSpec(idx *navigator.Index, schemeName string, override string) string {
	if strings.TrimSpace(override) != "" {
		return strings.TrimSpace(override)
	}
	if idx == nil {
		return ""
	}
	var ss *navigator.SecurityScheme
	if idx.SecuritySchemes != nil {
		ss = idx.SecuritySchemes[schemeName]
	}
	if ss == nil && idx.Document != nil && idx.Document.Components != nil {
		ss = idx.Document.Components.SecuritySchemes[schemeName]
	}
	if ss == nil || ss.Flows == nil {
		return ""
	}
	t := strings.ToLower(strings.TrimSpace(ss.Type))
	if t != "oauth2" && t != "openidconnect" {
		return ""
	}
	if ss.Flows.ClientCredentials != nil && strings.TrimSpace(ss.Flows.ClientCredentials.TokenURL) != "" {
		return strings.TrimSpace(ss.Flows.ClientCredentials.TokenURL)
	}
	if ss.Flows.AuthorizationCode != nil {
		if u := strings.TrimSpace(ss.Flows.AuthorizationCode.RefreshURL); u != "" {
			return u
		}
		if u := strings.TrimSpace(ss.Flows.AuthorizationCode.TokenURL); u != "" {
			return u
		}
	}
	return ""
}

// ResolveAndFetchCredentials runs static credential resolution, then optional OAuth2 token exchange for strategies
// oauth2ClientCredentials and oauth2Refresh. httpClient may be nil (uses http.DefaultClient).
func (c *ContractTestsConfig) ResolveAndFetchCredentials(ctx context.Context, navIdx *navigator.Index, tokenOverrides map[string]string, dotenv map[string]string, httpClient *http.Client) (map[string]string, error) {
	base := c.ResolveContractCredentials(tokenOverrides, dotenv)
	if c == nil || len(c.Credentials) == 0 {
		return base, nil
	}
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	lookup := func(key string) string {
		return LookupEnv(dotenv, key)
	}
	out := base
	if out == nil {
		out = make(map[string]string)
	}
	for schemeName, src := range c.Credentials {
		schemeName = strings.TrimSpace(schemeName)
		if schemeName == "" {
			continue
		}
		strat := normalizeCredentialStrategy(src.Strategy)
		if strat == "" || strat == "static" {
			continue
		}
		if strings.TrimSpace(out[schemeName]) != "" {
			continue
		}
		switch strat {
		case "oauth2ClientCredentials":
			tokenURL := OAuth2TokenEndpointFromSpec(navIdx, schemeName, src.OAuth2TokenURL)
			if tokenURL == "" {
				return out, fmt.Errorf("contractTests.credentials.%s: oauth2ClientCredentials requires oauth2TokenUrl or an OpenAPI oauth2 flows.clientCredentials.tokenUrl", schemeName)
			}
			cid := strings.TrimSpace(lookup(src.ClientIDEnv))
			csec := strings.TrimSpace(lookup(src.ClientSecretEnv))
			if cid == "" || csec == "" {
				hint := src.CredentialEnvHintString()
				if hint != "" {
					return out, fmt.Errorf("contractTests.credentials.%s: oauth2ClientCredentials needs clientIdEnv and clientSecretEnv (%s)", schemeName, hint)
				}
				return out, fmt.Errorf("contractTests.credentials.%s: oauth2ClientCredentials needs clientIdEnv and clientSecretEnv", schemeName)
			}
			scope := strings.TrimSpace(strings.Join(src.OAuth2Scopes, " "))
			key := cacheKey("cc", tokenURL, cid, scope)
			if tok, ok := globalOAuthCache.get(key); ok {
				out[schemeName] = tok
				continue
			}
			tok, ttl, err := oauth2ClientCredentialsGrant(ctx, httpClient, tokenURL, cid, csec, scope)
			if err != nil {
				return out, fmt.Errorf("oauth2 client_credentials for scheme %q: %w", schemeName, err)
			}
			globalOAuthCache.set(key, tok, ttl)
			out[schemeName] = tok
		case "oauth2Refresh":
			tokenURL := OAuth2TokenEndpointFromSpec(navIdx, schemeName, src.OAuth2TokenURL)
			if tokenURL == "" {
				return out, fmt.Errorf("contractTests.credentials.%s: oauth2Refresh requires oauth2TokenUrl or an OpenAPI oauth2 flow tokenUrl / refreshUrl", schemeName)
			}
			rt := strings.TrimSpace(lookup(src.RefreshTokenEnv))
			cid := strings.TrimSpace(lookup(src.ClientIDEnv))
			csec := strings.TrimSpace(lookup(src.ClientSecretEnv))
			if rt == "" || cid == "" || csec == "" {
				hint := src.CredentialEnvHintString()
				if hint != "" {
					return out, fmt.Errorf("contractTests.credentials.%s: oauth2Refresh needs refreshTokenEnv, clientIdEnv, and clientSecretEnv (%s)", schemeName, hint)
				}
				return out, fmt.Errorf("contractTests.credentials.%s: oauth2Refresh needs refreshTokenEnv, clientIdEnv, and clientSecretEnv", schemeName)
			}
			key := cacheKey("rf", tokenURL, cid, rt)
			if tok, ok := globalOAuthCache.get(key); ok {
				out[schemeName] = tok
				continue
			}
			tok, ttl, err := oauth2RefreshGrant(ctx, httpClient, tokenURL, rt, cid, csec)
			if err != nil {
				return out, fmt.Errorf("oauth2 refresh_token for scheme %q: %w", schemeName, err)
			}
			globalOAuthCache.set(key, tok, ttl)
			out[schemeName] = tok
		}
	}
	return out, nil
}

func oauth2ClientCredentialsGrant(ctx context.Context, hc *http.Client, tokenURL, clientID, clientSecret, scope string) (string, time.Duration, error) {
	form := url.Values{}
	form.Set("grant_type", "client_credentials")
	form.Set("client_id", clientID)
	form.Set("client_secret", clientSecret)
	if scope != "" {
		form.Set("scope", scope)
	}
	return postOAuthToken(ctx, hc, tokenURL, form)
}

func oauth2RefreshGrant(ctx context.Context, hc *http.Client, tokenURL, refreshToken, clientID, clientSecret string) (string, time.Duration, error) {
	form := url.Values{}
	form.Set("grant_type", "refresh_token")
	form.Set("refresh_token", refreshToken)
	form.Set("client_id", clientID)
	form.Set("client_secret", clientSecret)
	return postOAuthToken(ctx, hc, tokenURL, form)
}

func postOAuthToken(ctx context.Context, hc *http.Client, tokenURL string, form url.Values) (string, time.Duration, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", 0, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := hc.Do(req)
	if err != nil {
		return "", 0, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", 0, err
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return "", 0, fmt.Errorf("token endpoint %s returned %s: %s", tokenURL, resp.Status, strings.TrimSpace(string(body)))
	}
	var tr struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &tr); err != nil {
		return "", 0, fmt.Errorf("decode token response: %w", err)
	}
	if strings.TrimSpace(tr.AccessToken) == "" {
		return "", 0, fmt.Errorf("token response missing access_token")
	}
	ttl := time.Duration(tr.ExpiresIn) * time.Second
	if ttl <= 0 {
		ttl = 5 * time.Minute
	}
	ttl -= 60 * time.Second
	if ttl < 30*time.Second {
		ttl = 30 * time.Second
	}
	return tr.AccessToken, ttl, nil
}
