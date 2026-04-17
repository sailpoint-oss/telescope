package cli

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"github.com/sailpoint-oss/telescope/server/generation"
)

// newGenerateCmd returns `telescope generate`, the standalone CLI entry
// point for running cartographer-backed extraction as a reusable pipeline
// step.
//
// Behaviour mirrors the LSP-side generation loop exactly: the same Loop runs
// here, which guarantees the CLI output matches what the editor sees.
func newGenerateCmd() *cobra.Command {
	var (
		root           string
		lang           string
		output         string
		configPath     string
		sourcemapPath  string
		dryRun         bool
		watch          bool
		writeSourceMap bool
		debounceMs     int
	)

	cmd := &cobra.Command{
		Use:   "generate",
		Short: "Generate an OpenAPI spec from source code using cartographer",
		Long: `Run cartographer extraction in-process and either print, diff, or write the resulting OpenAPI spec.

Use --watch to keep the generation loop running; it re-generates on each
source-file change event the filesystem publishes, mirroring the LSP-side
behaviour.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			logger := slog.Default()
			absRoot, err := filepath.Abs(root)
			if err != nil {
				return fmt.Errorf("resolve root: %w", err)
			}
			writeMode := generation.WriteNever
			if output != "" && !dryRun {
				writeMode = generation.WriteAlways
			}
			loopCfg := generation.Config{
				Root:           absRoot,
				ConfigDir:      configPath,
				OutputPath:     output,
				Lang:           lang,
				WriteMode:      writeMode,
				WriteSourceMap: writeSourceMap,
				DebounceWindow: time.Duration(debounceMs) * time.Millisecond,
			}
			loop := generation.NewLoop(loopCfg, logger)
			ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
			defer stop()
			if err := loop.Start(ctx); err != nil {
				return fmt.Errorf("start loop: %w", err)
			}
			defer loop.Stop(500 * time.Millisecond)
			result, err := loop.RegenerateNow(ctx, generation.TriggerOnDemand)
			if err != nil {
				return fmt.Errorf("regenerate: %w", err)
			}
			if dryRun {
				_, _ = fmt.Fprintf(cmd.OutOrStdout(), "%s", string(result.SpecBytes))
			}
			if sourcemapPath != "" && result.SourceMap != nil {
				if err := result.SourceMap.WriteJSON(sourcemapPath); err != nil {
					return fmt.Errorf("write sourcemap: %w", err)
				}
			}
			if !watch {
				return nil
			}
			<-ctx.Done()
			return nil
		},
	}

	cmd.Flags().StringVar(&root, "root", ".", "Path to the repo to extract from")
	cmd.Flags().StringVar(&lang, "lang", "", "Language override (go/java/ts); auto-detected when empty")
	cmd.Flags().StringVar(&output, "output", "", "Spec output path (empty = don't write)")
	cmd.Flags().StringVar(&configPath, "config", "", "Cartographer config directory (default: <root>/.cartographer)")
	cmd.Flags().StringVar(&sourcemapPath, "sourcemap", "", "Write the SourceMap JSON to this path")
	cmd.Flags().BoolVar(&dryRun, "dry-run", false, "Print the spec to stdout instead of writing it")
	cmd.Flags().BoolVar(&watch, "watch", false, "Keep running and re-extract on source changes")
	cmd.Flags().BoolVar(&writeSourceMap, "write-sourcemap", false, "Also write an <output>.sourcemap.json sidecar")
	cmd.Flags().IntVar(&debounceMs, "debounce-ms", 500, "Idle window for watch-mode regeneration in milliseconds")
	return cmd
}
