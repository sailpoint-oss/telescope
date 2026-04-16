package cli

import (
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"

	telescopebundle "github.com/sailpoint-oss/telescope/server/bundle"
	"github.com/sailpoint-oss/telescope/server/config"
)

func newBundleCmd() *cobra.Command {
	var outputPath string
	var formatFlag string
	var modeFlag string

	cmd := &cobra.Command{
		Use:   "bundle [root-file]",
		Short: "Bundle a multi-file OpenAPI spec into a single document",
		Long: `Bundle resolves all $ref references in a multi-file OpenAPI spec
and produces a single self-contained document. The root file is the
entry point; all referenced files are bundled using libopenapi.`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, workspaceRoot, err := loadCommandConfig(args[0])
			if err != nil {
				return err
			}
			if !cmd.Flags().Changed("output") && strings.TrimSpace(cfg.Generation.Bundle.Output) != "" {
				outputPath = config.ResolveWorkspacePath(workspaceRoot, strings.TrimSpace(cfg.Generation.Bundle.Output))
			}
			result, err := telescopebundle.Bundle(telescopebundle.Options{
				RootPath: args[0],
				Mode:     telescopebundle.Mode(strings.ToLower(strings.TrimSpace(modeFlag))),
				JSON:     strings.EqualFold(formatFlag, "json"),
			})
			if err != nil {
				return err
			}
			for _, warning := range result.Warnings {
				if strings.TrimSpace(warning) != "" {
					fmt.Fprintf(os.Stderr, "Warning: %s\n", warning)
				}
			}
			if outputPath != "" {
				return os.WriteFile(outputPath, result.Content, 0o644)
			}
			_, err = os.Stdout.Write(result.Content)
			return err
		},
	}

	cmd.Flags().StringVarP(&outputPath, "output", "o", "", "Output file path (stdout if not set)")
	cmd.Flags().StringVarP(&formatFlag, "format", "f", "yaml", "Output format (yaml or json)")
	cmd.Flags().StringVar(&modeFlag, "mode", string(telescopebundle.ModeComposed), "Bundling mode (composed or inline)")

	return cmd
}
