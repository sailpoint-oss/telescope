package config

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	navigator "github.com/sailpoint-oss/navigator"
)

// ResolveAndFetchCredentials resolves contract credentials from either the v2
// testing.contract block or the legacy contractTests block, then performs any
// configured OAuth token exchange.
func (c *Config) ResolveAndFetchCredentials(ctx context.Context, navIdx *navigator.Index, tokenOverrides map[string]string, workspaceRoot string, dotenv map[string]string, httpClient *http.Client) (map[string]string, error) {
	if c == nil || !c.UsesV2Layout() || len(c.Testing.Contract.Credentials) == 0 {
		return c.ContractTests.ResolveAndFetchCredentials(ctx, navIdx, tokenOverrides, dotenv, httpClient)
	}

	base, err := c.resolveV2StaticCredentials(tokenOverrides, workspaceRoot, dotenv)
	if err != nil {
		return nil, err
	}
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	out := base
	if out == nil {
		out = make(map[string]string)
	}

	for schemeName, src := range c.Testing.Contract.Credentials {
		schemeName = strings.TrimSpace(schemeName)
		if schemeName == "" {
			continue
		}
		if strings.TrimSpace(out[schemeName]) != "" {
			continue
		}
		switch normalizeV2CredentialStrategy(src.Strategy) {
		case "", "static":
			continue
		case "oauth2ClientCredentials":
			tokenURL := OAuth2TokenEndpointFromSpec(navIdx, schemeName, src.TokenURL)
			if tokenURL == "" {
				return out, fmt.Errorf("testing.contract.credentials.%s: clientCredentials requires tokenUrl or an OpenAPI oauth2 client-credentials tokenUrl", schemeName)
			}
			clientID, err := src.ClientID.resolve(workspaceRoot, dotenv)
			if err != nil {
				return out, fmt.Errorf("testing.contract.credentials.%s.clientId: %w", schemeName, err)
			}
			clientSecret, err := src.ClientSecret.resolve(workspaceRoot, dotenv)
			if err != nil {
				return out, fmt.Errorf("testing.contract.credentials.%s.clientSecret: %w", schemeName, err)
			}
			if strings.TrimSpace(clientID) == "" || strings.TrimSpace(clientSecret) == "" {
				return out, fmt.Errorf("testing.contract.credentials.%s: clientCredentials requires clientId and clientSecret", schemeName)
			}
			scope := strings.TrimSpace(strings.Join(src.Scopes, " "))
			key := cacheKey("cc", tokenURL, clientID, scope)
			if tok, ok := globalOAuthCache.get(key); ok {
				out[schemeName] = tok
				continue
			}
			tok, ttl, err := oauth2ClientCredentialsGrant(ctx, httpClient, tokenURL, clientID, clientSecret, scope)
			if err != nil {
				return out, fmt.Errorf("oauth2 client_credentials for scheme %q: %w", schemeName, err)
			}
			globalOAuthCache.set(key, tok, ttl)
			out[schemeName] = tok
		case "oauth2Refresh":
			tokenURL := OAuth2TokenEndpointFromSpec(navIdx, schemeName, src.TokenURL)
			if tokenURL == "" {
				return out, fmt.Errorf("testing.contract.credentials.%s: refreshToken requires tokenUrl or an OpenAPI oauth2 refresh/token URL", schemeName)
			}
			refreshToken, err := src.RefreshToken.resolve(workspaceRoot, dotenv)
			if err != nil {
				return out, fmt.Errorf("testing.contract.credentials.%s.refreshToken: %w", schemeName, err)
			}
			clientID, err := src.ClientID.resolve(workspaceRoot, dotenv)
			if err != nil {
				return out, fmt.Errorf("testing.contract.credentials.%s.clientId: %w", schemeName, err)
			}
			clientSecret, err := src.ClientSecret.resolve(workspaceRoot, dotenv)
			if err != nil {
				return out, fmt.Errorf("testing.contract.credentials.%s.clientSecret: %w", schemeName, err)
			}
			if strings.TrimSpace(refreshToken) == "" || strings.TrimSpace(clientID) == "" || strings.TrimSpace(clientSecret) == "" {
				return out, fmt.Errorf("testing.contract.credentials.%s: refreshToken requires refreshToken, clientId, and clientSecret", schemeName)
			}
			key := cacheKey("rf", tokenURL, clientID, refreshToken)
			if tok, ok := globalOAuthCache.get(key); ok {
				out[schemeName] = tok
				continue
			}
			tok, ttl, err := oauth2RefreshGrant(ctx, httpClient, tokenURL, refreshToken, clientID, clientSecret)
			if err != nil {
				return out, fmt.Errorf("oauth2 refresh_token for scheme %q: %w", schemeName, err)
			}
			globalOAuthCache.set(key, tok, ttl)
			out[schemeName] = tok
		}
	}

	return out, nil
}

func (c *Config) resolveV2StaticCredentials(tokenOverrides map[string]string, workspaceRoot string, dotenv map[string]string) (map[string]string, error) {
	out := make(map[string]string)
	if c == nil {
		return mergeCredentialStrings(out, tokenOverrides), nil
	}
	for schemeName, src := range c.Testing.Contract.Credentials {
		schemeName = strings.TrimSpace(schemeName)
		if schemeName == "" {
			continue
		}
		if override := strings.TrimSpace(tokenOverrides[schemeName]); override != "" {
			out[schemeName] = override
			continue
		}
		username, err := src.Username.resolve(workspaceRoot, dotenv)
		if err != nil {
			return nil, fmt.Errorf("testing.contract.credentials.%s.username: %w", schemeName, err)
		}
		password, err := src.Password.resolve(workspaceRoot, dotenv)
		if err != nil {
			return nil, fmt.Errorf("testing.contract.credentials.%s.password: %w", schemeName, err)
		}
		if strings.TrimSpace(username) != "" && strings.TrimSpace(password) != "" {
			out[schemeName] = username + ":" + password
			continue
		}

		resolved, err := src.APIKey.resolve(workspaceRoot, dotenv)
		if err != nil {
			return nil, fmt.Errorf("testing.contract.credentials.%s.apiKey: %w", schemeName, err)
		}
		if strings.TrimSpace(resolved) != "" {
			out[schemeName] = resolved
			continue
		}
		resolved, err = src.AccessToken.resolve(workspaceRoot, dotenv)
		if err != nil {
			return nil, fmt.Errorf("testing.contract.credentials.%s.accessToken: %w", schemeName, err)
		}
		if strings.TrimSpace(resolved) != "" {
			out[schemeName] = resolved
			continue
		}
		resolved, err = src.Basic.resolve(workspaceRoot, dotenv)
		if err != nil {
			return nil, fmt.Errorf("testing.contract.credentials.%s.basic: %w", schemeName, err)
		}
		if strings.TrimSpace(resolved) != "" {
			out[schemeName] = resolved
		}
	}
	return mergeCredentialStrings(out, tokenOverrides), nil
}

func normalizeV2CredentialStrategy(raw string) string {
	s := strings.ToLower(strings.TrimSpace(raw))
	s = strings.ReplaceAll(s, "_", "")
	s = strings.ReplaceAll(s, "-", "")
	switch s {
	case "", "static":
		return "static"
	case "clientcredentials", "oauth2clientcredentials":
		return "oauth2ClientCredentials"
	case "refreshtoken", "oauth2refresh", "oauth2refreshtoken":
		return "oauth2Refresh"
	default:
		return raw
	}
}
