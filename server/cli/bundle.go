package cli

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"

	"github.com/sailpoint-oss/telescope/server/core/analyze"
	coreGraph "github.com/sailpoint-oss/telescope/server/core/graph"
	"github.com/sailpoint-oss/telescope/server/sdk"
)

func newBundleCmd() *cobra.Command {
	var outputPath string
	var formatFlag string

	cmd := &cobra.Command{
		Use:   "bundle [root-file]",
		Short: "Bundle a multi-file OpenAPI spec into a single document",
		Long: `Bundle resolves all $ref references in a multi-file OpenAPI spec
and produces a single self-contained document. The root file is the
entry point; all referenced files are inlined.`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			rootFile := args[0]

			w, err := sdk.New(sdk.WithBuiltinRules(false))
			if err != nil {
				return fmt.Errorf("creating workspace: %w", err)
			}
			defer w.Close()

			src := coreGraph.NewFilesystemSource(rootFile, coreGraph.ClassificationHint{IsOpenAPI: true})
			w.AddSource(src)
			uri := src.URI()

			ctx := context.Background()
			_, err = w.Analyze(ctx)
			if err != nil {
				return fmt.Errorf("analyzing: %w", err)
			}

			g := w.Graph()
			format := analyze.BundleFormatYAML
			if strings.ToLower(formatFlag) == "json" {
				format = analyze.BundleFormatJSON
			}

			result := analyze.BundlePreview(g, analyze.BundleOptions{
				RootURI: uri,
				Format:  format,
			})

			if len(result.Errors) > 0 {
				for _, e := range result.Errors {
					fmt.Fprintf(os.Stderr, "Warning: %s\n", e)
				}
			}

			order := analyze.DependencyOrder(g, uri)

			// Build merged output by inlining all referenced documents
			merged := make(map[string]any)
			for _, depURI := range order {
				node := g.Node(depURI)
				if node == nil || len(node.Raw) == 0 {
					continue
				}
				var doc map[string]any
				if err := yaml.Unmarshal(node.Raw, &doc); err != nil {
					continue
				}
				if depURI == uri {
					// Root document forms the base
					merged = doc
				} else {
					// Merge components from dependencies
					mergeComponents(merged, doc)
				}
			}

			output, err := yaml.Marshal(merged)
			if err != nil {
				return fmt.Errorf("marshaling: %w", err)
			}

			if outputPath != "" {
				return os.WriteFile(outputPath, output, 0644)
			}
			_, err = os.Stdout.Write(output)
			return err
		},
	}

	cmd.Flags().StringVarP(&outputPath, "output", "o", "", "Output file path (stdout if not set)")
	cmd.Flags().StringVarP(&formatFlag, "format", "f", "yaml", "Output format (yaml or json)")

	return cmd
}

func mergeComponents(dst, src map[string]any) {
	srcComps, ok := src["components"].(map[string]any)
	if !ok {
		return
	}

	dstComps, ok := dst["components"].(map[string]any)
	if !ok {
		dstComps = make(map[string]any)
		dst["components"] = dstComps
	}

	for kind, entries := range srcComps {
		srcEntries, ok := entries.(map[string]any)
		if !ok {
			continue
		}
		dstEntries, ok := dstComps[kind].(map[string]any)
		if !ok {
			dstEntries = make(map[string]any)
			dstComps[kind] = dstEntries
		}
		for name, val := range srcEntries {
			if _, exists := dstEntries[name]; !exists {
				dstEntries[name] = val
			}
		}
	}
}
