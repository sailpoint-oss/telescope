package cli

import (
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/sailpoint-oss/telescope/server/config"
	telescopeoverlay "github.com/sailpoint-oss/telescope/server/overlay"
)

func newOverlayCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "overlay",
		Short: "Apply OpenAPI overlays",
	}

	var overlayPaths []string
	var outputPath string

	applyCmd := &cobra.Command{
		Use:   "apply <spec>",
		Short: "Apply one or more OpenAPI overlays to a spec",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, workspaceRoot, err := loadCommandConfig(args[0])
			if err != nil {
				return err
			}
			if len(overlayPaths) == 0 {
				for _, overlayPath := range cfg.Generation.Overlays.Files {
					overlayPaths = append(overlayPaths, config.ResolveTelescopePath(workspaceRoot, overlayPath))
				}
			}
			if !cmd.Flags().Changed("output") && strings.TrimSpace(outputPath) == "" && strings.TrimSpace(cfg.Generation.Overlays.Output) != "" {
				outputPath = config.ResolveWorkspacePath(workspaceRoot, strings.TrimSpace(cfg.Generation.Overlays.Output))
			}
			if len(overlayPaths) == 0 {
				return fmt.Errorf("at least one --overlay is required")
			}
			overlays := make([]telescopeoverlay.DocumentInput, 0, len(overlayPaths))
			for _, path := range overlayPaths {
				path = strings.TrimSpace(path)
				if path == "" {
					continue
				}
				overlays = append(overlays, telescopeoverlay.DocumentInput{Path: path})
			}
			if len(overlays) == 0 {
				return fmt.Errorf("at least one --overlay is required")
			}

			result, err := telescopeoverlay.Apply(telescopeoverlay.ApplyOptions{
				Spec:     telescopeoverlay.DocumentInput{Path: args[0]},
				Overlays: overlays,
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

	applyCmd.Flags().StringSliceVar(&overlayPaths, "overlay", nil, "Overlay file to apply (repeatable)")
	applyCmd.Flags().StringVarP(&outputPath, "output", "o", "", "Output file path (stdout if not set)")

	cmd.AddCommand(applyCmd)
	return cmd
}
