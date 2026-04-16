package mock

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/pb33f/libopenapi"
	"github.com/pb33f/libopenapi/datamodel"
	v3 "github.com/pb33f/libopenapi/datamodel/high/v3"
	"github.com/pb33f/libopenapi/renderer"
)

type Format string

const (
	FormatJSON Format = "json"
	FormatYAML Format = "yaml"
	FormatXML  Format = "xml"
)

type GenerateOptions struct {
	SpecPath   string
	OutputDir  string
	SchemaName string
	Format     Format
}

type Route struct {
	Method      string
	Path        string
	StatusCode  int
	ContentType string
	Body        []byte
}

type ServerOptions struct {
	SpecPath string
	Port     int
}

type Server struct {
	server *http.Server
	ln     net.Listener
	waitCh chan error
}

func Generate(opts GenerateOptions) error {
	if strings.TrimSpace(opts.SpecPath) == "" {
		return fmt.Errorf("mock: spec path is required")
	}
	if strings.TrimSpace(opts.OutputDir) == "" {
		opts.OutputDir = "./mocks"
	}
	format := normalizeFormat(opts.Format)
	if err := os.MkdirAll(opts.OutputDir, 0o755); err != nil {
		return fmt.Errorf("mock: create output dir: %w", err)
	}

	model, err := loadModel(opts.SpecPath)
	if err != nil {
		return err
	}
	if model.Components == nil || model.Components.Schemas == nil || model.Components.Schemas.Len() == 0 {
		return fmt.Errorf("mock: no component schemas available")
	}

	generator := newGenerator(format)
	wrote := 0
	for name, schemaProxy := range model.Components.Schemas.FromOldest() {
		if opts.SchemaName != "" && opts.SchemaName != name {
			continue
		}
		schema := schemaProxy.Schema()
		if schema == nil {
			continue
		}
		body, err := generator.GenerateMock(schema, "")
		if err != nil {
			return fmt.Errorf("mock: generate schema %s: %w", name, err)
		}
		if len(body) == 0 {
			continue
		}
		target := filepath.Join(opts.OutputDir, fmt.Sprintf("%s.%s", name, fileExtension(format)))
		if err := os.WriteFile(target, body, 0o644); err != nil {
			return fmt.Errorf("mock: write %s: %w", target, err)
		}
		wrote++
	}
	if wrote == 0 {
		if opts.SchemaName != "" {
			return fmt.Errorf("mock: schema %q not found", opts.SchemaName)
		}
		return fmt.Errorf("mock: no mocks generated")
	}
	return nil
}

func Serve(ctx context.Context, opts ServerOptions) (*Server, error) {
	routes, err := BuildRoutes(opts.SpecPath)
	if err != nil {
		return nil, err
	}
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for _, route := range routes {
			if route.Method != r.Method {
				continue
			}
			if !pathMatchesTemplate(route.Path, r.URL.Path) {
				continue
			}
			if route.ContentType != "" {
				w.Header().Set("Content-Type", route.ContentType)
			}
			if route.StatusCode == 0 {
				route.StatusCode = http.StatusOK
			}
			w.WriteHeader(route.StatusCode)
			if r.Method != http.MethodHead && len(route.Body) > 0 {
				_, _ = w.Write(route.Body)
			}
			return
		}
		http.NotFound(w, r)
	})

	addr := fmt.Sprintf("127.0.0.1:%d", opts.Port)
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("mock: listen: %w", err)
	}
	srv := &http.Server{Handler: handler}
	server := &Server{
		server: srv,
		ln:     ln,
		waitCh: make(chan error, 1),
	}
	go func() {
		err := srv.Serve(ln)
		if err == http.ErrServerClosed {
			err = nil
		}
		server.waitCh <- err
		close(server.waitCh)
	}()
	go func() {
		<-ctx.Done()
		_ = server.Stop(context.Background())
	}()
	return server, nil
}

func (s *Server) URL() string {
	if s == nil || s.ln == nil {
		return ""
	}
	return "http://" + s.ln.Addr().String()
}

func (s *Server) Wait() error {
	if s == nil || s.waitCh == nil {
		return nil
	}
	return <-s.waitCh
}

func (s *Server) Stop(ctx context.Context) error {
	if s == nil || s.server == nil {
		return nil
	}
	return s.server.Shutdown(ctx)
}

func BuildRoutes(specPath string) ([]Route, error) {
	model, err := loadModel(specPath)
	if err != nil {
		return nil, err
	}
	if model.Paths == nil || model.Paths.PathItems == nil {
		return nil, fmt.Errorf("mock: no paths defined")
	}

	var routes []Route
	for path, item := range model.Paths.PathItems.FromOldest() {
		for _, op := range operationsForPathItem(item) {
			statusCode, contentType, body, err := buildOperationMock(op.operation)
			if err != nil {
				return nil, fmt.Errorf("mock: build %s %s: %w", op.method, path, err)
			}
			if statusCode == 0 {
				continue
			}
			routes = append(routes, Route{
				Method:      op.method,
				Path:        path,
				StatusCode:  statusCode,
				ContentType: contentType,
				Body:        body,
			})
		}
	}
	if len(routes) == 0 {
		return nil, fmt.Errorf("mock: no mockable operations found")
	}
	return routes, nil
}

type operationRoute struct {
	method    string
	operation *v3.Operation
}

func operationsForPathItem(item *v3.PathItem) []operationRoute {
	if item == nil {
		return nil
	}
	ops := []operationRoute{
		{method: http.MethodGet, operation: item.Get},
		{method: http.MethodPut, operation: item.Put},
		{method: http.MethodPost, operation: item.Post},
		{method: http.MethodDelete, operation: item.Delete},
		{method: http.MethodPatch, operation: item.Patch},
		{method: http.MethodHead, operation: item.Head},
		{method: http.MethodOptions, operation: item.Options},
		{method: http.MethodTrace, operation: item.Trace},
	}
	out := make([]operationRoute, 0, len(ops))
	for _, op := range ops {
		if op.operation != nil {
			out = append(out, op)
		}
	}
	return out
}

func buildOperationMock(op *v3.Operation) (int, string, []byte, error) {
	if op == nil || op.Responses == nil || op.Responses.Codes == nil {
		return 0, "", nil, nil
	}
	type responseCandidate struct {
		statusCode  int
		contentType string
		mediaType   *v3.MediaType
	}
	var candidates []responseCandidate
	for code, response := range op.Responses.Codes.FromOldest() {
		if !strings.HasPrefix(code, "2") || response == nil || response.Content == nil {
			continue
		}
		statusCode := parseStatusCode(code)
		if statusCode == 0 {
			continue
		}
		for contentType, mediaType := range response.Content.FromOldest() {
			if mediaType != nil {
				candidates = append(candidates, responseCandidate{
					statusCode:  statusCode,
					contentType: contentType,
					mediaType:   mediaType,
				})
			}
		}
	}
	if len(candidates) == 0 {
		return 0, "", nil, nil
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		if candidates[i].statusCode != candidates[j].statusCode {
			return candidates[i].statusCode < candidates[j].statusCode
		}
		return mediaTypePriority(candidates[i].contentType) < mediaTypePriority(candidates[j].contentType)
	})
	chosen := candidates[0]
	generator := newGenerator(formatForMediaType(chosen.contentType))
	body, err := generator.GenerateMock(chosen.mediaType, "")
	if err != nil {
		return 0, "", nil, err
	}
	return chosen.statusCode, chosen.contentType, body, nil
}

func loadModel(specPath string) (*v3.Document, error) {
	absPath, err := filepath.Abs(specPath)
	if err != nil {
		return nil, fmt.Errorf("mock: resolve spec path: %w", err)
	}
	specBytes, err := os.ReadFile(absPath)
	if err != nil {
		return nil, fmt.Errorf("mock: read spec: %w", err)
	}
	cfg := datamodel.NewDocumentConfiguration()
	cfg.BasePath = filepath.Dir(absPath)
	cfg.SpecFilePath = filepath.Base(absPath)
	cfg.AllowFileReferences = true
	cfg.ExtractRefsSequentially = true
	doc, err := libopenapi.NewDocumentWithConfiguration(specBytes, cfg)
	if err != nil {
		return nil, fmt.Errorf("mock: parse spec: %w", err)
	}
	model, err := doc.BuildV3Model()
	if err != nil {
		return nil, fmt.Errorf("mock: build v3 model: %w", err)
	}
	return &model.Model, nil
}

func newGenerator(format Format) *renderer.MockGenerator {
	generator := renderer.NewMockGenerator(mockTypeForFormat(format))
	generator.DisableRequiredCheck()
	generator.SetSeed(1)
	if format == FormatJSON {
		generator.SetPretty()
	}
	return generator
}

func normalizeFormat(format Format) Format {
	switch strings.ToLower(string(format)) {
	case "yaml", "yml":
		return FormatYAML
	case "xml":
		return FormatXML
	default:
		return FormatJSON
	}
}

func mockTypeForFormat(format Format) renderer.MockType {
	switch normalizeFormat(format) {
	case FormatYAML:
		return renderer.YAML
	case FormatXML:
		return renderer.XML
	default:
		return renderer.JSON
	}
}

func fileExtension(format Format) string {
	switch normalizeFormat(format) {
	case FormatYAML:
		return "yaml"
	case FormatXML:
		return "xml"
	default:
		return "json"
	}
}

func formatForMediaType(contentType string) Format {
	contentType = strings.ToLower(contentType)
	switch {
	case strings.Contains(contentType, "xml"):
		return FormatXML
	case strings.Contains(contentType, "yaml"), strings.Contains(contentType, "yml"):
		return FormatYAML
	default:
		return FormatJSON
	}
}

func mediaTypePriority(contentType string) int {
	switch formatForMediaType(contentType) {
	case FormatJSON:
		return 0
	case FormatYAML:
		return 1
	case FormatXML:
		return 2
	default:
		return 3
	}
}

func parseStatusCode(code string) int {
	switch code {
	case "2XX", "2xx":
		return http.StatusOK
	default:
		var status int
		_, _ = fmt.Sscanf(code, "%d", &status)
		return status
	}
}

func pathMatchesTemplate(template, actual string) bool {
	template = strings.Trim(template, "/")
	actual = strings.Trim(actual, "/")
	if template == actual {
		return true
	}
	templateParts := splitPath(template)
	actualParts := splitPath(actual)
	if len(templateParts) != len(actualParts) {
		return false
	}
	for i := range templateParts {
		if isPathParam(templateParts[i]) {
			continue
		}
		if templateParts[i] != actualParts[i] {
			return false
		}
	}
	return true
}

func splitPath(path string) []string {
	if path == "" {
		return nil
	}
	return strings.Split(path, "/")
}

func isPathParam(segment string) bool {
	return strings.HasPrefix(segment, "{") && strings.HasSuffix(segment, "}")
}
