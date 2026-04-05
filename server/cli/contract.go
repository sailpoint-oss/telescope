package cli

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/sailpoint-oss/barometer/pkg/barometer"
	"github.com/spf13/cobra"

	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/contractrunner"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

var contractBaseURL string

func newContractCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "contract",
		Short: "Contract testing against a live API (Barometer)",
	}
	test := &cobra.Command{
		Use:   "test <spec.yaml|arazzo.yaml>",
		Short: "Run contract tests for one OpenAPI or Arazzo document",
		Long: `Loads .telescope.yaml from the spec's directory (or --config) for contractTests
credentials and defaults, then runs Barometer synchronously. Exits 1 if any test fails.`,
		Args: cobra.ExactArgs(1),
		RunE: runContractTest,
	}
	test.Flags().StringVar(&contractBaseURL, "base-url", "", "Override API base URL (default: contractTests.defaultBaseUrl or http://localhost:8080)")
	cmd.AddCommand(test)
	return cmd
}

func runContractTest(_ *cobra.Command, args []string) error {
	specPath, err := filepath.Abs(args[0])
	if err != nil {
		return err
	}
	data, err := os.ReadFile(specPath)
	if err != nil {
		return fmt.Errorf("read spec: %w", err)
	}

	var cfg *config.Config
	if cfgFile != "" {
		cfg, err = config.LoadFile(cfgFile)
		if err != nil {
			return err
		}
	} else {
		cfg, err = config.Load(filepath.Dir(specPath))
		if err != nil {
			return err
		}
	}

	ct := cfg.ContractTests
	baseURL := ct.EffectiveContractBaseURL(contractBaseURL)
	workspaceRoot := filepath.Dir(specPath)
	env, err := config.LoadWorkspaceDotenv(workspaceRoot, ct.EffectiveEnvFiles())
	if err != nil {
		return fmt.Errorf("load workspace .env: %w", err)
	}

	idx := openapi.ParseAndIndex(data)
	if idx == nil {
		return fmt.Errorf("could not parse %s as an API description", specPath)
	}
	if !idx.IsRootDocument() {
		return fmt.Errorf("%s must be a root OpenAPI or Arazzo document", specPath)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	start := time.Now()

	clientCfg := contractrunner.BuildBarometerClientConfig(&cfg.ContractTests, workspaceRoot)

	switch idx.DocumentKind() {
	case openapi.DocumentKindOpenAPI:
		oauthCtx, oauthCancel := context.WithTimeout(context.Background(), 90*time.Second)
		defer oauthCancel()
		tokenHTTP := &http.Client{Timeout: 45 * time.Second}
		navIdx := idx.NavigatorIndex()
		if navIdx == nil {
			return fmt.Errorf("no navigator index for OpenAPI contract tests")
		}
		creds, err := ct.ResolveAndFetchCredentials(oauthCtx, navIdx, nil, env, tokenHTTP)
		if err != nil {
			return err
		}
		result, err := contractrunner.RunOpenAPISync(ctx, baseURL, navIdx, creds, nil, "", clientCfg)
		if err != nil {
			return err
		}
		if err := barometer.WriteReport(os.Stdout, result, barometer.FormatJSON, time.Since(start)); err != nil {
			return err
		}
		if !result.Pass {
			os.Exit(1)
		}
		return nil

	case openapi.DocumentKindArazzo:
		bcfg := &barometer.Config{
			BaseURL: baseURL,
			Output:  string(barometer.FormatJSON),
			Arazzo: &barometer.ArazzoConfig{
				Doc: specPath,
			},
		}
		result, err := contractrunner.RunArazzoSync(ctx, bcfg, clientCfg)
		if err != nil {
			return err
		}
		if err := barometer.WriteReport(os.Stdout, result, barometer.FormatJSON, time.Since(start)); err != nil {
			return err
		}
		if !result.Pass {
			os.Exit(1)
		}
		return nil

	default:
		return fmt.Errorf("unsupported document kind for contract test")
	}
}
