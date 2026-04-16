package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/sailpoint-oss/barometer/pkg/barometer"
	"github.com/spf13/cobra"

	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/contractrunner"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/wiretap"
)

var contractBaseURL string
var contractWiretap bool
var contractWiretapMonitor bool
var contractWiretapBinary string

func newContractCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "contract",
		Short: "Contract testing against a live API (Barometer)",
	}
	test := &cobra.Command{
		Use:   "test <spec.yaml|arazzo.yaml>",
		Short: "Run contract tests for one OpenAPI or Arazzo document",
		Long: `Loads .telescope/config.yaml (or legacy Telescope config) from the spec's directory (or --config) for contract test
credentials and defaults, then runs Barometer synchronously. Exits 1 if any test fails.`,
		Args: cobra.ExactArgs(1),
		RunE: runContractTest,
	}
	test.Flags().StringVar(&contractBaseURL, "base-url", "", "Override API base URL (default: contractTests.defaultBaseUrl or http://localhost:8080)")
	test.Flags().BoolVar(&contractWiretap, "wiretap", false, "Enable wiretap proxy validation")
	test.Flags().BoolVar(&contractWiretapMonitor, "wiretap-monitor", false, "Open the Wiretap monitor UI in a browser")
	test.Flags().StringVar(&contractWiretapBinary, "wiretap-binary", "", "Override the wiretap binary path")
	cmd.AddCommand(test)
	return cmd
}

func runContractTest(cmd *cobra.Command, args []string) error {
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
	baseURL := cfg.EffectiveContractBaseURL(contractBaseURL)
	workspaceRoot := filepath.Dir(specPath)
	env, err := config.LoadWorkspaceDotenv(workspaceRoot, cfg.EffectiveEnvFiles())
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
	wiretapOverride := (*bool)(nil)
	if cmd.Flags().Changed("wiretap") {
		wiretapOverride = &contractWiretap
	}
	useWiretap := cfg.EffectiveWiretapEnabled(wiretapOverride)
	if contractWiretapMonitor || strings.TrimSpace(contractWiretapBinary) != "" {
		useWiretap = true
	}
	var runner *contractrunner.Runner
	var wiretapCfg config.WiretapConfig
	if useWiretap {
		wiretapCfg = ct.Wiretap
		wiretapCfg.Enabled = true
		if binary := strings.TrimSpace(contractWiretapBinary); binary != "" {
			wiretapCfg.BinaryPath = binary
		}
		runner = contractrunner.New(cfg)
		defer runner.StopWiretap()
	}

	switch idx.DocumentKind() {
	case openapi.DocumentKindOpenAPI:
		oauthCtx, oauthCancel := context.WithTimeout(context.Background(), 90*time.Second)
		defer oauthCancel()
		tokenHTTP := &http.Client{Timeout: 45 * time.Second}
		navIdx := idx.NavigatorIndex()
		if navIdx == nil {
			return fmt.Errorf("no navigator index for OpenAPI contract tests")
		}
		creds, err := cfg.ResolveAndFetchCredentials(oauthCtx, navIdx, nil, workspaceRoot, env, tokenHTTP)
		if err != nil {
			return err
		}
		if runner != nil {
			if err := runner.EnsureWiretap(ctx, workspaceRoot, specPath, baseURL, wiretapCfg); err != nil {
				return err
			}
			if contractWiretapMonitor {
				if err := openBrowserURL(runner.WiretapMonitorURL()); err != nil {
					return err
				}
			}
		}
		result, findings, err := contractrunner.RunOpenAPISync(ctx, baseURL, specPath, navIdx, creds, nil, "", clientCfg, runner)
		if err != nil {
			return err
		}
		if err := writeContractReport(os.Stdout, baseURL, result, findings, runnerMonitorURL(runner), time.Since(start)); err != nil {
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

func runnerMonitorURL(runner *contractrunner.Runner) string {
	if runner == nil {
		return ""
	}
	return strings.TrimSpace(runner.WiretapMonitorURL())
}

func writeContractReport(dst *os.File, baseURL string, result *barometer.Result, findings []wiretap.WiretapFinding, monitorURL string, elapsed time.Duration) error {
	if len(findings) == 0 && strings.TrimSpace(monitorURL) == "" {
		return barometer.WriteReport(dst, result, barometer.FormatJSON, elapsed)
	}
	payload := map[string]interface{}{
		"baseUrl": baseURL,
		"result":  result,
		"elapsed": elapsed.String(),
	}
	if len(findings) > 0 {
		payload["wiretapFindings"] = findings
	}
	if strings.TrimSpace(monitorURL) != "" {
		payload["wiretapMonitorUrl"] = strings.TrimSpace(monitorURL)
	}
	enc := json.NewEncoder(dst)
	enc.SetIndent("", "  ")
	return enc.Encode(payload)
}

func openBrowserURL(url string) error {
	url = strings.TrimSpace(url)
	if url == "" {
		return nil
	}
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	return cmd.Start()
}
